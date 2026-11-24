using JourneyOS.Api.Caching;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Outbox;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record ProviderConfigInput(string OperatorCode, string? CallbackUrl, bool OutboundEnabled);
public sealed record ResyncInput(DateOnly From, DateOnly To);
public sealed record ShiftInput(long TripId, List<string> Seats);
public sealed record BoardingInput(string Seat, string Status);

public static class AdminEndpoints
{
    public static void MapAdmin(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization().WithTags("Admin");
        var rb = g.MapGroup("/integrations/redbus");

        rb.MapGet("/status", async (GdsDbContext db, IGdsCache cache) =>
        {
            var p = await db.OtaProviders.AsNoTracking().FirstOrDefaultAsync(x => x.Provider == "REDBUS");
            var counts = await db.Outbox.Where(m => m.Provider == "REDBUS").GroupBy(m => m.Status)
                .Select(x => new { status = x.Key, count = x.Count() }).ToListAsync();
            var byAction = await db.Outbox.Where(m => m.Provider == "REDBUS").GroupBy(m => new { m.ActionType, m.Status })
                .Select(x => new { x.Key.ActionType, x.Key.Status, count = x.Count(), last = x.Max(m => m.CreatedAt) }).ToListAsync();
            var published = await db.OtaInventories.CountAsync();
            var bookings = await db.Bookings.Where(b => b.Channel == "redbus").GroupBy(b => b.Status).Select(x => new { status = x.Key, count = x.Count() }).ToListAsync();
            return Results.Ok(new
            {
                configured = p is not null,
                operatorCode = p?.OperatorCode,
                callbackHost = p?.CallbackUrl is { } u && Uri.TryCreate(u, UriKind.Absolute, out var uri) ? uri.Host : null, // never expose full URL/credentials
                outboundEnabled = p?.OutboundEnabled ?? false,
                lastSuccessfulSyncAt = p?.LastSuccessfulSyncAt,
                outbox = counts.Select(c => new { status = c.status.ToString(), c.count }),
                actions = byAction.Select(a => new { a.ActionType, status = a.Status.ToString(), a.count, a.last }),
                publishedInventories = published,
                bookings,
                redisConnected = cache.IsConnected,
                verification = "Mock-provider tested only. Not RedBus-certified until sandbox acceptance is recorded.",
            });
        }).RequireAuthorization(Policies.IntegrationRead);

        rb.MapGet("/outbox", async (GdsDbContext db, string? status, int? take) =>
        {
            var q = db.Outbox.AsNoTracking().Where(m => m.Provider == "REDBUS");
            if (Enum.TryParse<OutboxStatus>(status, true, out var s)) q = q.Where(m => m.Status == s);
            var rows = await q.OrderByDescending(m => m.Id).Take(Math.Clamp(take ?? 100, 1, 500)).ToListAsync();
            return Results.Ok(rows.Select(m => new { m.Id, m.ActionType, m.DedupKey, status = m.Status.ToString(), m.Attempts, m.LastHttpStatus, m.LastError, m.CreatedAt, m.NextAttemptAt, m.AcknowledgedAt, m.PayloadJson }));
        }).RequireAuthorization(Policies.IntegrationRead);

        rb.MapGet("/outbox/{id:long}/attempts", async (long id, GdsDbContext db) =>
        {
            if (!await db.Outbox.AnyAsync(m => m.Id == id)) return Results.NotFound(); // tenant-filtered
            return Results.Ok(await db.OutboxAttempts.AsNoTracking().Where(a => a.OutboxMessageId == id).OrderBy(a => a.Id).ToListAsync());
        }).RequireAuthorization(Policies.IntegrationRead);

        rb.MapPost("/outbox/{id:long}/retry", async (long id, GdsDbContext db, TimeProvider clock, HttpContext http) =>
        {
            var m = await db.Outbox.FirstOrDefaultAsync(x => x.Id == id);
            if (m is null) return Results.NotFound();
            if (m.Status is not (OutboxStatus.Failed or OutboxStatus.Blocked))
                return Results.Conflict(new { message = "Only Failed or Blocked messages can be retried" });
            m.Status = OutboxStatus.Pending; m.NextAttemptAt = clock.GetUtcNow().UtcDateTime; m.LastError = null;
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = http.User.Identity!.Name!, Action = "OUTBOX_RETRY", Entity = "outbox", EntityId = id.ToString(), At = clock.GetUtcNow().UtcDateTime });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) { return Results.Conflict(new { message = "A newer pending message already exists for this notification" }); }
            return Results.Ok();
        }).RequireAuthorization(Policies.IntegrationWrite);

        rb.MapPut("/config", async (ProviderConfigInput input, GdsDbContext db, TimeProvider clock, HttpContext http) =>
        {
            if (string.IsNullOrWhiteSpace(input.OperatorCode)) return Results.BadRequest(new { message = "operatorCode is required" });
            if (input.CallbackUrl is { Length: > 0 } u && !Uri.TryCreate(u, UriKind.Absolute, out _)) return Results.BadRequest(new { message = "callbackUrl is invalid" });
            var p = await db.OtaProviders.FirstOrDefaultAsync(x => x.Provider == "REDBUS");
            if (p is null) { p = new OtaProviderConfig { TenantId = db.CurrentTenantId, Provider = "REDBUS" }; db.OtaProviders.Add(p); }
            p.OperatorCode = input.OperatorCode.Trim(); p.CallbackUrl = string.IsNullOrWhiteSpace(input.CallbackUrl) ? null : input.CallbackUrl.Trim();
            p.OutboundEnabled = input.OutboundEnabled && p.CallbackUrl is not null;
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = http.User.Identity!.Name!, Action = "REDBUS_CONFIG", Entity = "ota_provider", EntityId = "REDBUS",
                DataJson = System.Text.Json.JsonSerializer.Serialize(new { p.OperatorCode, p.OutboundEnabled, callbackHost = p.CallbackUrl is null ? null : new Uri(p.CallbackUrl).Host }), At = clock.GetUtcNow().UtcDateTime });
            await db.SaveChangesAsync();
            return Results.Ok(new { p.OperatorCode, p.OutboundEnabled });
        }).RequireAuthorization(Policies.IntegrationWrite);

        rb.MapPost("/resync", async (ResyncInput input, GdsDbContext db, RedBusNotifier notifier, TimeProvider clock, HttpContext http) =>
        {
            if (input.To < input.From || input.To.DayNumber - input.From.DayNumber > 62) return Results.BadRequest(new { message = "Range must be 0–62 days" });
            var routes = await db.Routes.AsNoTracking().Where(r => r.Status == "active").Include(r => r.Stops).ThenInclude(s => s.City).Include(r => r.Fares).ToListAsync();
            var pairs = new HashSet<(long, long)>();
            var cityPairs = new List<(City, City)>();
            var searches = 0;
            await using var tx = await db.Database.BeginTransactionAsync();
            foreach (var r in routes)
            {
                var trips = await db.Trips.AsNoTracking().Where(t => t.RouteId == r.Id && t.Status == "active" && t.TravelDate >= input.From.AddDays(-3) && t.TravelDate <= input.To).ToListAsync();
                foreach (var f in r.Fares)
                {
                    var s = r.Stops.Single(x => x.Sequence == f.FromSequence); var d = r.Stops.Single(x => x.Sequence == f.ToSequence);
                    if (pairs.Add((s.CityId, d.CityId))) cityPairs.Add((s.City!, d.City!));
                    foreach (var doj in trips.Select(t => t.TravelDate.AddDays(s.Day - 1)).Where(x => x >= input.From && x <= input.To).Distinct())
                    { await notifier.SearchChangedAsync(s.CityId, d.CityId, doj); searches++; }
                }
            }
            await notifier.NewCitySdAsync(cityPairs, $"resync:{clock.GetUtcNow():yyyyMMddHHmmss}");
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = http.User.Identity!.Name!, Action = "REDBUS_RESYNC", Entity = "ota_provider", EntityId = "REDBUS", DataJson = $"{{\"searches\":{searches}}}", At = clock.GetUtcNow().UtcDateTime });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { sourceDestinations = cityPairs.Count, searchEvents = searches });
        }).RequireAuthorization(Policies.IntegrationWrite);

        // ---- operations ----
        g.MapGet("/trips", async (DateOnly date, GdsDbContext db) =>
        {
            var trips = await db.Trips.AsNoTracking().Where(t => t.TravelDate == date).Include(t => t.Route).OrderBy(t => t.Route!.DepartureTime).ToListAsync();
            var ids = trips.Select(t => t.Id).ToList();
            var booked = await db.SeatAllocations.AsNoTracking().Where(a => ids.Contains(a.TripId) && a.IsActive)
                .GroupBy(a => new { a.TripId, a.Kind }).Select(x => new { x.Key.TripId, x.Key.Kind, n = x.Count() }).ToListAsync();
            return Results.Ok(trips.Select(t => new
            {
                t.Id, t.TravelDate, t.Status, t.Bookable, routeId = t.RouteId, service = t.Route!.ServiceNumber, name = t.Route.Name, departure = t.Route.DepartureTime,
                booked = booked.Where(b => b.TripId == t.Id && b.Kind == AllocationKind.Booked).Sum(b => b.n),
                held = booked.Where(b => b.TripId == t.Id && b.Kind == AllocationKind.Hold).Sum(b => b.n),
                blocked = booked.Where(b => b.TripId == t.Id && b.Kind == AllocationKind.Blocked).Sum(b => b.n),
            }));
        }).RequireAuthorization(Policies.Operations);

        g.MapPost("/trips/{id:long}/cancel", async (long id, InventoryService inv, HttpContext http) =>
            Results.Ok(new { cancelledBookings = await inv.CancelTripAsync(id, http.User.Identity!.Name!) }))
            .RequireAuthorization(Policies.Operations);

        g.MapPost("/bookings/{pnr}/shift", async (string pnr, ShiftInput input, InventoryService inv, HttpContext http) =>
        {
            var b = await inv.ShiftAsync(pnr, input.TripId, input.Seats, http.User.Identity!.Name!);
            return Results.Ok(new { b.Pnr, b.TripId, seats = b.Passengers.Where(p => p.Status == "CONFIRMED").Select(p => p.SeatCode) });
        }).RequireAuthorization(Policies.Operations);

        g.MapPost("/bookings/{pnr}/boarding", async (string pnr, BoardingInput input, InventoryService inv, HttpContext http) =>
        {
            await inv.SetBoardingStatusAsync(pnr, input.Seat, input.Status, http.User.Identity!.Name!);
            return Results.Ok();
        }).RequireAuthorization(Policies.Operations);
    }
}
