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
                    arrivedAt = (DateTime?)null, departedAt = (DateTime?)null, // stop events are not recorded by the platform yet
                }),
                passengers = bookings.SelectMany(b => b.Passengers.OrderBy(p => p.Id).Select(p => new
                {
                    pnr = b.Pnr, seat = p.SeatCode, name = p.Name, phone = b.ContactMobile, source = b.Channel,
                    status = b.Status == "CANCELLED" || p.Status == "CANCELLED" ? "cancelled"
                        : p.BoardingStatus switch { "Boarded" => "boarded", "No-Show" => "no_show", _ => "booked" },
                    callStatus = (string?)null,
                    trips = b.ContactMobile is { } m ? tripsByPhone.GetValueOrDefault(m) : (int?)null,
                    boarding = Stage(b.BoardingStageId), dropping = Stage(b.DroppingStageId),
                    fare = p.Fare, gender = p.Gender, bookedAt = b.DateOfIssue,
                    from = cities.FirstOrDefault(c => c.Sequence == b.FromSeq)?.City?.Name, to = cities.FirstOrDefault(c => c.Sequence == b.ToSeq)?.City?.Name,
                })),
                documents = docs.Select(d => new { d.Id, d.DocumentType, d.DocumentName, d.ExpiryDate, d.VerificationStatus }),
            });
        }).RequireAuthorization(Policies.Reports);
    }
}
