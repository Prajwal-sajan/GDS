using JourneyOS.Api.Operations;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record RouteStatusInput(string Status);

/// <summary>
/// Read model for GDS → Routes list (legacy <c>GET /api/routes?status=all</c> + <c>/cities</c> + <c>/coaches</c> joined client-side)
/// and the row on/off switch (legacy <c>PUT /api/routes/:id {status}</c>). Values come from PostgreSQL only; fields the modern
/// schema does not hold (alt name, validity window) are returned as null so the UI shows the legacy empty markers.
/// </summary>
public static class RouteEndpoints
{
    public static void MapRouteList(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization().WithTags("Routes");

        g.MapGet("/route-list", async (GdsDbContext db) =>
        {
            var routes = await db.Routes.AsNoTracking().AsSplitQuery()
                .Include(r => r.Stops).ThenInclude(s => s.City).Include(r => r.Stages).Include(r => r.CoachTemplate).ThenInclude(c => c!.Seats)
                .OrderBy(r => r.Id).ToListAsync();
            return Results.Ok(new
            {
                routes = routes.Select(r =>
                {
                    var stops = r.Stops.OrderBy(s => s.Sequence).ToList();
                    var first = stops.FirstOrDefault(); var last = stops.LastOrDefault();
                    // Legacy header values when imported; otherwise derived like the schedules list (last drop point, else last city stop).
                    var lastDrop = r.Stages.Where(s => s.Kind == "drop").OrderBy(s => s.Day).ThenBy(s => s.Time).LastOrDefault();
                    TimeOnly? arrival = r.ArrivalTime ?? lastDrop?.Time ?? last?.Time;
                    // legacy rowRoute: arrival_day, else 2 when the clock wraps past midnight
                    var arrivalDay = r.ArrivalDay ?? (arrival is not null && r.DepartureTime > arrival ? 2 : 1);
                    int? duration = r.DurationMinutes;
                    if (duration is null && arrival is not null)
                    {
                        duration = (int)((arrival.Value.ToTimeSpan() - r.DepartureTime.ToTimeSpan()).TotalMinutes) + (arrivalDay - 1) * 1440;
                        if (duration < 0) duration += 1440;
                    }
                    return new
                    {
                        id = r.Id, serviceNumber = r.ServiceNumber, name = r.Name, altName = r.AltName, status = r.Status,
                        departureTime = r.DepartureTime, arrivalTime = arrival, arrivalDay, durationMinutes = duration,
                        origin = first?.City is null ? null : new { name = first.City.Name, state = first.City.State },
                        destination = last?.City is null ? null : new { name = last.City.Name, state = last.City.State },
                        via = stops.Select(s => s.City?.Name ?? "").ToList(),
                        coach = r.CoachTemplate is null ? null : new { id = r.CoachTemplate.Id, name = r.CoachTemplate.Name, capacity = r.CoachTemplate.Seats.Count },
                        startDate = r.StartDate, endDate = r.EndDate,
                    };
                }),
            });
        }).RequireAuthorization(Policies.Reports);

        g.MapPut("/routes/{id:long}/status", async (long id, RouteStatusInput i, OperationsService s, HttpContext h) =>
            Results.Ok(new { status = await s.SetRouteStatusAsync(id, i.Status, h.User.Identity!.Name!) })).RequireAuthorization(Policies.Operations);
    }
}
