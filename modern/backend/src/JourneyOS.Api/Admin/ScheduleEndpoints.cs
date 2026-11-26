using JourneyOS.Api.Inventory;
using JourneyOS.Api.Operations;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Reports;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record ScheduleToggleInput(bool Active);

/// <summary>
/// Read model for the GDS → Schedules list (legacy <c>GET /api/schedules</c>) and the per-departure on/off switch
/// (legacy <c>POST /api/schedules/:id/toggle</c>). All figures come from PostgreSQL; nothing is synthesised.
/// </summary>
public static class ScheduleEndpoints
{
    public static void MapSchedules(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization().WithTags("Schedules");

        g.MapGet("/schedules", async (DateOnly from, DateOnly to, GdsDbContext db, ReportsService reports) =>
        {
            if (to < from || to.DayNumber - from.DayNumber > 31) throw new GdsException("VALIDATION", "Choose a date range of at most 31 days");
            var trips = await db.Trips.AsNoTracking().Where(t => t.TravelDate >= from && t.TravelDate <= to && t.DeletedAt == null).ToListAsync();
            var routeIds = trips.Select(t => t.RouteId).Distinct().ToList();
            var routes = await db.Routes.AsNoTracking().AsSplitQuery().Where(r => routeIds.Contains(r.Id))
                .Include(r => r.Stops).ThenInclude(s => s.City).Include(r => r.Stages).Include(r => r.Fares).Include(r => r.CoachTemplate).ThenInclude(c => c!.Seats)
                .ToDictionaryAsync(r => r.Id);
            var ids = trips.Select(t => t.Id).ToList();
            var alloc = await db.SeatAllocations.AsNoTracking().Where(a => ids.Contains(a.TripId) && a.IsActive)
                .GroupBy(a => new { a.TripId, a.Kind }).Select(x => new { x.Key.TripId, x.Key.Kind, Seats = x.Select(a => a.CoachSeatId).Distinct().Count() }).ToListAsync();
            var money = trips.Count > 0 ? await reports.TripMoneyAsync(from, to) : [];
            int Count(long trip, AllocationKind k) => alloc.Where(a => a.TripId == trip && a.Kind == k).Sum(a => a.Seats);

            return Results.Ok(new
            {
                schedules = trips.Select(t =>
                {
                    var r = routes[t.RouteId];
                    var stops = r.Stops.OrderBy(s => s.Sequence).ToList();
                    var first = stops.FirstOrDefault(); var last = stops.LastOrDefault();
                    var fare = first is null || last is null ? null : r.Fares.FirstOrDefault(f => f.FromSequence == first.Sequence && f.ToSequence == last.Sequence);
                    var capacity = r.CoachTemplate?.Seats.Count ?? 0;
                    // Legacy card: departs at the route departure time, arrives at the last drop point (falls back to the last city stop).
                    var lastDrop = r.Stages.Where(s => s.Kind == "drop").OrderBy(s => s.Day).ThenBy(s => s.Time).LastOrDefault();
                    var arrivalTime = lastDrop?.Time ?? last?.Time;
                    var arrivalDay = lastDrop?.Day ?? last?.Day ?? 1;
                    var booked = Count(t.Id, AllocationKind.Booked); var held = Count(t.Id, AllocationKind.Hold); var blocked = Count(t.Id, AllocationKind.Blocked);
                    money.TryGetValue(t.Id, out var m);
                    return new
                    {
                        id = t.Id, routeId = t.RouteId, travelDate = t.TravelDate, serviceNumber = r.ServiceNumber, serviceName = r.Name,
                        coach = r.CoachTemplate?.Name, origin = first?.City?.Name, destination = last?.City?.Name,
                        departureTime = r.DepartureTime, arrivalTime, arrivalDayOffset = Math.Max(0, arrivalDay - 1),
                        mainFare = fare is null ? null : new { seater = fare.Seater, sleeperLower = fare.SleeperLower, sleeperUpper = fare.SleeperUpper },
                        status = t.Status, bookable = t.Bookable, capacity, booked, held, blocked, free = Math.Max(0, capacity - booked - held - blocked),
                        occupancyPct = capacity > 0 ? Math.Round(booked * 100m / capacity, 2) : 0,
                        sale = m?.Gross, netSales = m?.Net, expense = m?.Expense, profit = m?.Profit, expenseBasis = m?.Basis,
                    };
                }).OrderBy(s => s.travelDate).ThenBy(s => s.departureTime).ThenBy(s => s.serviceNumber),
            });
        }).RequireAuthorization(Policies.Reports);

        g.MapPost("/schedules/{id:long}/toggle", async (long id, ScheduleToggleInput i, OperationsService s, HttpContext h) =>
            Results.Ok(new { bookable = await s.SetBookableAsync(id, i.Active, h.User.Identity!.Name!) })).RequireAuthorization(Policies.Operations);

        // Schedule management overlay read model (legacy GET /api/schedules/:id + /trips/:id passengers + /schedules/:id/booking-history).
        g.MapGet("/schedule-detail/{id:long}", async (long id, GdsDbContext db) =>
        {
            var t = await db.Trips.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null) ?? throw new GdsException("SERVICE_NOT_FOUND", "Schedule not found", 404);
            var r = await db.Routes.AsNoTracking().AsSplitQuery().Include(x => x.Stops).ThenInclude(s => s.City).Include(x => x.Stages).Include(x => x.CoachTemplate)
                .FirstAsync(x => x.Id == t.RouteId);
            var stops = r.Stops.OrderBy(s => s.Sequence).ToList();
            var cityNames = await db.Cities.AsNoTracking().Where(c => r.Stages.Select(s => s.CityId).Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);
            var bookings = await db.Bookings.AsNoTracking().Include(b => b.Passengers).Where(b => b.TripId == id).ToListAsync();
            // Seats (not tickets) per boarding / dropping point, excluding cancelled passengers — legacy stopTab() count.
            var live = bookings.SelectMany(b => b.Passengers.Where(p => p.Status != "CANCELLED").Select(_ => b)).ToList();
            var lastDrop = r.Stages.Where(s => s.Kind == "drop").OrderBy(s => s.Day).ThenBy(s => s.Time).LastOrDefault();
            return Results.Ok(new
            {
                id = t.Id, routeId = r.Id, travelDate = t.TravelDate, status = t.Status, bookable = t.Bookable,
                serviceNumber = r.ServiceNumber, serviceName = r.Name, coach = r.CoachTemplate?.Name,
                origin = stops.FirstOrDefault()?.City?.Name, destination = stops.LastOrDefault()?.City?.Name,
                departureTime = r.DepartureTime, arrivalTime = lastDrop?.Time ?? stops.LastOrDefault()?.Time,
                arrivalDay = lastDrop?.Day ?? stops.LastOrDefault()?.Day ?? 1,
                stops = stops.Select(s => new { cityId = s.CityId, name = s.City?.Name, state = s.City?.State, day = s.Day, time = s.Time }),
                stages = r.Stages.OrderBy(s => s.Day).ThenBy(s => s.Time).Select(s => new
                {
                    s.Id, s.Kind, s.Name, s.Address, s.Landmark, s.ContactNumber, s.Lat, s.Lng, s.Day, s.Time, s.Prime, s.PickupType,
                    cityId = s.CityId, city = cityNames.GetValueOrDefault(s.CityId),
                    passengers = live.Count(b => (s.Kind == "pickup" ? b.BoardingStageId : b.DroppingStageId) == s.Id),
                }),
                history = bookings.OrderByDescending(b => b.DateOfIssue).ThenByDescending(b => b.Id).Select(b =>
                {
                    var pax = b.Passengers.OrderBy(p => p.Id).ToList();
                    return new
                    {
                        pnr = b.Pnr, seats = pax.Select(p => p.SeatCode), totalAmount = b.TotalFare, source = b.Channel,
                        // legacy contact.name is always the primary (first) passenger
                        contactName = (pax.FirstOrDefault(p => p.IsPrimary) ?? pax.FirstOrDefault())?.Name,
                        bookedAt = b.DateOfIssue, status = b.Status == "CANCELLED" ? "cancelled" : "confirmed", // legacy has no partial state
                    };
                }),
            });
        }).RequireAuthorization(Policies.Reports);
    }
}
