using JourneyOS.Api.Inventory;
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

        g.MapPut("/routes/{id:long}/settings", async (long id, RouteSettingsInput i, OperationsService s, HttpContext h) =>
        {
            var r = await s.UpdateRouteSettingsAsync(id, i, h.User.Identity!.Name!);
            return Results.Ok(new { id = r.Id, name = r.Name, status = r.Status });
        }).RequireAuthorization(Policies.Operations);

        // ---- Route editor writes (legacy PUT /routes/:id coach_id / stops / boarding+drop+breaks / seat_blocks, POST /routes/:id/shift-time)
        g.MapPut("/routes/{id:long}/coach", async (long id, RouteCoachInput i, RouteEditService s, HttpContext h) =>
            Results.Ok(await s.ChangeCoachAsync(id, i.CoachTemplateId, h.User.Identity!.Name!))).RequireAuthorization(Policies.Operations);

        g.MapPut("/routes/{id:long}/stops", async (long id, List<RouteStopInput> i, RouteEditService s, HttpContext h) =>
            Results.Ok(await s.ReplaceStopsAsync(id, i, h.User.Identity!.Name!))).RequireAuthorization(Policies.Operations);

        g.MapPost("/routes/{id:long}/stages", async (long id, RouteStageInput i, RouteEditService s, HttpContext h) =>
            Results.Ok(new { id = (await s.SaveStageAsync(id, null, i, h.User.Identity!.Name!)).Id })).RequireAuthorization(Policies.Operations);
        g.MapPut("/routes/{id:long}/stages/{stageId:long}", async (long id, long stageId, RouteStageInput i, RouteEditService s, HttpContext h) =>
            Results.Ok(new { id = (await s.SaveStageAsync(id, stageId, i, h.User.Identity!.Name!)).Id })).RequireAuthorization(Policies.Operations);
        g.MapDelete("/routes/{id:long}/stages/{stageId:long}", async (long id, long stageId, RouteEditService s, HttpContext h) =>
        {
            await s.DeleteStageAsync(id, stageId, h.User.Identity!.Name!);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization(Policies.Operations);

        g.MapPost("/routes/{id:long}/seat-blocks", async (long id, RouteSeatBlockInput i, RouteEditService s, HttpContext h) =>
        {
            var (b, res) = await s.SaveSeatBlockAsync(id, null, i, h.User.Identity!.Name!);
            return Results.Ok(new { id = b.Id, result = res });
        }).RequireAuthorization(Policies.Operations);
        g.MapPut("/routes/{id:long}/seat-blocks/{blockId:long}", async (long id, long blockId, RouteSeatBlockInput i, RouteEditService s, HttpContext h) =>
        {
            var (b, res) = await s.SaveSeatBlockAsync(id, blockId, i, h.User.Identity!.Name!);
            return Results.Ok(new { id = b.Id, result = res });
        }).RequireAuthorization(Policies.Operations);
        g.MapDelete("/routes/{id:long}/seat-blocks/{blockId:long}", async (long id, long blockId, RouteEditService s, HttpContext h) =>
            Results.Ok(new { result = await s.DeleteSeatBlockAsync(id, blockId, h.User.Identity!.Name!) })).RequireAuthorization(Policies.Operations);

        g.MapPost("/routes/{id:long}/shift-time", async (long id, RouteShiftInput i, RouteEditService s, HttpContext h) =>
            Results.Ok(await s.ShiftTimetableAsync(id, i, h.User.Identity!.Name!))).RequireAuthorization(Policies.Operations);

        // City catalogue for the via-city editor (legacy GET /api/cities).
        g.MapGet("/city-list", async (GdsDbContext db) => Results.Ok(new
        {
            cities = await db.Cities.AsNoTracking().Where(c => c.IsActive).OrderBy(c => c.Name)
                .Select(c => new { c.Id, c.Name, c.State }).ToListAsync(),
        })).RequireAuthorization(Policies.Reports);

        // Route editor read model (legacy GET /api/routes/:id): every tab's data in one call, PostgreSQL only.
        g.MapGet("/route-detail/{id:long}", async (long id, GdsDbContext db) =>
        {
            var r = await db.Routes.AsNoTracking().AsSplitQuery()
                .Include(x => x.Stops).ThenInclude(s => s.City).Include(x => x.Stages).Include(x => x.Fares).Include(x => x.RefundSlabs)
                .Include(x => x.SeatFareRules).Include(x => x.ExpenseItems).Include(x => x.CoachTemplate).ThenInclude(c => c!.Seats)
                .Include(x => x.SeatBlocks)
                .FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);
            var cityIds = r.Stages.Select(s => s.CityId).Concat(r.Stops.Select(s => s.CityId)).Distinct().ToList();
            var cities = await db.Cities.AsNoTracking().Where(c => cityIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);
            var history = await db.AuditLogs.AsNoTracking().Where(a => a.Entity == "route" && a.EntityId == id.ToString())
                .OrderByDescending(a => a.Id).Take(50).Select(a => new { a.Action, a.Actor, a.At }).ToListAsync();
            var stops = r.Stops.OrderBy(s => s.Sequence).ToList();
            return Results.Ok(new
            {
                id = r.Id, serviceNumber = r.ServiceNumber, name = r.Name, altName = r.AltName, status = r.Status,
                departureTime = r.DepartureTime, arrivalTime = r.ArrivalTime, arrivalDay = r.ArrivalDay, startDate = r.StartDate, endDate = r.EndDate,
                partialCancellationAllowed = r.PartialCancellationAllowed, maxSeatsPerTicket = r.MaxSeatsPerTicket, updateCutoffMinutes = r.UpdateCutoffMinutes,
                coach = r.CoachTemplate is null ? null : new
                {
                    id = r.CoachTemplate.Id, name = r.CoachTemplate.Name, pattern = r.CoachTemplate.Pattern, capacity = r.CoachTemplate.Seats.Count,
                    seaters = r.CoachTemplate.Seats.Count(s => s.SeatType == "seater"), sleepers = r.CoachTemplate.Seats.Count(s => s.SeatType == "sleeper"),
                    seats = r.CoachTemplate.Seats.OrderBy(s => s.Deck).ThenBy(s => s.Row).ThenBy(s => s.Col)
                        .Select(s => new { s.Code, s.Deck, s.Row, s.Col, s.Width, s.Length, s.SeatType }),
                },
                coachTemplateId = r.CoachTemplateId,
                distanceKm = r.DistanceKm,
                settings = r.SettingsJson is null ? new System.Text.Json.Nodes.JsonObject() : System.Text.Json.Nodes.JsonNode.Parse(r.SettingsJson),
                seatBlocks = r.SeatBlocks.OrderBy(b => b.Id).Select(b => new { b.Id, b.Seats, b.Reason, b.FromDate, b.ToDate, b.AutoReleaseHours, b.CreatedBy, b.CreatedAt }),
                stops = stops.Select(s => new { s.Id, s.Sequence, cityId = s.CityId, city = s.City?.Name, state = s.City?.State, lat = s.City?.Lat, lng = s.City?.Lng, s.Day, s.Time }),
                stages = r.Stages.OrderBy(s => s.Day).ThenBy(s => s.Time).Select(s => new
                {
                    s.Id, s.Kind, s.Name, s.Address, s.Landmark, s.ContactNumber, s.Lat, s.Lng, s.Day, s.Time, s.Prime, cityId = s.CityId,
                    s.PickupType, s.ExchangePoint, s.ExchangeTime, s.MetroDescription,
                    city = cities.GetValueOrDefault(s.CityId),
                }),
                fares = r.Fares.OrderBy(f => f.FromSequence).ThenBy(f => f.ToSequence).Select(f => new
                {
                    f.FromSequence, f.ToSequence, from = stops.FirstOrDefault(s => s.Sequence == f.FromSequence)?.City?.Name,
                    to = stops.FirstOrDefault(s => s.Sequence == f.ToSequence)?.City?.Name, f.Seater, f.SleeperLower, f.SleeperUpper,
                }),
                refundSlabs = r.RefundSlabs.OrderByDescending(s => s.HoursBefore).Select(s => new { s.HoursBefore, s.RefundPercent }),
                seatFareRules = r.SeatFareRules.Select(s => new { s.Kind, s.Label, s.Seats, s.Days, s.Value }),
                expenses = r.ExpenseItems.OrderBy(e => e.Type).ThenBy(e => e.Id).Select(e => new { e.Type, e.Key, e.Label, e.PerTrip }),
                history,
            });
        }).RequireAuthorization(Policies.Reports);
    }
}
