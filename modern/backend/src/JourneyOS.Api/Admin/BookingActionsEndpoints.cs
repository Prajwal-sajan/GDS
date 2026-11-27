using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record BookingContactInput(string? Name, string? Phone, string? Email);
public sealed record BookingPaxInput(string? Seat, string? Name, int? Age, string? Gender);
public sealed record BookingEditInput(BookingContactInput? Contact, List<BookingPaxInput>? Passengers, long? BoardingStageId, long? DroppingStageId);
public sealed record BookingCommentInput(string? Text);
public sealed record BookingShiftInput(long? ScheduleId, Dictionary<string, string>? SeatMap);

/// <summary>
/// CRM booking workspace actions (legacy server/api/ops.js PUT /bookings/:pnr, POST /bookings/:pnr/comments,
/// GET /bookings/:pnr/refund-quote and server/api/booking-workspace-v38.js history / shift-options / shift-seats / shift).
/// Same validation messages as legacy. Every write is audited (Entity "booking", EntityId = PNR) and feeds the history.
/// </summary>
public static partial class BookingActionsEndpoints
{
    [GeneratedRegex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$")] private static partial Regex EmailRx();
    private static GdsException Bad(string m, int status = 400) => new(status switch { 404 => "BOOKING_NOT_FOUND", 409 => "CONFLICT", _ => "VALIDATION" }, m, status);
    private static string Actor(HttpContext h) => h.User.Identity?.Name ?? "system";
    private static void Audit(GdsDbContext db, string actor, string op, string pnr, object data) =>
        db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = actor, Action = op.ToUpperInvariant(), Entity = "booking", EntityId = pnr,
            DataJson = JsonSerializer.Serialize(data), At = DateTime.UtcNow });

    private static async Task<Booking> Need(GdsDbContext db, string pnr, bool track = false)
    {
        var key = pnr.Trim();
        var q = db.Bookings.Include(b => b.Passengers).AsQueryable();
        if (!track) q = q.AsNoTracking();
        return await q.FirstOrDefaultAsync(b => b.Pnr == key || (key.Length == 6 && b.Pnr.EndsWith(key))) ?? throw Bad("Booking not found", 404);
    }
    private static string Gender(string? g) => (g ?? "").Trim().ToUpperInvariant() switch { "FEMALE" or "F" => "F", "MALE" or "M" => "M", "OTHER" or "O" => "O", var x => x };

    public static void MapBookingActions(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin/bookings").RequireAuthorization().WithTags("Bookings");

        // ------------------------------------------------ refund quote (legacy D.refundFor)
        g.MapGet("/{pnr}/refund-quote", async (string pnr, string? by, GdsDbContext db, InventoryService inv) =>
        {
            var b = await Need(db, pnr);
            var trip = await db.Trips.AsNoTracking().FirstAsync(t => t.Id == b.TripId);
            var route = await inv.LoadRouteAsync(trip.RouteId);
            var tz = (await inv.TenantAsync()).TimeZone;
            var bp = route.Stages.First(s => s.Id == b.BoardingStageId);
            var hrs = (TripClock.ToUtc(TripClock.Local(trip.TravelDate, bp.Day, bp.Time), tz) - DateTime.UtcNow).TotalHours;
            var pct = by == "operator" ? 100m : 100m - CancellationPolicy.ChargePercent(b.CancellationPolicy, hrs);
            var paid = b.Passengers.Where(p => p.Status == "CONFIRMED").Sum(p => p.Fare);
            return Results.Ok(new { refund_pct = pct, paid, refund = Math.Round(paid * pct / 100m, 2), hours_before = Math.Round(hrs, 1),
                cancellation_allowed = JourneyOS.Api.Operations.RouteSettings.CancellationAllowed(route.SettingsJson) is not false });
        }).RequireAuthorization(Policies.Operations);

        // ------------------------------------------------ ticket edit (legacy PUT /bookings/:pnr)
        g.MapPut("/{pnr}", async (string pnr, BookingEditInput i, GdsDbContext db, InventoryService inv, HttpContext h) =>
        {
            var b = await Need(db, pnr, track: true);
            if (b.Status == "CANCELLED") throw Bad("Only confirmed tickets may be edited", 409);
            var fields = new List<string>();
            if (i.Contact is { } c)
            {
                var name = (c.Name ?? "").Trim(); var phone = (c.Phone ?? "").Trim(); var email = (c.Email ?? "").Trim();
                if (name.Length is 0 or > 120) throw Bad("Contact name is required (maximum 120 characters)");
                if (!Regex.IsMatch(phone, @"^\d{10}$")) throw Bad("Mobile must contain 10 digits");
                if (email.Length > 254 || (email.Length > 0 && !EmailRx().IsMatch(email))) throw Bad("Enter a valid email address");
                b.ContactName = name; b.ContactMobile = phone; b.ContactEmail = email.Length == 0 ? null : email;
                var primary = b.Passengers.FirstOrDefault(p => p.IsPrimary);
                if (primary is not null) { primary.Mobile = phone; primary.Email = b.ContactEmail; }
                fields.Add("Contact & Journey Details");
            }
            if (i.Passengers is { } ps)
            {
                if (ps.Count == 0 || ps.Count > b.Passengers.Count) throw Bad("Provide valid passenger seat records");
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var p in ps)
                {
                    var seat = (p.Seat ?? "").Trim();
                    if (!seen.Add(seat)) throw Bad("Duplicate passenger seat");
                    var ex = b.Passengers.FirstOrDefault(x => string.Equals(x.SeatCode, seat, StringComparison.OrdinalIgnoreCase)) ?? throw Bad("Seat does not belong to this PNR");
                    if (ex.Status == "CANCELLED")
                    {
                        if (p.Name is not null && p.Name != ex.Name) throw Bad("Cancelled passenger records cannot be edited");
                        continue;
                    }
                    var name = (p.Name ?? ex.Name).Trim(); var age = p.Age ?? ex.Age; var gender = Gender(p.Gender ?? ex.Gender);
                    if (name.Length is 0 or > 120 || age is < 1 or > 120 || gender is not ("M" or "F" or "O"))
                        throw Bad("Each passenger needs a name, age 1–120 and gender M/F/O");
                    ex.Name = name; ex.Age = age; ex.Gender = gender;
                }
                fields.Add("Passenger Information");
            }
            if (i.BoardingStageId is not null || i.DroppingStageId is not null)
            {
                await db.SaveChangesAsync();
                await inv.UpdateAsync(b.Pnr, null, i.BoardingStageId, i.DroppingStageId);
                fields.Add("Pickup / drop point");
            }
            if (fields.Count == 0) throw Bad("Nothing to update");
            Audit(db, Actor(h), "edit", b.Pnr, new { op = "edit", fields });
            await db.SaveChangesAsync();
            await inv.InvalidateTripAsync(b.TripId);
            return Results.Ok(new { success = true, pnr = b.Pnr, fields });
        }).RequireAuthorization(Policies.Operations);

        // ------------------------------------------------ staff-only comments (legacy POST /bookings/:pnr/comments)
        g.MapPost("/{pnr}/comments", async (string pnr, BookingCommentInput i, GdsDbContext db, HttpContext h) =>
        {
            var b = await Need(db, pnr);
            var text = (i.Text ?? "").Trim();
            if (text.Length is 0 or > 1000) throw Bad("Enter a staff-only comment (maximum 1000 characters)");
            var by = h.User.FindFirst("name")?.Value ?? Actor(h);
            db.BookingComments.Add(new BookingComment { TenantId = db.CurrentTenantId, BookingId = b.Id, Text = text, By = by.Length > 120 ? by[..120] : by, At = DateTime.UtcNow });
            Audit(db, Actor(h), "comment", b.Pnr, new { op = "comment" });
            await db.SaveChangesAsync();
            var all = await db.BookingComments.AsNoTracking().Where(x => x.BookingId == b.Id).OrderBy(x => x.At).Select(x => new { x.Text, x.By, x.At }).ToListAsync();
            return Results.Ok(all);
        }).RequireAuthorization(Policies.Operations);

        // ------------------------------------------------ ticket history (legacy booking-workspace-v38 /history)
        g.MapGet("/{pnr}/history", async (string pnr, GdsDbContext db) =>
        {
            var b = await Need(db, pnr);
            var titles = new Dictionary<string, string> { ["SHIFT"] = "Passenger Shifted", ["EDIT"] = "Booking Updated", ["UPDATE"] = "Booking Updated", ["CANCEL"] = "Ticket Cancelled",
                ["COMMENT"] = "Comment Added", ["CONFIRM"] = "Booking Confirmed", ["BOARDING"] = "Boarding Status Updated", ["PAYMENT"] = "Payment Updated" };
            var events = new List<object> { new { id = "created", kind = "created", title = "Booking Created", at = b.DateOfIssue, actor = b.BookedBy ?? b.Channel, source = b.Channel,
                details = new[] { new { label = "PNR", value = b.Pnr }, new { label = "Status at booking", value = "confirmed" } } } };
            var audits = await db.AuditLogs.AsNoTracking().Where(a => a.Entity == "booking" && a.EntityId == b.Pnr && a.Action != "CONFIRM").OrderBy(a => a.At).ToListAsync();
            foreach (var a in audits)
            {
                var details = new List<object>();
                try
                {
                    using var doc = JsonDocument.Parse(a.DataJson ?? "{}");
                    var r = doc.RootElement;
                    string J(JsonElement e) => e.ValueKind == JsonValueKind.Array ? string.Join(", ", e.EnumerateArray().Select(x => x.ToString())) : e.ToString();
                    if (r.TryGetProperty("newTripId", out var nt)) details.Add(new { label = "Target trip", value = nt.ToString() });
                    if (r.TryGetProperty("oldSeats", out var os) && r.TryGetProperty("newSeats", out var ns))
                        details.Add(new { label = "Seat changes", value = string.Join(", ", os.EnumerateArray().Zip(ns.EnumerateArray()).Select(z => $"{z.First} → {z.Second}")) });
                    else if (r.TryGetProperty("seats", out var se)) details.Add(new { label = "Seats", value = J(se) });
                    if (r.TryGetProperty("fields", out var fs)) details.Add(new { label = "Fields updated", value = J(fs) });
                    if (r.TryGetProperty("refund", out var rf)) details.Add(new { label = "Refund", value = rf.ToString() });
                    if (r.TryGetProperty("seat", out var st) && r.TryGetProperty("status", out var ss)) details.Add(new { label = $"Seat {st}", value = ss.ToString() });
                }
                catch (JsonException) { }
                events.Add(new { id = $"audit-{a.Id}", kind = a.Action.ToLowerInvariant(), title = titles.GetValueOrDefault(a.Action, "Booking Change"), at = a.At, actor = a.Actor, source = "GDS", details });
            }
            if (b.Status == "CANCELLED" && b.DateOfCancellation is { } dc && !audits.Any(a => a.Action == "CANCEL"))
                events.Add(new { id = "cancelled", kind = "cancel", title = "Ticket Cancelled", at = dc, actor = "Recorded booking state", source = b.Channel, details = Array.Empty<object>() });
            return Results.Ok(new { pnr = b.Pnr, ticket_number = b.Pnr.Length > 6 ? b.Pnr[^6..] : b.Pnr,
                events = events.OrderByDescending(e => (DateTime)e.GetType().GetProperty("at")!.GetValue(e)!) });
        }).RequireAuthorization(Policies.Reports);

        // ------------------------------------------------ guided shift: services on a date (legacy /shift-options)
        g.MapGet("/{pnr}/shift-options", async (string pnr, string? date, GdsDbContext db, InventoryService inv) =>
        {
            var b = await Need(db, pnr);
            if (b.Status != "CONFIRMED") throw Bad("Only confirmed bookings can be shifted", 409);
            var oldTrip = await db.Trips.AsNoTracking().FirstAsync(t => t.Id == b.TripId);
            var oldRoute = await inv.LoadRouteAsync(oldTrip.RouteId);
            if (!DateOnly.TryParseExact(date ?? oldTrip.TravelDate.ToString("yyyy-MM-dd"), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) throw Bad("Date must be YYYY-MM-DD");
            var tz = (await inv.TenantAsync()).TimeZone;
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById(tz)));
            if (d < today || d > today.AddDays(120)) throw Bad("Choose a date within the next 120 days");
            long oCity = oldRoute.Stops.Single(s => s.Sequence == b.FromSeq).CityId, dCity = oldRoute.Stops.Single(s => s.Sequence == b.ToSeq).CityId;
            var trips = await db.Trips.AsNoTracking().Where(t => t.TravelDate == d && t.Status == "active" && t.Bookable && t.DeletedAt == null).ToListAsync();
            var services = new List<object>();
            foreach (var t in trips)
            {
                var r = t.RouteId == oldRoute.Id ? oldRoute : await inv.LoadRouteAsync(t.RouteId);
                var f = r.Stops.FirstOrDefault(s => s.CityId == oCity); var to = f is null ? null : r.Stops.FirstOrDefault(s => s.CityId == dCity && s.Sequence > f.Sequence);
                if (f is null || to is null || r.CoachTemplate is null) continue;
                var free = (await inv.SeatStatesAsync(t, r, f.Sequence, to.Sequence)).Count(s => s.Available);
                services.Add(new { id = t.Id, route_id = r.Id, service = r.ServiceNumber, name = string.IsNullOrEmpty(r.Name) ? r.ServiceNumber : r.Name,
                    departure_time = (t.DepartureTime ?? r.DepartureTime).ToString("HH:mm"), travel_date = t.TravelDate, free_seats = free });
            }
            return Results.Ok(new { date = d, booking_pnr = b.Pnr, services = services.OrderBy(x => (string)x.GetType().GetProperty("departure_time")!.GetValue(x)!) });
        }).RequireAuthorization(Policies.Operations);

        // ------------------------------------------------ guided shift: free seats on the target (legacy /shift-seats)
        g.MapGet("/{pnr}/shift-seats", async (string pnr, long? schedule_id, GdsDbContext db, InventoryService inv) =>
        {
            var b = await Need(db, pnr);
            if (b.Status != "CONFIRMED") throw Bad("Only confirmed bookings can be shifted", 409);
            if (schedule_id is null) throw Bad("Choose a target service");
            var t = await db.Trips.AsNoTracking().FirstOrDefaultAsync(x => x.Id == schedule_id && x.DeletedAt == null) ?? throw Bad("Choose a target service");
            var oldTrip = await db.Trips.AsNoTracking().FirstAsync(x => x.Id == b.TripId);
            var oldRoute = await inv.LoadRouteAsync(oldTrip.RouteId);
            var r = await inv.LoadRouteAsync(t.RouteId);
            long oCity = oldRoute.Stops.Single(s => s.Sequence == b.FromSeq).CityId, dCity = oldRoute.Stops.Single(s => s.Sequence == b.ToSeq).CityId;
            var f = r.Stops.FirstOrDefault(s => s.CityId == oCity); var to = f is null ? null : r.Stops.FirstOrDefault(s => s.CityId == dCity && s.Sequence > f.Sequence);
            if (f is null || to is null) throw Bad("Target service must serve the booked journey direction", 409);
            var mine = t.Id == b.TripId ? b.Passengers.Where(p => p.Status == "CONFIRMED").Select(p => p.SeatCode).ToHashSet(StringComparer.OrdinalIgnoreCase) : [];
            var seats = (await inv.SeatStatesAsync(t, r, f.Sequence, to.Sequence)).Where(s => s.Available || mine.Contains(s.Seat.Code))
                .Select(s => new { seat = s.Seat.Code, type = s.Seat.SeatType, deck = s.Seat.Deck, status = mine.Contains(s.Seat.Code) ? "current" : s.LadiesOnly ? "ladies_only" : "available" });
            return Results.Ok(new { pnr = b.Pnr, schedule_id = t.Id, travel_date = t.TravelDate,
                passengers = b.Passengers.Where(p => p.Status == "CONFIRMED").OrderBy(p => p.Id).Select(p => new { seat = p.SeatCode, name = p.Name }), seats });
        }).RequireAuthorization(Policies.Operations);

        // ------------------------------------------------ guided shift: apply {schedule_id, seat_map:{old: new}}
        g.MapPost("/{pnr}/shift-to", async (string pnr, BookingShiftInput i, GdsDbContext db, InventoryService inv, HttpContext h) =>
        {
            var b = await Need(db, pnr);
            if (b.Status != "CONFIRMED") throw Bad("Only confirmed tickets can be shifted", 409);
            if (i.ScheduleId is null || i.SeatMap is null || i.SeatMap.Count == 0) throw Bad("Choose a target service and seats");
            var pax = b.Passengers.Where(p => p.Status == "CONFIRMED").OrderBy(p => p.Id).ToList();
            var map = new Dictionary<string, string>(i.SeatMap, StringComparer.OrdinalIgnoreCase);
            if (pax.Any(p => !map.ContainsKey(p.SeatCode)) || map.Count != pax.Count) throw Bad("Select a different available target seat for every passenger");
            var target = pax.Select(p => map[p.SeatCode].Trim()).ToList();
            if (target.Any(string.IsNullOrEmpty) || target.Distinct(StringComparer.OrdinalIgnoreCase).Count() != target.Count) throw Bad("Select a different available target seat for every passenger");
            var r = await inv.ShiftAsync(b.Pnr, i.ScheduleId.Value, target, Actor(h));
            return Results.Ok(new { success = true, pnr = r.Pnr, schedule_id = r.TripId, seats = r.Passengers.Where(p => p.Status == "CONFIRMED").Select(p => p.SeatCode) });
        }).RequireAuthorization(Policies.Operations);
    }
}
