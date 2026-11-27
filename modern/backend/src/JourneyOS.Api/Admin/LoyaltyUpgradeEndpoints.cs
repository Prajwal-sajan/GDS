using System.Text.Json;
using System.Text.Json.Nodes;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using JourneyOS.Api.Settings;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record UpgradeOfferInput(string? TargetSeat);
public sealed record UpgradeAcceptInput(bool ConsentConfirmed, string? ConsentMethod, string? ConsentReference);
public sealed record UpgradeDeclineInput(string? Reason);

/// <summary>
/// Port of legacy server/api/loyalty-upgrades-v39.js: free loyalty seat-upgrade offers within N minutes before boarding.
/// An offer never changes the seat; acceptance requires explicit operator-recorded passenger consent and is revalidated
/// against live inventory, then applied through <see cref="InventoryService.ShiftAsync"/> on the same trip.
/// </summary>
public static class LoyaltyUpgradeEndpoints
{
    private const int OfferMinutes = 5;
    private static readonly string[] Tiers = ["Silver", "Gold", "Platinum"];
    private static readonly string[] Methods = ["phone", "chat", "in_person", "authorized_provider"];
    private static GdsException Err(int s, string m) => new(s == 404 ? "BOOKING_NOT_FOUND" : s == 400 ? "VALIDATION" : "CONFLICT", m, s);

    private sealed record Ctx(Booking B, BookingPassenger P, Trip T, Route R);

    private static async Task<Ctx> Find(GdsDbContext db, InventoryService inv, long sid, string pnr, string seat)
    {
        var b = await db.Bookings.Include(x => x.Passengers).FirstOrDefaultAsync(x => x.Pnr == pnr && x.TripId == sid) ?? throw Err(404, "Booking not found on this trip");
        var p = b.Passengers.FirstOrDefault(x => x.SeatCode == seat)
            ?? b.Passengers.FirstOrDefault(x => Up(x) is { } u && (string?)u["from_seat"] == seat && (string?)u["status"] == "applied")
            ?? throw Err(404, "Passenger seat not found on this booking");
        var t = await db.Trips.FirstAsync(x => x.Id == sid);
        return new(b, p, t, await inv.LoadRouteAsync(t.RouteId));
    }
    private static JsonObject? Up(BookingPassenger p) => string.IsNullOrEmpty(p.SeatUpgradeJson) ? null : JsonNode.Parse(p.SeatUpgradeJson) as JsonObject;
    private static JsonObject? Active(BookingPassenger p, DateTime now) =>
        Up(p) is { } u && (string?)u["status"] == "offered" && DateTime.TryParse((string?)u["expires_at"], null, System.Globalization.DateTimeStyles.RoundtripKind, out var e) && e > now ? u : null;

    private static async Task<(string Tier, DateTime ValidUntil)> Eligible(GdsDbContext db, InventoryService inv, Ctx c, DateTime now)
    {
        var miles = await LegacyIam.Doc(db, "miles") as JsonObject;
        var up = await LegacyIam.Doc(db, "loyalty_upgrade_v34") as JsonObject;
        if (miles?["is_active"] is JsonValue a && a.GetValueKind() == JsonValueKind.False || up?["enabled"] is JsonValue e && e.GetValueKind() == JsonValueKind.False)
            throw Err(409, "Loyalty seat upgrades are not enabled");
        if (c.B.Status != "CONFIRMED" || c.P.Status != "CONFIRMED") throw Err(409, "Only confirmed paid active passengers qualify");
        if (c.T.Status != "active") throw Err(409, "Trip is unavailable");
        var st = c.R.Stages.FirstOrDefault(s => s.Id == c.B.BoardingStageId) ?? throw Err(409, "Boarding stage is not configured");
        var when = TripClock.ToUtc(TripClock.Local(c.T.TravelDate, st.Day, st.Time), (await inv.TenantAsync()).TimeZone);
        const int mins = 20;
        if (when <= now || (when - now).TotalMinutes > mins) throw Err(409, $"Seat upgrades are offered only within {mins} minutes before boarding");
        var cust = c.B.ContactMobile is { } m ? await db.Customers.AsNoTracking().FirstOrDefaultAsync(x => x.Phone == m) : null;
        if (cust is null || !Tiers.Contains(cust.Tier)) throw Err(409, "Passenger is not in an eligible loyalty tier");
        var until = now.AddMinutes(OfferMinutes); return (cust.Tier, until < when ? until : when);
    }
    private static int Score(CoachSeat s) =>
        (s.SeatType.Contains("sleeper", StringComparison.OrdinalIgnoreCase) ? 200 : 0)
        + (s.SeatType.Contains("sleeper", StringComparison.OrdinalIgnoreCase) && s.Deck == "LOWER" ? 50 : 0) + Math.Max(0, 30 - s.Row);

    private static async Task<List<object>> Choices(GdsDbContext db, InventoryService inv, Ctx c, DateTime now)
    {
        var orig = c.R.CoachTemplate?.Seats.FirstOrDefault(s => s.Code == c.P.SeatCode) ?? throw Err(409, "Current passenger seat does not exist on this coach");
        var reserved = (await db.BookingPassengers.AsNoTracking().Where(p => p.SeatUpgradeJson != null && p.Id != c.P.Id && db.Bookings.Any(b => b.Id == p.BookingId && b.TripId == c.T.Id)).ToListAsync())
            .Select(p => Active(p, now)).Where(u => u is not null).Select(u => (string?)u!["to_seat"]).ToHashSet();
        var bs = Score(orig);
        return (await inv.SeatStatesAsync(c.T, c.R, c.B.FromSeq, c.B.ToSeq))
            .Where(s => s.Available && Score(s.Seat) > bs && !reserved.Contains(s.Seat.Code))
            .OrderByDescending(s => Score(s.Seat))
            .Select(s => (object)new { seat = s.Seat.Code, deck = s.Seat.Deck, type = s.Seat.SeatType, row = s.Seat.Row, improvement_score = Score(s.Seat) - bs }).ToList();
    }
    private static void Audit(GdsDbContext db, HttpContext h, string op, string pnr, object data) =>
        db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = h.User.Identity?.Name ?? "system", Action = op.ToUpperInvariant(), Entity = "booking", EntityId = pnr,
            DataJson = JsonSerializer.Serialize(data), At = DateTime.UtcNow });

    public static void MapLoyaltyUpgrades(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin/trip-sheets/{sid:long}/loyalty-upgrades/{pnr}/{seat}").RequireAuthorization().WithTags("Trips");

        g.MapGet("", async (long sid, string pnr, string seat, GdsDbContext db, InventoryService inv) =>
        {
            var c = await Find(db, inv, sid, pnr, seat); var now = DateTime.UtcNow;
            List<object> options = []; string? reason = null; DateTime? expires = null;
            try { var e = await Eligible(db, inv, c, now); options = await Choices(db, inv, c, now); expires = e.ValidUntil; }
            catch (GdsException ex) { reason = ex.Message; }
            return Results.Ok(new { pnr = c.B.Pnr, current_seat = c.P.SeatCode, offer = Up(c.P), options, reason, offer_expires_at = expires, requires_passenger_consent = true });
        }).RequireAuthorization(Policies.Operations);

        g.MapPost("/offer", async (long sid, string pnr, string seat, UpgradeOfferInput i, GdsDbContext db, InventoryService inv, HttpContext h) =>
        {
            var c = await Find(db, inv, sid, pnr, seat); var now = DateTime.UtcNow;
            var e = await Eligible(db, inv, c, now);
            if (Active(c.P, now) is not null) throw Err(409, "Passenger already has an active seat-upgrade offer");
            if ((string?)Up(c.P)?["status"] == "applied") throw Err(409, "Passenger already upgraded");
            var opts = await Choices(db, inv, c, now);
            if (!opts.Any(o => (string)o.GetType().GetProperty("seat")!.GetValue(o)! == i.TargetSeat)) throw Err(409, "Selected upgrade seat is not currently eligible or available");
            var item = new JsonObject { ["status"] = "offered", ["from_seat"] = c.P.SeatCode, ["to_seat"] = i.TargetSeat, ["offered_at"] = now.ToString("O"),
                ["expires_at"] = e.ValidUntil.ToString("O"), ["loyalty_tier"] = e.Tier, ["offered_by"] = h.User.Identity?.Name ?? "Automated loyalty rule" };
            c.P.SeatUpgradeJson = item.ToJsonString();
            Audit(db, h, "loyalty_upgrade_offer", c.B.Pnr, new { from_seat = c.P.SeatCode, to_seat = i.TargetSeat, expires_at = e.ValidUntil });
            await db.SaveChangesAsync();
            return Results.Ok(new { pnr = c.B.Pnr, offer = item });
        }).RequireAuthorization(Policies.Operations);

        g.MapPost("/accept", async (long sid, string pnr, string seat, UpgradeAcceptInput i, GdsDbContext db, InventoryService inv, HttpContext h) =>
        {
            var c = await Find(db, inv, sid, pnr, seat); var now = DateTime.UtcNow;
            var a = Active(c.P, now) ?? throw Err(409, "Seat-upgrade offer is expired or not pending");
            if (!i.ConsentConfirmed) throw Err(400, "Passenger consent must be explicitly confirmed");
            var reference = (i.ConsentReference ?? "").Trim();
            if (!Methods.Contains(i.ConsentMethod) || reference.Length < 4 || reference.Length > 160) throw Err(400, "Record the consent channel and a reference of at least four characters");
            await Eligible(db, inv, c, now);
            string from = (string)a["from_seat"]!, to = (string)a["to_seat"]!;
            if (c.P.SeatCode != from) throw Err(409, "Passenger seat changed after upgrade offer");
            if (!(await Choices(db, inv, c, now)).Any(o => (string)o.GetType().GetProperty("seat")!.GetValue(o)! == to)) throw Err(409, "Upgrade seat is no longer available; offer must be reissued");
            var pid = c.P.Id;
            var seats = c.B.Passengers.Where(p => p.Status == "CONFIRMED").OrderBy(p => p.Id).Select(p => p.Id == pid ? to : p.SeatCode).ToList();
            await inv.ShiftAsync(c.B.Pnr, c.T.Id, seats, h.User.Identity?.Name ?? "system");
            var p2 = await db.BookingPassengers.FirstAsync(p => p.Id == pid);
            a["status"] = "applied"; a["applied_at"] = now.ToString("O"); a["consent_method"] = i.ConsentMethod; a["consent_reference"] = reference;
            a["applied_by"] = h.User.Identity?.Name ?? "Authorized operator";
            p2.SeatUpgradeJson = a.ToJsonString();
            Audit(db, h, "loyalty_upgrade_apply", c.B.Pnr, new { from_seat = from, to_seat = to, consent_method = i.ConsentMethod, consent_reference = reference });
            await db.SaveChangesAsync();
            return Results.Ok(new { pnr = c.B.Pnr, offer = a, new_seat = to });
        }).RequireAuthorization(Policies.Operations);

        g.MapPost("/decline", async (long sid, string pnr, string seat, UpgradeDeclineInput i, GdsDbContext db, InventoryService inv, HttpContext h) =>
        {
            var c = await Find(db, inv, sid, pnr, seat); var now = DateTime.UtcNow;
            var a = Active(c.P, now) ?? throw Err(409, "No active offer to decline");
            a["status"] = "declined"; a["declined_at"] = now.ToString("O"); a["declined_by"] = h.User.Identity?.Name ?? "Operator";
            var reason = string.IsNullOrWhiteSpace(i.Reason) ? "Passenger declined" : i.Reason.Trim(); a["reason"] = reason.Length > 160 ? reason[..160] : reason;
            c.P.SeatUpgradeJson = a.ToJsonString();
            Audit(db, h, "loyalty_upgrade_decline", c.B.Pnr, new { from_seat = (string?)a["from_seat"], to_seat = (string?)a["to_seat"] });
            await db.SaveChangesAsync();
            return Results.Ok(new { pnr = c.B.Pnr, offer = a });
        }).RequireAuthorization(Policies.Operations);
    }
}
