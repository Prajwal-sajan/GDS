using System.Globalization;
using System.Text.Json;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

/// <summary>
/// Read model for the Trips screen (legacy <c>GET /api/trips?date=</c> and <c>GET /api/trips/:sid</c>, trip-parity-v13.js).
/// Everything comes from PostgreSQL. Data the platform does not record (call status, passenger live location,
/// stop arrival/departure events, telemetry, ratings) is returned as null so the UI shows "—", never an estimate.
/// </summary>
public static class TripSheetEndpoints
{
    public static void MapTripSheets(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization().WithTags("Trips");

        g.MapGet("/trip-sheets", async (DateOnly date, GdsDbContext db) =>
        {
            var trips = await db.Trips.AsNoTracking().Include(t => t.Route).Where(t => t.TravelDate == date).ToListAsync();
            var ids = trips.Select(t => t.Id).ToList();
            var asg = await db.TripAssignments.AsNoTracking().Where(a => ids.Contains(a.TripId) && a.IsActive).ToListAsync();
            var vehicleIds = asg.Where(a => a.VehicleId != null).Select(a => a.VehicleId!.Value).Distinct().ToList();
            var regs = await db.Vehicles.AsNoTracking().Where(v => vehicleIds.Contains(v.Id)).ToDictionaryAsync(v => v.Id, v => v.RegistrationNumber);
            return Results.Ok(new
            {
                trips = trips.OrderBy(t => t.Route!.DepartureTime).ThenBy(t => t.Id).Select(t =>
                {
                    var vid = asg.FirstOrDefault(a => a.TripId == t.Id && a.Kind == "vehicle")?.VehicleId;
                    return new
                    {
                        id = t.Id, serviceNumber = t.Route!.ServiceNumber, serviceName = t.Route.Name, status = t.Status,
                        registration = vid is { } v ? regs.GetValueOrDefault(v) : null,
                        staff = asg.Count(a => a.TripId == t.Id && a.Kind == "staff"),
                    };
                }),
            });
        }).RequireAuthorization(Policies.Reports);

        g.MapGet("/trip-sheets/{id:long}", async (long id, GdsDbContext db) =>
        {
            var t = await db.Trips.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("SERVICE_NOT_FOUND", "Trip not found", 404);
            var r = await db.Routes.AsNoTracking().AsSplitQuery().Include(x => x.Stops).ThenInclude(s => s.City).Include(x => x.Stages).FirstAsync(x => x.Id == t.RouteId);
            var asg = await db.TripAssignments.AsNoTracking().Where(a => a.TripId == id && a.IsActive).OrderBy(a => a.Id).ToListAsync();
            var staffIds = asg.Where(a => a.StaffId != null).Select(a => a.StaffId!.Value).ToList();
            var staff = await db.Staff.AsNoTracking().Where(s => staffIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id);
            var vid = asg.FirstOrDefault(a => a.Kind == "vehicle")?.VehicleId;
            var vehicle = vid is null ? null : await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(v => v.Id == vid);
            var docs = vehicle is null ? [] : await db.ComplianceDocuments.AsNoTracking().Where(d => d.OwnerType == "vehicle" && d.OwnerId == vehicle.Id).OrderBy(d => d.Id).ToListAsync();
            var bookings = await db.Bookings.AsNoTracking().Include(b => b.Passengers).Where(b => b.TripId == id).OrderBy(b => b.Id).ToListAsync();
            var phones = bookings.Select(b => b.ContactMobile).Where(p => p != null).Distinct().ToList();
            // legacy "trips" = confirmed bookings for the same contact phone
            var tripsByPhone = await db.Bookings.AsNoTracking().Where(b => phones.Contains(b.ContactMobile) && b.Status != "CANCELLED")
                .GroupBy(b => b.ContactMobile!).Select(x => new { x.Key, n = x.Count() }).ToDictionaryAsync(x => x.Key, x => x.n);
            var stages = r.Stages.ToDictionary(s => s.Id);
            object? Stage(long sid) => stages.TryGetValue(sid, out var s)
                ? new { s.Id, s.Name, s.Time, s.Day, s.PickupType, s.ExchangePoint, s.ExchangeTime } : null;
            var cities = r.Stops.OrderBy(s => s.Sequence).ToList();
            var events = ParseEvents(t.StopEventsJson);

            return Results.Ok(new
            {
                id = t.Id, travelDate = t.TravelDate, status = t.Status, serviceNumber = r.ServiceNumber, serviceName = r.Name,
                origin = cities.FirstOrDefault()?.City?.Name, destination = cities.LastOrDefault()?.City?.Name,
                vehicle = vehicle is null ? null : new { vehicle.Id, registration = vehicle.RegistrationNumber },
                crew = asg.Where(a => a.Kind == "staff" && a.StaffId != null).Select(a => new
                {
                    role = a.Role, staffId = a.StaffId, name = staff.GetValueOrDefault(a.StaffId!.Value)?.Name, phone = staff.GetValueOrDefault(a.StaffId!.Value)?.Phone,
                }),
                stops = r.Stages.OrderBy(s => s.Day).ThenBy(s => s.Time).Select(s => new
                {
                    s.Id, type = s.Kind, s.Name, s.Time, s.Day, s.Lat, s.Lng, s.PickupType, s.ExchangePoint, s.ExchangeTime,
                    arrivedAt = StopStamp(events, s.Id, "atime"), departedAt = StopStamp(events, s.Id, "dtime"),
                }),
                passengers = bookings.SelectMany(b => b.Passengers.OrderBy(p => p.Id).Select(p => new
                {
                    pnr = b.Pnr, seat = p.SeatCode, name = p.Name, phone = b.ContactMobile, source = b.Channel,
                    status = b.Status == "CANCELLED" || p.Status == "CANCELLED" ? "cancelled"
                        : p.BoardingStatus switch { "Boarded" => "boarded", "No-Show" => "no_show", "Checked-In" => "checked_in", "Dropped" => "dropped", _ => "booked" },
                    callStatus = p.CallStatus,
                    trips = b.ContactMobile is { } m ? tripsByPhone.GetValueOrDefault(m) : (int?)null,
                    boarding = Stage(b.BoardingStageId), dropping = Stage(b.DroppingStageId),
                    fare = p.Fare, gender = p.Gender, bookedAt = b.DateOfIssue,
                    from = cities.FirstOrDefault(c => c.Sequence == b.FromSeq)?.City?.Name, to = cities.FirstOrDefault(c => c.Sequence == b.ToSeq)?.City?.Name,
                })),
                documents = docs.Select(d => new { d.Id, d.DocumentType, d.DocumentName, d.ExpiryDate, d.VerificationStatus }),
            });
        }).RequireAuthorization(Policies.Reports);

        // legacy PATCH /trips/:sid/passengers/:pnr/:seat {status, call_status, boarding_otp}
        g.MapPatch("/trip-sheets/{id:long}/passengers/{pnr}/{seat}", async (long id, string pnr, string seat, TripPassengerInput i, GdsDbContext db, InventoryService inv, HttpContext h) =>
        {
            var b = await db.Bookings.Include(x => x.Passengers).FirstOrDefaultAsync(x => x.Pnr == pnr && x.TripId == id)
                ?? throw new GdsException("BOOKING_NOT_FOUND", "Passenger not found", 404);
            var p = b.Passengers.FirstOrDefault(x => x.SeatCode == seat) ?? throw new GdsException("BOOKING_NOT_FOUND", "Seat not on booking", 404);
            if (b.Status == "CANCELLED" || p.Status == "CANCELLED") throw new GdsException("VALIDATION", "Passenger is cancelled");
            if (i.CallStatus is not null && i.CallStatus is not ("to_call" or "called" or "not_reachable" or "")) throw new GdsException("VALIDATION", "Invalid call status");
            string? bs = i.Status switch
            {
                null or "" => null, "checked_in" => "Checked-In", "boarded" => "Boarded", "dropped" => "Dropped", "no_show" => "No-Show", "booked" => "Yet-To-Board",
                _ => throw new GdsException("VALIDATION", "Invalid passenger status"),
            };
            if (bs == "Boarded" && !string.IsNullOrWhiteSpace(i.BoardingOtp) && b.Pnr[^4..] != i.BoardingOtp.Trim())
                throw new GdsException("VALIDATION", "Boarding OTP does not match");
            if (bs is not null) { p.BoardingStatus = bs; p.BoardingStatusAt = DateTime.UtcNow; }
            if (i.CallStatus is not null) p.CallStatus = i.CallStatus == "" ? null : i.CallStatus;
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = h.User.Identity?.Name ?? "system", Action = "PASSENGERS", Entity = "booking", EntityId = b.Pnr,
                DataJson = JsonSerializer.Serialize(new { trip = id, seat, status = i.Status, call_status = i.CallStatus }), At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            await inv.InvalidateTripAsync(id);
            return Results.Ok(new { success = true, status = p.BoardingStatus, callStatus = p.CallStatus });
        }).RequireAuthorization(Policies.Operations);

        // legacy POST /trips/:sid/stop-event {stage_id, kind}
        g.MapPost("/trip-sheets/{id:long}/stop-event", async (long id, StopEventInput i, GdsDbContext db) =>
        {
            var t = await db.Trips.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("SERVICE_NOT_FOUND", "Trip not found", 404);
            if (!await db.Set<RouteStage>().AnyAsync(s => s.Id == i.StageId && s.RouteId == t.RouteId)) throw new GdsException("VALIDATION", "Stop is not on this trip");
            var ev = ParseEvents(t.StopEventsJson);
            var key = i.StageId.ToString(CultureInfo.InvariantCulture);
            if (!ev.TryGetValue(key, out var e)) ev[key] = e = new();
            e[i.Kind == "departed" ? "dtime" : "atime"] = DateTime.UtcNow.ToString("O");
            t.StopEventsJson = JsonSerializer.Serialize(ev);
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, @event = e });
        }).RequireAuthorization(Policies.Operations);

        // legacy history modal: /chats/:conversation (by phone) + /calls?q=pnr; popover out/in call counts
        g.MapGet("/trip-sheets/{id:long}/passengers/{pnr}/communications", async (long id, string pnr, GdsDbContext db) =>
        {
            var b = await db.Bookings.AsNoTracking().FirstOrDefaultAsync(x => x.Pnr == pnr && x.TripId == id)
                ?? throw new GdsException("BOOKING_NOT_FOUND", "Passenger not found", 404);
            var phone = b.ContactMobile ?? "";
            var msgs = phone == "" ? [] : await db.ChatMessages.AsNoTracking().Where(m => m.Phone == phone).OrderByDescending(m => m.Ts).Take(500).ToListAsync();
            var calls = await db.CallLogs.AsNoTracking().Where(c => c.Pnr == b.Pnr).OrderByDescending(c => c.Ts).ToListAsync();
            var rows = msgs.Select(m => new { channel = m.Channel.ToLowerInvariant(), direction = m.Direction, ts = m.Ts, label = "Unknown", from = m.By ?? "", to = m.Phone, status = m.DeliveryStatus, duration = (int?)null, content = m.Text })
                .Concat(calls.Select(c => new { channel = "calls", direction = c.Direction.StartsWith("out") ? "out" : "in", ts = c.Ts, label = c.Kind, from = c.Phone, to = "", status = c.Status, duration = (int?)c.DurationS, content = c.Notes ?? "" }))
                .OrderByDescending(x => x.ts).ToList();
            return Results.Ok(new { rows, outCalls = calls.Count(c => c.Direction.StartsWith("out")), inCalls = calls.Count(c => c.Direction.StartsWith("in")) });
        }).RequireAuthorization(Policies.Reports);
    }

    private static Dictionary<string, Dictionary<string, string>> ParseEvents(string? json)
    {
        if (string.IsNullOrWhiteSpace(json) || json == "null") return new();
        try { return JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string>>>(json) ?? new(); } catch (JsonException) { return new(); }
    }
    private static string? StopStamp(Dictionary<string, Dictionary<string, string>> ev, long stageId, string k) =>
        ev.TryGetValue(stageId.ToString(CultureInfo.InvariantCulture), out var e) && e.TryGetValue(k, out var v) ? v : null;
}

public sealed record TripPassengerInput(string? Status, string? CallStatus, string? BoardingOtp);
public sealed record StopEventInput(long StageId, string? Kind);
