using System.Security.Claims;
using JourneyOS.Api.Crm;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Reports;
using JourneyOS.Api.Sarathi;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record LedgerInput(string ChannelKey, string Type, decimal Amount, string? Note, DateOnly? Date);
public sealed record ExpenseInput(string Category, decimal Amount, string? Note);
public sealed record ExpenseTemplateInput(string Type, string? Key, string Label, decimal PerTrip);

public static class BusinessEndpoints
{
    private static string Actor(HttpContext h) => h.User.Identity!.Name!;
    private static string Role(HttpContext h) => h.User.FindFirstValue(ClaimTypes.Role) ?? "viewer";
    /// <summary>Full phone numbers only for roles that act on them (legacy bookings.see_phone).</summary>
    private static bool SeePhone(HttpContext h) => Role(h) is "owner" or "admin" or "ops";
    /// <summary>Sarathi conversations belong to the signed-in user (or the service key name).</summary>
    private static string Owner(HttpContext h) => h.User.FindFirstValue("uid") is { } uid ? $"user:{uid}" : $"key:{Actor(h)}";

    private static (DateOnly From, DateOnly To) Range(string? from, string? to, DateOnly today)
    {
        var f = from is null ? today.AddDays(-6) : DateOnly.Parse(from);
        var t = to is null ? (from is null ? today : f.AddDays(6)) : DateOnly.Parse(to);
        return (f, t);
    }

    public static void MapBusiness(this IEndpointRouteBuilder app)
    {
        // ---------- authentication (public) ----------
        var auth = app.MapGroup("/api/auth").WithTags("Auth");
        auth.MapPost("/login", async (LoginInput i, IamService iam) =>
        {
            var (token, u, exp) = await iam.LoginAsync(i);
            return Results.Ok(new { token, expiresAt = exp, user = new { u.Id, u.Name, u.Phone, u.Role } });
        }).RequireRateLimiting("login");
        auth.MapPost("/activate", async (ActivateInput i, IamService iam) =>
        {
            var (token, u, exp) = await iam.ActivateAsync(i);
            return Results.Ok(new { token, expiresAt = exp, user = new { u.Id, u.Name, u.Phone, u.Role } });
        }).RequireRateLimiting("login");
        auth.MapPost("/logout", async (HttpContext h, IamService iam) =>
        {
            var a = h.Request.Headers.Authorization.ToString();
            if (a.StartsWith("Bearer ", StringComparison.Ordinal)) await iam.LogoutAsync(a[7..]);
            return Results.NoContent();
        });

        var g = app.MapGroup("/api/admin").RequireAuthorization().WithTags("Business");
        g.MapGet("/me", (HttpContext h) => Results.Ok(new { name = Actor(h), role = Role(h), tenant = h.User.FindFirstValue("tenant"), auth = h.User.FindFirstValue("auth"),
            phone = h.User.FindFirstValue("phone") })).RequireAuthorization(Policies.Self);

        // ---------- CRM ----------
        g.MapGet("/crm/passenger-search", async (string mode, string? q, CrmService s, HttpContext h) => Results.Ok(await s.PassengerSearchAsync(mode, q, SeePhone(h)))).RequireAuthorization(Policies.Reports); // read-only; phones masked for accounts/viewer
        g.MapGet("/crm/customers/{phone}", async (string phone, CrmService s, HttpContext h) =>
        {
            if (!SeePhone(h)) throw new GdsException("FORBIDDEN", "Customer detail by phone requires PII access", 403);
            return Results.Ok(await s.CustomerAsync(phone, true));
        }).RequireAuthorization(Policies.Crm);
        g.MapPost("/crm/customers/{phone}/notes", async (string phone, NoteInput i, CrmService s, HttpContext h) => Results.Ok(await s.AddNoteAsync(phone, i, Actor(h)))).RequireAuthorization(Policies.Crm);
        g.MapGet("/chats", async (string? filter, string? q, CrmService s) => Results.Ok(await s.ConversationsAsync(filter, q))).RequireAuthorization(Policies.Crm);
        g.MapGet("/chats/{id}", async (string id, CrmService s) => Results.Ok(await s.ConversationAsync(id))).RequireAuthorization(Policies.Crm);
        g.MapPost("/chats/{id}", async (string id, ChatSendInput i, CrmService s, HttpContext h) =>
        {
            var m = await s.SendAsync(id, i, Actor(h));
            return Results.Ok(new { message = m, delivery = "recorded", notice = "No messaging provider is connected; the message was recorded, not delivered." });
        }).RequireAuthorization(Policies.Crm);
        g.MapPost("/chats/{id}/block", async (string id, string? reason, CrmService s, HttpContext h) => Results.Ok(new { blocked = await s.ToggleBlockAsync(id, reason, Actor(h)) })).RequireAuthorization(Policies.Crm);
        g.MapGet("/calls", async (string? status, string? direction, string? q, CrmService s) => Results.Ok(await s.CallsAsync(status, direction, q))).RequireAuthorization(Policies.Crm);
        g.MapPost("/calls", async (CallInput i, CrmService s, HttpContext h) =>
            Results.Ok(new { call = await s.LogCallAsync(i, Actor(h)), notice = "Call record saved (no telephony provider connected)." })).RequireAuthorization(Policies.Crm);
        g.MapPut("/calls/{id:long}", async (long id, CallUpdate u, CrmService s) => Results.Ok(await s.UpdateCallAsync(id, u))).RequireAuthorization(Policies.Crm);
        g.MapGet("/ratings", async (int? max, string? ota, CrmService s) => Results.Ok(await s.RatingsAsync(max, ota))).RequireAuthorization(Policies.Reports);
        g.MapPost("/ratings/{id:long}/reply", async (long id, ReplyInput i, CrmService s, HttpContext h) =>
            Results.Ok(new { rating = await s.ReplyAsync(id, i, Actor(h)), notice = "Reply stored; it is not published to the OTA (no ratings API integration)." })).RequireAuthorization(Policies.Crm);
        g.MapPut("/ratings/{id:long}/follow-up", async (long id, FollowUpInput i, CrmService s, HttpContext h) => Results.Ok(await s.FollowUpAsync(id, i, Actor(h)))).RequireAuthorization(Policies.Crm);

        // ---------- reports ----------
        var rp = g.MapGroup("/reports").RequireAuthorization(Policies.Reports);
        rp.MapGet("/analytics", async (string? from, string? to, string? channel, ReportsService s) =>
        { var (f, t) = Range(from, to, await s.TodayAsync()); return Results.Ok(await s.AnalyticsAsync(f, t, channel)); });
        rp.MapGet("/daily-ops", async (string? date, ReportsService s) => Results.Ok(await s.DailyOpsAsync(date is null ? await s.TodayAsync() : DateOnly.Parse(date))));
        rp.MapGet("/cancellations", async (string? from, string? to, ReportsService s) => { var (f, t) = Range(from, to, await s.TodayAsync()); return Results.Ok(await s.CancellationsReportAsync(f, t)); });
        rp.MapGet("/no-shows", async (string? from, string? to, ReportsService s) => { var (f, t) = Range(from, to, await s.TodayAsync()); return Results.Ok(await s.NoShowsAsync(f, t)); });
        rp.MapGet("/frequent-travellers", async (string? from, string? to, int? minTrips, ReportsService s) =>
        { var today = await s.TodayAsync(); var (f, t) = Range(from ?? today.AddDays(-90).ToString("yyyy-MM-dd"), to ?? today.ToString("yyyy-MM-dd"), today); return Results.Ok(await s.FrequentTravellersAsync(f, t, minTrips ?? 2)); });
        rp.MapGet("/trip-pnl", async (string? from, string? to, ReportsService s) => { var (f, t) = Range(from, to, await s.TodayAsync()); return Results.Ok(await s.TripPnlAsync(f, t)); });
        // Accounts → Sales (legacy /accounts/analytics + /accounts/sales-facets): read-only, same audience as reports
        g.MapGet("/accounts/sales", async (string? from, string? to, string? basis, string? source, string? sector, string? service, ReportsService s) =>
        {
            var today = await s.TodayAsync();
            var (f, t) = Range(from ?? today.AddDays(-6).ToString("yyyy-MM-dd"), to ?? today.ToString("yyyy-MM-dd"), today);
            return Results.Ok(await s.SalesAsync(f, t, basis ?? "travel_date", source ?? "all", sector ?? "all", service ?? "all"));
        }).RequireAuthorization(Policies.Reports);
        g.MapGet("/accounts/sales-facets", async (ReportsService s) => Results.Ok(await s.SalesFacetsAsync())).RequireAuthorization(Policies.Reports);
        // Accounts → Transactions (legacy /accounts/transactions): bookings as credits, cancellation refunds as debits; format=csv downloads
        g.MapGet("/accounts/transactions", async (string? from, string? to, string? basis, string? source, string? service, string? q, string? format, ReportsService s) =>
        {
            var today = await s.TodayAsync();
            var (f, t) = Range(from ?? today.AddDays(-6).ToString("yyyy-MM-dd"), to ?? today.ToString("yyyy-MM-dd"), today);
            var rows = await s.TransactionsAsync(f, t, basis ?? "travel_date", source ?? "all", service ?? "all", q ?? "");
            if (format == "csv")
            {
                static string C(object? v) { var x = v switch { null => "", DateTime d => d.ToString("o"), _ => Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture) ?? "" }; return x.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{x.Replace("\"", "\"\"")}\"" : x; }
                var props = typeof(ReportsService.TxRow).GetProperties();
                var csv = string.Join(",", props.Select(p => p.Name)) + "\r\n" + string.Concat(rows.Select(r => string.Join(",", props.Select(p => C(p.GetValue(r)))) + "\r\n"));
                return Results.File(System.Text.Encoding.UTF8.GetPreamble().Concat(System.Text.Encoding.UTF8.GetBytes(csv)).ToArray(), "text/csv", $"transactions_{f:yyyy-MM-dd}_{t:yyyy-MM-dd}.csv");
            }
            var credits = rows.Where(r => r.Type == "booking").ToList();
            return Results.Ok(new
            {
                rows, services = await s.ServiceListAsync(),
                totals = new { bookings = credits.Count, credits = credits.Sum(r => r.Total), debits = rows.Sum(r => r.Refund), net = rows.Sum(r => r.Total) },
            });
        }).RequireAuthorization(Policies.Accounts);

        // trip expenses (feed P&L)
        g.MapGet("/routes/{id:long}/expense-template", async (long id, GdsDbContext db) =>
        {
            if (!await db.Routes.AnyAsync(r => r.Id == id)) throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);
            return Results.Ok(await db.Set<RouteExpenseItem>().AsNoTracking().Where(x => x.RouteId == id).OrderBy(x => x.Type).ThenByDescending(x => x.PerTrip).ToListAsync());
        }).RequireAuthorization(Policies.Reports);
        g.MapPut("/routes/{id:long}/expense-template", async (long id, List<ExpenseTemplateInput> items, GdsDbContext db, HttpContext h) =>
        {
            if (!await db.Routes.AnyAsync(r => r.Id == id)) throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);
            if (items.Count > 50 || items.Any(x => x.Type is not ("fixed" or "running") || string.IsNullOrWhiteSpace(x.Label) || x.PerTrip < 0 || x.PerTrip > 10_000_000))
                throw new GdsException("VALIDATION", "Each item needs type fixed|running, a label and a non-negative amount");
            var norm = items.Select(x => (x.Type, Key: ReportsService.ExpenseKey(x.Key ?? x.Label), Label: x.Label.Trim(), x.PerTrip)).ToList();
            if (norm.GroupBy(x => (x.Type, x.Key)).Any(g => g.Count() > 1)) throw new GdsException("VALIDATION", "Duplicate expense item");
            await using var tx = await db.Database.BeginTransactionAsync();
            db.Set<RouteExpenseItem>().RemoveRange(await db.Set<RouteExpenseItem>().Where(x => x.RouteId == id).ToListAsync());
            db.Set<RouteExpenseItem>().AddRange(norm.Select(x => new RouteExpenseItem { RouteId = id, Type = x.Type, Key = x.Key, Label = x.Label, PerTrip = x.PerTrip }));
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = Actor(h), Action = "EXPENSE_TEMPLATE_SET", Entity = "route", EntityId = id.ToString(), DataJson = System.Text.Json.JsonSerializer.Serialize(items), At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { items = norm.Count });
        }).RequireAuthorization(Policies.Operations);
        g.MapPost("/trips/{id:long}/expenses", async (long id, ExpenseInput i, GdsDbContext db, HttpContext h) =>
        {
            if (string.IsNullOrWhiteSpace(i.Category) || i.Amount < 0 || i.Amount > 10_000_000) throw new GdsException("VALIDATION", "Category and a non-negative amount are required");
            if (!await db.Trips.AnyAsync(t => t.Id == id)) throw new GdsException("SERVICE_NOT_FOUND", "Trip not found", 404);
            var e = new TripExpense { TenantId = db.CurrentTenantId, TripId = id, Category = i.Category.Trim(), Amount = i.Amount, Note = i.Note, By = Actor(h), At = DateTime.UtcNow };
            db.TripExpenses.Add(e);
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = Actor(h), Action = "EXPENSE_ADD", Entity = "trip", EntityId = id.ToString(), DataJson = System.Text.Json.JsonSerializer.Serialize(i), At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            return Results.Ok(e);
        }).RequireAuthorization(Policies.Operations);

        // ---------- accounts ledger ----------
        var ac = g.MapGroup("/accounts").RequireAuthorization(Policies.Accounts);
        ac.MapGet("/channels", async (ReportsService s) => Results.Ok(await s.ChannelsAsync()));
        ac.MapGet("/ledger", async (string channelKey, ReportsService s) => Results.Ok(await s.LedgerAsync(channelKey)));
        // Accounts → Receivables (legacy /accounts/receivables): per-channel collected / deductions / paid / receivable; format=csv downloads
        ac.MapGet("/receivables", async (string? from, string? to, string? format, ReportsService s) =>
        {
            var today = await s.TodayAsync();
            var (f, t) = Range(from ?? today.AddDays(-6).ToString("yyyy-MM-dd"), to ?? today.ToString("yyyy-MM-dd"), today);
            var rows = await s.ReceivablesAsync(f, t);
            if (format == "csv")
            {
                var props = typeof(ReportsService.ReceivableRow).GetProperties();
                static string C(object? v) { var x = Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture) ?? ""; if (x.Length > 0 && "=+-@".Contains(x[0]) && !decimal.TryParse(x, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out _)) x = "'" + x; return x.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{x.Replace("\"", "\"\"")}\"" : x; }
                var csv = string.Join(",", props.Select(p => p.Name)) + "\r\n" + string.Concat(rows.Select(r => string.Join(",", props.Select(p => C(p.GetValue(r)))) + "\r\n"));
                return Results.File(System.Text.Encoding.UTF8.GetPreamble().Concat(System.Text.Encoding.UTF8.GetBytes(csv)).ToArray(), "text/csv", $"receivables_{f:yyyy-MM-dd}_{t:yyyy-MM-dd}.csv");
            }
            decimal G(string type) => rows.Where(r => r.ChannelType == type).Sum(r => r.Receivable);
            return Results.Ok(new { from = f, to = t, summary = new { agents = G("agent"), branches = G("branch"), otas = G("ota"), @operator = G("operator") }, rows });
        });
        ac.MapPost("/ledger", async (LedgerInput i, GdsDbContext db, ReportsService s, HttpContext h) =>
        {
            await s.LedgerAsync(i.ChannelKey); // validates key format
            if (i.Type is not ("credit" or "debit")) throw new GdsException("VALIDATION", "type must be credit or debit");
            if (i.Amount <= 0 || i.Amount > 100_000_000) throw new GdsException("VALIDATION", "Amount must be positive");
            if (i.Note is { Length: > 250 }) throw new GdsException("VALIDATION", "Note must be at most 250 characters");
            var e = new LedgerEntry { TenantId = db.CurrentTenantId, ChannelKey = i.ChannelKey, ChannelType = i.ChannelKey.Split(':')[0], Type = i.Type, Amount = i.Amount,
                Note = i.Note?.Trim() ?? "", Date = i.Date ?? await s.TodayAsync(), By = Actor(h), CreatedAt = DateTime.UtcNow };
            db.LedgerEntries.Add(e);
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = Actor(h), Action = "LEDGER_ADD", Entity = "ledger", EntityId = i.ChannelKey, DataJson = System.Text.Json.JsonSerializer.Serialize(i), At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            return Results.Ok(e);
        });
        ac.MapPost("/ledger/{id:long}/void", async (long id, GdsDbContext db, HttpContext h) =>
        {
            var e = await db.LedgerEntries.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "Entry not found", 404);
            if (e.Voided) return Results.Ok(e);
            e.Voided = true; e.VoidedBy = Actor(h);
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = Actor(h), Action = "LEDGER_VOID", Entity = "ledger", EntityId = id.ToString(), At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            return Results.Ok(e);
        });
        // agents see only their own ledger (legacy accounts.own_only)
        g.MapGet("/me/ledger", async (ReportsService s, HttpContext h) =>
        {
            if (Role(h) != "agent" || h.User.FindFirstValue("phone") is not { } phone) throw new GdsException("FORBIDDEN", "Only signed-in agents have an own ledger", 403);
            return Results.Ok(await s.LedgerAsync("agent:" + phone));
        }).RequireAuthorization(Policies.Self);

        // ---------- Sarathi ----------
        var sa = g.MapGroup("/sarathi").RequireAuthorization(Policies.Reports);
        sa.MapGet("/suggestions", () => Results.Ok(SarathiService.Suggestions));
        sa.MapGet("/conversations", async (GdsDbContext db, HttpContext h) =>
        {
            var o = Owner(h);
            var list = await db.SarathiConversations.AsNoTracking().Where(c => c.Owner == o).OrderByDescending(c => c.UpdatedAt).Take(50).ToListAsync();
            return Results.Ok(list.Select(c => new { c.Id, c.Title, c.CreatedAt, c.UpdatedAt, messages = System.Text.Json.Nodes.JsonNode.Parse(c.MessagesJson) }));
        });
        sa.MapPost("/ask", async (AskInput i, SarathiService s, HttpContext h) =>
        {
            var (id, a) = await s.AskAsync(i, Owner(h));
            return Results.Ok(new { conversationId = id, answer = new { text = a.Text, table = a.Table, intent = a.Intent, period = a.Period } });
        });

        // ---------- IAM ----------
        var iam = g.MapGroup("/iam").RequireAuthorization(Policies.Iam);
        iam.MapGet("/roles", () => Results.Ok(new[]
        {
            new { role = "owner", grants = "everything, including owner management" },
            new { role = "admin", grants = "operations, accounts, CRM, reports, integrations, users (not owners)" },
            new { role = "accounts", grants = "accounts, reconciliation, ledger, reports" },
            new { role = "ops", grants = "operations, counter booking, CRM, reports" },
            new { role = "viewer", grants = "read-only reports and integration status" },
            new { role = "agent", grants = "own profile and own ledger only" },
        }));
        iam.MapGet("/users", async (GdsDbContext db) => Results.Ok(await db.Users.AsNoTracking().OrderBy(u => u.Name)
            .Select(u => new { u.Id, u.Phone, u.Name, u.Email, u.Role, u.Status, u.LegacyRole, u.CommissionPct, u.CreditLimit, hasPassword = u.PasswordHash != null, invitePendingUntil = u.InviteExpiresAt > DateTime.UtcNow ? u.InviteExpiresAt : null, u.LastLoginAt,
                locked = u.LockedUntil != null && u.LockedUntil > DateTime.UtcNow }).ToListAsync()));
        iam.MapPost("/users", async (UserInput i, IamService s, HttpContext h) => { var u = await s.SaveUserAsync(null, i, Actor(h), Role(h)); return Results.Ok(new { u.Id, u.Phone, u.Name, u.Role, u.Status }); });
        iam.MapPut("/users/{id:long}", async (long id, UserInput i, IamService s, HttpContext h) => { var u = await s.SaveUserAsync(id, i, Actor(h), Role(h)); return Results.Ok(new { u.Id, u.Phone, u.Name, u.Role, u.Status }); });
        iam.MapPost("/users/{id:long}/invite", async (long id, IamService s, HttpContext h) =>
        {
            var (code, exp) = await s.InviteAsync(id, Actor(h), Role(h));
            return Results.Ok(new { code, expiresAt = exp, notice = "Shown once. Give it to the user in person or by phone; they set their own password at sign-in → 'Activate with invite code'." });
        });
        iam.MapPost("/users/{id:long}/password", async (long id, PasswordInput i, IamService s, HttpContext h) => { await s.SetPasswordAsync(id, i.Password, Actor(h), Role(h)); return Results.NoContent(); });
        iam.MapGet("/branches", async (GdsDbContext db) => Results.Ok(await db.Branches.AsNoTracking().OrderBy(b => b.Name).ToListAsync()));
        iam.MapGet("/audit", async (string? entity, GdsDbContext db) =>
        {
            var q = db.AuditLogs.AsNoTracking().AsQueryable();
            if (!string.IsNullOrEmpty(entity)) q = q.Where(a => a.Entity == entity);
            return Results.Ok(await q.OrderByDescending(a => a.At).Take(200).ToListAsync());
        });
    }
}
