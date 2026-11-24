using System.Text.Json;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace JourneyOS.Api.Outbox;

public sealed class OutboxOptions
{
    public int BatchSize { get; set; } = 20;
    public int MaxAttempts { get; set; } = 8;
    public int LeaseSeconds { get; set; } = 120;
    public int PollMilliseconds { get; set; } = 2000;
    public int TimeoutSeconds { get; set; } = 15;
    /// <summary>Only for local mock providers. Production callbacks must be HTTPS.</summary>
    public bool AllowInsecureCallbacks { get; set; }
}

public enum DeliveryOutcome { Acknowledged, Retryable, Ambiguous, Rejected }

public sealed record DeliveryResult(DeliveryOutcome Outcome, int? HttpStatus, string? Body, string? Error);

/// <summary>Typed RedBus callback client. Acknowledgement rules follow the sample responses only.</summary>
public sealed class RedBusCallbackClient(HttpClient http)
{
    public async Task<DeliveryResult> SendAsync(string baseUrl, string actionType, string payloadJson, CancellationToken ct)
    {
        var sep = baseUrl.Contains('?') ? '&' : '?';
        var url = $"{baseUrl}{sep}action_type={Uri.EscapeDataString(actionType)}";
        try
        {
            using var content = new StringContent(payloadJson, System.Text.Encoding.UTF8, "application/json");
            using var resp = await http.PostAsync(url, content, ct);
            var body = await resp.Content.ReadAsStringAsync(ct);
            var code = (int)resp.StatusCode;
            if (resp.IsSuccessStatusCode && IsAck(actionType, body)) return new(DeliveryOutcome.Acknowledged, code, Trunc(body), null);
            if (resp.IsSuccessStatusCode) return new(DeliveryOutcome.Ambiguous, code, Trunc(body), "2xx without documented acknowledgement body");
            if (code is 408 or 429 || code >= 500) return new(DeliveryOutcome.Retryable, code, Trunc(body), null);
            return new(DeliveryOutcome.Rejected, code, Trunc(body), "Provider rejected the request");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return new(DeliveryOutcome.Ambiguous, null, null, "Timeout: provider may or may not have processed the callback");
        }
        catch (HttpRequestException ex) when (ex.HttpRequestError is HttpRequestError.ConnectionError or HttpRequestError.NameResolutionError)
        {
            return new(DeliveryOutcome.Retryable, null, null, ex.Message); // request never reached the provider
        }
        catch (HttpRequestException ex)
        {
            return new(DeliveryOutcome.Ambiguous, null, null, ex.Message);
        }
    }

    public static bool IsAck(string actionType, string body)
    {
        var trimmed = body.Trim().Trim('"');
        if (actionType == RedBusActions.ManualBusCancellation && trimmed.Equals("SUCCESS", StringComparison.OrdinalIgnoreCase)) return true;
        try
        {
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.ValueKind == JsonValueKind.Object
                   && doc.RootElement.TryGetProperty("status", out var s)
                   && s.ValueKind == JsonValueKind.String
                   && s.GetString()!.Equals("ok", StringComparison.OrdinalIgnoreCase);
        }
        catch (JsonException) { return false; }
    }

    private static string? Trunc(string? s) => s is null ? null : s.Length > 2000 ? s[..2000] : s;
}

/// <summary>Background worker delivering outbox messages with leasing, backoff and ambiguity handling.</summary>
public sealed class OutboxDispatcher(IServiceScopeFactory scopes, Microsoft.Extensions.Options.IOptions<OutboxOptions> options,
    TimeProvider clock, ILogger<OutboxDispatcher> log) : BackgroundService
{
    // Notifications whose duplicate delivery could double-refund or double-shift a customer.
    private static readonly HashSet<string> NonRepeatable = [RedBusActions.ManualBusCancellation, RedBusActions.Shift];

    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        while (!stop.IsCancellationRequested)
        {
            try
            {
                var n = await RunOnceAsync(stop);
                if (n == 0) await Task.Delay(options.Value.PollMilliseconds, stop);
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
            catch (Exception ex)
            {
                log.LogError(ex, "Outbox dispatch loop failed");
                await Task.Delay(5000, stop);
            }
        }
    }

    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var tenant = (TenantContext)scope.ServiceProvider.GetRequiredService<ITenantContext>();
        var db = scope.ServiceProvider.GetRequiredService<GdsDbContext>();
        var client = scope.ServiceProvider.GetRequiredService<RedBusCallbackClient>();
        var o = options.Value;
        var now = clock.GetUtcNow().UtcDateTime;
        var lease = now.AddSeconds(o.LeaseSeconds);

        var claimed = await db.Outbox.FromSqlInterpolated($@"
UPDATE outbox_messages SET status = 2, next_attempt_at = {lease}
WHERE id IN (
  SELECT id FROM outbox_messages
  WHERE status IN (1,2) AND next_attempt_at <= {now}
  ORDER BY id LIMIT {o.BatchSize} FOR UPDATE SKIP LOCKED)
RETURNING *").IgnoreQueryFilters().AsNoTracking().ToListAsync(ct);

        foreach (var m in claimed)
        {
            tenant.TenantId = m.TenantId;
            var provider = await db.OtaProviders.AsNoTracking().FirstOrDefaultAsync(p => p.Provider == m.Provider, ct);
            var msg = await db.Outbox.FirstAsync(x => x.Id == m.Id, ct);
            var url = provider?.CallbackUrl;
            var allowed = provider is { OutboundEnabled: true } && !string.IsNullOrWhiteSpace(url)
                          && (url!.StartsWith("https://", StringComparison.OrdinalIgnoreCase) || o.AllowInsecureCallbacks);
            if (!allowed)
            {
                // Not a delivery attempt: the provider is not verified/enabled. Keep the message pending.
                msg.Status = OutboxStatus.Pending; msg.NextAttemptAt = now.AddMinutes(5);
                msg.LastError = "Outbound delivery disabled: verified callback URL/approval not configured";
                await SaveStatusAsync(db, msg, ct);
                continue;
            }

            var result = await client.SendAsync(url!, m.ActionType, m.PayloadJson, ct);
            msg.Attempts++;
            msg.LastHttpStatus = result.HttpStatus;
            msg.LastError = result.Error;
            db.OutboxAttempts.Add(new OutboxAttempt
            {
                OutboxMessageId = msg.Id, At = clock.GetUtcNow().UtcDateTime, HttpStatus = result.HttpStatus,
                ResponseBody = result.Body, Error = result.Error, Acknowledged = result.Outcome == DeliveryOutcome.Acknowledged,
            });
            switch (result.Outcome)
            {
                case DeliveryOutcome.Acknowledged:
                    msg.Status = OutboxStatus.Acknowledged; msg.AcknowledgedAt = clock.GetUtcNow().UtcDateTime;
                    var p = await db.OtaProviders.FirstAsync(x => x.Provider == m.Provider, ct);
                    p.LastSuccessfulSyncAt = msg.AcknowledgedAt;
                    break;
                case DeliveryOutcome.Ambiguous when NonRepeatable.Contains(m.ActionType):
                    msg.Status = OutboxStatus.Blocked; // operator must reconcile with RedBus before re-sending
                    break;
                case DeliveryOutcome.Rejected:
                    msg.Status = OutboxStatus.Failed;
                    break;
                default:
                    if (msg.Attempts >= o.MaxAttempts) msg.Status = OutboxStatus.Failed;
                    else
                    {
                        msg.Status = OutboxStatus.Pending;
                        var backoff = TimeSpan.FromSeconds(Math.Min(3600, 15 * Math.Pow(2, msg.Attempts - 1)));
                        msg.NextAttemptAt = clock.GetUtcNow().UtcDateTime + backoff;
                    }
                    break;
            }
            await SaveStatusAsync(db, msg, ct);
        }
        return claimed.Count;
    }

    private async Task SaveStatusAsync(GdsDbContext db, OutboxMessage msg, CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (msg.Status == OutboxStatus.Pending && ex.InnerException is PostgresException { SqlState: "23505" })
        {
            // A newer pending message already carries this notification.
            msg.Status = OutboxStatus.Superseded;
            await db.SaveChangesAsync(ct);
        }
    }
}

/// <summary>Releases expired seat holds across all tenants (authoritative expiry lives in PostgreSQL).</summary>
public sealed class HoldExpirySweeper(IServiceScopeFactory scopes, TimeProvider clock, ILogger<HoldExpirySweeper> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        while (!stop.IsCancellationRequested)
        {
            try { await SweepAsync(stop); }
            catch (Exception ex) when (!stop.IsCancellationRequested) { log.LogError(ex, "Hold sweep failed"); }
            try { await Task.Delay(TimeSpan.FromSeconds(30), stop); } catch (OperationCanceledException) { }
        }
    }

    public async Task<int> SweepAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GdsDbContext>();
        var tenant = (TenantContext)scope.ServiceProvider.GetRequiredService<ITenantContext>();
        var now = clock.GetUtcNow().UtcDateTime;
        var trips = await db.SeatHolds.IgnoreQueryFilters()
            .Where(h => h.Status == HoldStatus.Held && h.ExpiresAt <= now)
            .Select(h => new { h.TenantId, h.TripId }).Distinct().ToListAsync(ct);
        var total = 0;
        foreach (var t in trips)
        {
            tenant.TenantId = t.TenantId;
            var inv = scope.ServiceProvider.GetRequiredService<Inventory.InventoryService>();
            total += await inv.ExpireTripHoldsAsync(t.TripId);
            await scope.ServiceProvider.GetRequiredService<Caching.IGdsCache>().BumpAsync(
                Caching.CacheKeys.TripScope(t.TenantId, t.TripId), Caching.CacheKeys.SearchScope(t.TenantId));
        }
        return total;
    }
}
