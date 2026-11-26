using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record TripFareInput(int FromSequence, int ToSequence, decimal Seater, decimal SleeperLower, decimal SleeperUpper);
public sealed record TripFaresInput(bool SyncWithRoute, List<TripFareInput>? Fares);

/// <summary>
/// Schedule management overlay write-paths (legacy server/api/ops.js + pnl-v18.js):
/// <list type="bullet">
/// <item><c>GET /schedules/{id}/pnl</c> — legacy <c>Rp.tripPnl</c> JSON shape (snake_case) consumed by the vendored P&amp;L editor.</item>
/// <item><c>PUT /schedules/{id}/pnl-expenses</c> — versioned route-expense overrides, funding sources and manual expenses (same validation messages).</item>
/// <item><c>GET|PUT /schedules/{id}/fares</c> — per-trip fare override (legacy <c>fare_override</c>); pricing reads it through <see cref="FareCalculator.FaresFor"/>.</item>
/// <item><c>DELETE /schedules/{id}</c> — refused while live bookings exist (legacy 409 message); otherwise the trip is withdrawn.</item>
/// </list>
/// Every mutation is audited. No figure is synthesised: commission comes from captured booking finance evidence only.
/// </summary>
public static class ScheduleManageEndpoints
{
    private const decimal MaxAmount = 100_000_000m;
    private static readonly HashSet<string> Sources = ["", "Cash", "Bank", "Office", "Driver", "Helper", "Agent", "Other"];
    private static decimal R2(decimal d) => Math.Round(d, 2, MidpointRounding.AwayFromZero);
    private static GdsException Bad(string m, int status = 400) => new(status == 404 ? "NOT_FOUND" : status == 409 ? "CONFLICT" : "VALIDATION", m, status);
    private static string Actor(HttpContext h) => h.User.Identity?.Name ?? "system";
    private static void Audit(GdsDbContext db, string actor, string action, long tripId, object data) =>
        db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = actor, Action = action, Entity = "schedule", EntityId = tripId.ToString(CultureInfo.InvariantCulture), DataJson = JsonSerializer.Serialize(data), At = DateTime.UtcNow });

    private static async Task<Trip> TripAsync(GdsDbContext db, long id) =>
        await db.Trips.FirstOrDefaultAsync(t => t.Id == id && t.DeletedAt == null) ?? throw Bad("Schedule not found", 404);

    // ---------------------------------------------------------------- P&L (legacy server/reports.js tripPnl + tripExpense)
    public static async Task<JsonObject> PnlAsync(GdsDbContext db, long id)
    {
        var s = await db.Trips.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id && t.DeletedAt == null) ?? throw Bad("Schedule not found", 404);
        var r = await db.Routes.AsNoTracking().AsSplitQuery().Include(x => x.Stops).ThenInclude(x => x.City).Include(x => x.ExpenseItems).Include(x => x.CoachTemplate).ThenInclude(c => c!.Seats)
            .FirstAsync(x => x.Id == s.RouteId);
        var tenant = await db.Tenants.AsNoTracking().FirstAsync(t => t.Id == db.CurrentTenantId);
        var running = s.Status == "active";
        var bookings = await db.Bookings.AsNoTracking().Include(b => b.Passengers).Where(b => b.TripId == id).ToListAsync();
        var bids = bookings.Select(b => b.Id).ToList();
        var fin = await db.BookingFinances.AsNoTracking().Where(f => bids.Contains(f.BookingId)).ToDictionaryAsync(f => f.BookingId);
        var cxl = await db.Cancellations.AsNoTracking().Where(c => bids.Contains(c.BookingId)).SumAsync(c => (decimal?)c.Charge) ?? 0;
        var recorded = await db.TripExpenses.AsNoTracking().Where(e => e.TripId == id).OrderBy(e => e.Id).ToListAsync();
        var asg = await db.TripAssignments.AsNoTracking().Where(a => a.TripId == id && a.IsActive).OrderBy(a => a.Id).ToListAsync();
        var vehicleId = asg.FirstOrDefault(a => a.VehicleId != null)?.VehicleId;
        var vehicle = vehicleId is null ? null : await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(v => v.Id == vehicleId);
        var staffIds = asg.Where(a => a.StaffId != null).Select(a => a.StaffId!.Value).ToList();
        var staff = await db.Staff.AsNoTracking().Where(x => staffIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);

        // Net of a booking = GST-exclusive base fare of its live passengers; commission = captured OTA commission scaled to live seats.
        var live = bookings.Where(b => b.Status != "CANCELLED").ToList();
        decimal Net(Booking b) => b.Passengers.Where(p => p.Status != "CANCELLED").Sum(p => p.BaseFare);
        decimal Comm(Booking b)
        {
            if (!fin.TryGetValue(b.Id, out var f) || f.OtaCommission is not { } c) return 0;
            var all = b.Passengers.Sum(p => p.BaseFare);
            return all == 0 ? 0 : c * Net(b) / all;
        }
        var netSales = live.Sum(Net);
        var commission = running ? R2(live.Sum(Comm)) : 0;
        var seats = live.Sum(b => b.Passengers.Count(p => p.Status != "CANCELLED"));
        var capacity = r.CoachTemplate?.Seats.Count ?? 0;

        // Expense items: route template (fixed always, running only when the trip runs) → trip overrides → manual expenses.
        var ov = recorded.Where(e => e.Kind == "override").GroupBy(e => $"{e.Type}:{e.Category}").ToDictionary(g => g.Key, g => g.Last());
        var items = new JsonArray();
        foreach (var t in r.ExpenseItems.Where(x => x.Type == "fixed" || running).OrderBy(x => x.Type == "fixed" ? 0 : 1).ThenBy(x => x.Id))
        {
            var key = $"{t.Type}:{t.Key}";
            var o = new JsonObject { ["key"] = t.Key, ["label"] = t.Label, ["type"] = t.Type, ["per_day"] = t.PerTrip, ["edit_key"] = key, ["source"] = "" };
            if (ov.TryGetValue(key, out var x)) { o["per_day"] = x.Amount; o["original"] = t.PerTrip; o["overridden"] = true; o["source"] = x.Source ?? ""; }
            items.Add(o);
        }
        foreach (var e in recorded.Where(e => e.Kind != "override" && (running || e.Type == "fixed")))
            items.Add(new JsonObject { ["id"] = e.Id, ["key"] = "manual", ["label"] = e.Category, ["type"] = e.Type == "fixed" ? "fixed" : "running", ["per_day"] = e.Amount, ["source"] = e.Source ?? "", ["manual"] = true, ["edit_key"] = $"manual:{e.Id}" });
        var itemTotal = items.Sum(i => (decimal)i!["per_day"]!);
        var expense = R2(itemTotal + commission);
        var stops = r.Stops.OrderBy(x => x.Sequence).ToList();
        var byChannel = live.GroupBy(b => b.Channel).Select(g => (JsonNode)new JsonObject
        {
            ["channel"] = g.Key, ["bookings"] = g.Count(), ["seats"] = g.Sum(b => b.Passengers.Count(p => p.Status != "CANCELLED")),
            ["net"] = R2(g.Sum(Net)), ["commission"] = R2(g.Sum(Comm)),
        }).ToArray();
        return new JsonObject
        {
            ["schedule_id"] = s.Id, ["date"] = s.TravelDate.ToString("yyyy-MM-dd"), ["departure_time"] = (s.DepartureTime ?? r.DepartureTime).ToString("HH:mm"),
            ["service"] = r.ServiceNumber, ["service_name"] = r.Name, ["route"] = $"{stops.FirstOrDefault()?.City?.Name} → {stops.LastOrDefault()?.City?.Name}",
            ["coach"] = r.CoachTemplate?.Name, ["vehicle"] = vehicle?.RegistrationNumber ?? "", ["status"] = s.Status, ["running"] = running,
            ["crew"] = new JsonArray(asg.Where(a => a.StaffId != null).Select(a => (JsonNode)new JsonObject
            {
                ["role"] = System.Text.RegularExpressions.Regex.Replace(a.Role ?? "", @"\s+\d+$", ""), ["name"] = staff.GetValueOrDefault(a.StaffId!.Value)?.Name ?? "Unassigned", ["phone"] = staff.GetValueOrDefault(a.StaffId!.Value)?.Phone,
            }).ToArray()),
            ["capacity"] = capacity, ["seats"] = seats, ["occupancy_pct"] = capacity > 0 ? R2(seats * 100m / capacity) : 0,
            ["net_sales"] = R2(netSales), ["gst"] = R2(netSales * tenant.GstPercent / 100m), ["commission"] = commission, ["cancellation_charges"] = R2(cxl),
            ["expense"] = expense, ["expense_breakdown"] = new JsonObject { ["items"] = items, ["total"] = expense, ["commission"] = commission },
            ["expense_version"] = s.PnlExpenseVersion, ["profit"] = R2(netSales + cxl - expense), ["by_channel"] = new JsonArray(byChannel),
        };
    }

    private static decimal Amount(JsonNode? v)
    {
        if (v is not JsonValue jv || jv.GetValueKind() is not (JsonValueKind.Number or JsonValueKind.String)) throw Bad("Expense amounts must be from ₹0 to ₹10 crore");
        var ok = jv.GetValueKind() == JsonValueKind.Number ? jv.TryGetValue<decimal>(out var d) : decimal.TryParse(jv.GetValue<string>(), NumberStyles.Float, CultureInfo.InvariantCulture, out d);
        if (!ok || d < 0 || d > MaxAmount || (jv.GetValueKind() == JsonValueKind.String && jv.GetValue<string>().Trim() == "")) throw Bad("Expense amounts must be from ₹0 to ₹10 crore");
        return R2(d);
    }

    public static void MapScheduleManage(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization().WithTags("Schedules");

        g.MapGet("/schedules/{id:long}/pnl", async (long id, GdsDbContext db) => Results.Text((await PnlAsync(db, id)).ToJsonString(), "application/json"))
            .RequireAuthorization(Policies.Reports);

        g.MapPut("/schedules/{id:long}/pnl-expenses", async (long id, JsonObject? body, GdsDbContext db, HttpContext h) =>
        {
            var trip = await TripAsync(db, id);
            if (trip.Status != "active") throw Bad("Expenses cannot be changed on a disabled schedule", 409);
            var input = body ?? [];
            if (input["expected_version"] is not JsonValue ev || !ev.TryGetValue<int>(out var version) || version != trip.PnlExpenseVersion)
                throw Bad("P&L changed since you opened it. Refresh before saving.", 409);
            if (input["overrides"] is not JsonObject overrides || input["sources"] is not JsonObject sources || input["manual"] is not JsonArray manual || manual.Count > 100)
                throw Bad("Invalid P&L expense payload");

            var route = await db.Routes.AsNoTracking().Include(r => r.ExpenseItems).FirstAsync(r => r.Id == trip.RouteId);
            var template = route.ExpenseItems.Where(x => x.Type == "fixed" || trip.Status == "active").ToDictionary(x => $"{x.Type}:{x.Key}");
            var newOverrides = new Dictionary<string, (decimal Amount, string Source)>();
            foreach (var (key, value) in overrides)
            {
                if (!template.ContainsKey(key)) throw Bad("Unknown route expense: " + key);
                newOverrides[key] = (Amount(value), "");
            }
            foreach (var (key, value) in sources)
            {
                var src = value is JsonValue sv && sv.TryGetValue<string>(out var str) ? str : null;
                if (!template.ContainsKey(key) || src is null || !Sources.Contains(src)) throw Bad("Invalid expense source");
                var cur = newOverrides.TryGetValue(key, out var c) ? c.Amount : template[key].PerTrip;
                newOverrides[key] = (cur, src);
            }
            var existing = await db.TripExpenses.Where(e => e.TripId == id).ToListAsync();
            var oldManual = existing.Where(e => e.Kind != "override").ToDictionary(e => e.Id);
            var seen = new HashSet<long>();
            var rows = new List<(long? Id, string Label, decimal Amount, string Type, string Source)>();
            foreach (var n in manual)
            {
                if (n is not JsonObject x || x["label"] is not JsonValue lv || !lv.TryGetValue<string>(out var label) || label.Trim().Length is 0 or > 80)
                    throw Bad("Expense description must be 1–80 characters");
                var type = x["type"] is JsonValue tv && tv.TryGetValue<string>(out var t) ? t : "";
                var source = x["source"] is JsonValue sv2 && sv2.TryGetValue<string>(out var s2) ? s2 : x["source"] is null ? "" : null;
                if (type is not ("fixed" or "running") || source is null || !Sources.Contains(source)) throw Bad("Invalid expense category/source");
                long? rid = null;
                if (x["id"] is JsonValue iv && iv.GetValueKind() != JsonValueKind.Null)
                {
                    if (!iv.TryGetValue<long>(out var l) || !oldManual.ContainsKey(l) || !seen.Add(l)) throw Bad("Unknown or duplicate manual expense");
                    rid = l;
                }
                rows.Add((rid, label.Trim(), Amount(x["amount"]), type, source));
            }

            var actor = Actor(h); var now = DateTime.UtcNow;
            // Overrides: an override row exists only where the amount or source differs from the route template.
            db.TripExpenses.RemoveRange(existing.Where(e => e.Kind == "override"));
            foreach (var (key, v) in newOverrides)
            {
                var t = template[key];
                if (v.Amount == t.PerTrip && v.Source == "") continue;
                db.TripExpenses.Add(new TripExpense { TenantId = db.CurrentTenantId, TripId = id, Kind = "override", Type = t.Type, Category = t.Key, Amount = v.Amount, Source = v.Source == "" ? null : v.Source, By = actor, At = now });
            }
            db.TripExpenses.RemoveRange(oldManual.Values.Where(e => !seen.Contains(e.Id)));
            foreach (var row in rows)
            {
                if (row.Id is { } eid) { var e = oldManual[eid]; e.Category = row.Label; e.Amount = row.Amount; e.Type = row.Type; e.Source = row.Source == "" ? null : row.Source; e.By = actor; e.At = now; }
                else db.TripExpenses.Add(new TripExpense { TenantId = db.CurrentTenantId, TripId = id, Kind = "manual", Type = row.Type, Category = row.Label, Amount = row.Amount, Source = row.Source == "" ? null : row.Source, By = actor, At = now });
            }
            trip.PnlExpenseVersion++;
            Audit(db, actor, "pnl_expenses", id, new { version = trip.PnlExpenseVersion, overrides = newOverrides.Count, manual = rows.Count });
            await db.SaveChangesAsync();
            return Results.Text((await PnlAsync(db, id)).ToJsonString(), "application/json");
        }).RequireAuthorization(Policies.Accounts);

        // ---------------------------------------------------------------- per-trip fares
        g.MapGet("/schedules/{id:long}/fares", async (long id, GdsDbContext db) =>
        {
            var trip = await db.Trips.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id && t.DeletedAt == null) ?? throw Bad("Schedule not found", 404);
            var route = await db.Routes.AsNoTracking().AsSplitQuery().Include(r => r.Stops).ThenInclude(s => s.City).Include(r => r.Fares).FirstAsync(r => r.Id == trip.RouteId);
            var names = route.Stops.ToDictionary(s => s.Sequence, s => s.City?.Name);
            object Row(RouteFare f) => new { f.FromSequence, f.ToSequence, from = names.GetValueOrDefault(f.FromSequence), to = names.GetValueOrDefault(f.ToSequence), f.Seater, f.SleeperLower, f.SleeperUpper };
            return Results.Ok(new
            {
                synced = trip.FareOverrideJson is null, changedAt = trip.FareOverrideAt,
                cities = route.Stops.OrderBy(s => s.Sequence).Select(s => new { s.Sequence, s.CityId, name = s.City?.Name }),
                fares = FareCalculator.FaresFor(route, trip).OrderBy(f => f.FromSequence).ThenBy(f => f.ToSequence).Select(Row),
                routeFares = route.Fares.OrderBy(f => f.FromSequence).ThenBy(f => f.ToSequence).Select(Row),
            });
        }).RequireAuthorization(Policies.Reports);

        g.MapPut("/schedules/{id:long}/fares", async (long id, TripFaresInput input, GdsDbContext db, HttpContext h, Operations.OperationsService ops) =>
        {
            var trip = await TripAsync(db, id);
            var route = await db.Routes.AsNoTracking().Include(r => r.Stops).Include(r => r.Fares).FirstAsync(r => r.Id == trip.RouteId);
            List<TripFare>? rows = null;
            if (!input.SyncWithRoute)
            {
                var fares = input.Fares ?? throw Bad("Fares are required");
                var seqs = route.Stops.Select(s => s.Sequence).ToHashSet();
                if (fares.Count == 0 || fares.Count > 500) throw Bad("Fares are required");
                if (fares.GroupBy(f => (f.FromSequence, f.ToSequence)).Any(x => x.Count() > 1)) throw Bad("Duplicate city pair in fares");
                foreach (var f in fares)
                {
                    if (!seqs.Contains(f.FromSequence) || !seqs.Contains(f.ToSequence) || f.FromSequence >= f.ToSequence) throw Bad("Fare city pair is not on this route");
                    if (new[] { f.Seater, f.SleeperLower, f.SleeperUpper }.Any(x => x < 0 || x > 100_000)) throw Bad("Fares must be from ₹0 to ₹1,00,000");
                    if (f.Seater <= 0 && f.SleeperLower <= 0 && f.SleeperUpper <= 0) throw Bad("Each city pair needs at least one fare above ₹0");
                }
                rows = fares.OrderBy(f => f.FromSequence).ThenBy(f => f.ToSequence).Select(f => new TripFare(f.FromSequence, f.ToSequence, R2(f.Seater), R2(f.SleeperLower), R2(f.SleeperUpper))).ToList();
            }
            db.ChangeTracker.Clear();
            await ops.SetTripFaresAsync(id, rows, Actor(h));
            return Results.Ok(new { success = true, synced = rows is null });
        }).RequireAuthorization(Policies.Operations);

        // ---------------------------------------------------------------- delete (legacy: refused while confirmed bookings exist)
        g.MapDelete("/schedules/{id:long}", async (long id, HttpContext h, Operations.OperationsService ops) =>
        {
            await ops.DeleteTripAsync(id, Actor(h));
            return Results.Ok(new { success = true });
        }).RequireAuthorization(Policies.Operations);
    }
}
