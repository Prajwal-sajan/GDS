using JourneyOS.Api.Inventory;
using JourneyOS.Api.Operations;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record RouteStatusInput(string Status);
public sealed record RouteDuplicateInput(string? ServiceNumber);

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

        // Legacy route fare groups / seat_fare_rules (routes-screenshot-v5 fares()): per-seat ± changes with optional weekdays,
        // applied on top of the city-pair fare for every trip of the route (FareCalculator).
        g.MapPut("/routes/{id:long}/seat-fare-rules", async (long id, System.Text.Json.Nodes.JsonObject body, GdsDbContext db, InventoryService inv, HttpContext h) =>
        {
            var route = await db.Routes.Include(r => r.SeatFareRules).Include(r => r.CoachTemplate).ThenInclude(c => c!.Seats).FirstOrDefaultAsync(r => r.Id == id)
                ?? throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);
            if (body["rules"] is not System.Text.Json.Nodes.JsonArray arr || arr.Count > 200) throw new GdsException("VALIDATION", "rules must be a list");
            var codes = route.CoachTemplate?.Seats.Select(s => s.Code).ToHashSet() ?? [];
            var next = new List<SeatFareRule>();
            foreach (var x in arr.OfType<System.Text.Json.Nodes.JsonObject>())
            {
                var seats = (x["seats"] as System.Text.Json.Nodes.JsonArray ?? []).Select(s => s?.ToString().Trim().ToUpperInvariant() ?? "").Where(s => s.Length > 0).Distinct().ToArray();
                var unknown = seats.Where(s => !codes.Contains(s)).ToList();
                if (unknown.Count > 0) throw new GdsException("VALIDATION", "Unknown seat(s): " + string.Join(", ", unknown.Take(10)));
                var days = (x["days"] as System.Text.Json.Nodes.JsonArray ?? []).Select(d => d?.ToString() ?? "").Where(d => d.Length > 0).Distinct().ToArray();
                var kind = x["kind"]?.ToString() == "percent" ? "percent" : "amount";
                if (!decimal.TryParse(x["value"]?.ToString(), System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var value)) value = 0;
                if (kind == "percent" && Math.Abs(value) > 100) throw new GdsException("VALIDATION", "Percent change must be between -100 and 100");
                if (Math.Abs(value) > 100000) throw new GdsException("VALIDATION", "Fare change is too large");
                var label = (x["label"]?.ToString() ?? "").Trim(); if (label.Length > 80) label = label[..80];
                if (seats.Length > 0 && value != 0) next.Add(new SeatFareRule { RouteId = id, Kind = kind, Label = label, Seats = seats, Days = days, Value = value });
            }
            var before = route.SeatFareRules.Select(s => new { s.Kind, s.Label, s.Seats, s.Days, s.Value }).ToList();
            db.SeatFareRules.RemoveRange(route.SeatFareRules);
            db.SeatFareRules.AddRange(next);
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = h.User.Identity?.Name ?? "system", Action = "ROUTE_SEAT_FARE_RULES", Entity = "route", EntityId = id.ToString(),
                DataJson = System.Text.Json.JsonSerializer.Serialize(new { before, after = next.Select(s => new { s.Kind, s.Label, s.Seats, s.Days, s.Value }) }), At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            foreach (var t in await db.Trips.Where(t => t.RouteId == id && t.TravelDate >= today).Select(t => t.Id).ToListAsync()) await inv.InvalidateTripAsync(t);
            return Results.Ok(new { success = true, rules = next.Count });
        }).RequireAuthorization(Policies.Operations);

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

        // ---- Route lifecycle (legacy POST /routes, POST /routes/:id/duplicate, POST /routes/:id/delete-otp, DELETE /routes/:id {otp})
        g.MapPost("/routes", async (RouteCreateInput i, RouteEditService s, HttpContext h) =>
        {
            var r = await s.CreateRouteAsync(i, h.User.Identity!.Name!);
            return Results.Ok(new { id = r.Id, serviceNumber = r.ServiceNumber, status = r.Status });
        }).RequireAuthorization(Policies.Operations);
        g.MapPost("/routes/{id:long}/duplicate", async (long id, RouteDuplicateInput i, RouteEditService s, HttpContext h) =>
        {
            var r = await s.DuplicateRouteAsync(id, i.ServiceNumber, h.User.Identity!.Name!);
            return Results.Ok(new { id = r.Id, serviceNumber = r.ServiceNumber, status = r.Status });
        }).RequireAuthorization(Policies.Operations);
        g.MapPost("/routes/{id:long}/delete-otp", (long id, StepUpService otp, HttpContext h) =>
            Results.Ok(otp.Request(h.User.Identity!.Name!, $"route_delete_{id}"))).RequireAuthorization(Policies.Operations);
        g.MapDelete("/routes/{id:long}", async (long id, string? otp, StepUpService step, RouteEditService s, HttpContext h) =>
        {
            if (!step.Check(h.User.Identity!.Name!, $"route_delete_{id}", otp)) throw new GdsException("FORBIDDEN", "Valid OTP required to delete route", 403);
            await s.DeleteRouteAsync(id, h.User.Identity!.Name!);
            return Results.Ok(new { success = true });
        }).RequireAuthorization(Policies.Operations);

        // City catalogue for the via-city editor (legacy GET /api/cities).
        g.MapGet("/city-list", async (GdsDbContext db) => Results.Ok(new
        {
            cities = await db.Cities.AsNoTracking().Where(c => c.IsActive).OrderBy(c => c.Name)
                .Select(c => new { c.Id, c.Name, c.State }).ToListAsync(),
        })).RequireAuthorization(Policies.Reports);

        // Route validation (legacy GET /routes/:id/validate): coach, fares, stops, map pins and stop order on the saved route.
        g.MapGet("/routes/{id:long}/validate", async (long id, GdsDbContext db) =>
        {
            var r = await db.Routes.AsNoTracking().AsSplitQuery().Include(x => x.Stops).ThenInclude(s => s.City).Include(x => x.Stages).Include(x => x.Fares)
                .Include(x => x.CoachTemplate).ThenInclude(c => c!.Seats).FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);
            var issues = new List<object>(); var errors = 0;
            void E(string m) { errors++; issues.Add(new { level = "error", message = m }); }
            void W(string m, long? stage = null) => issues.Add(new { level = "warn", stage_id = stage, message = m });
            var stops = r.Stops.OrderBy(s => s.Sequence).ToList();
            if (r.CoachTemplate is null || r.CoachTemplate.Seats.Count == 0) E("Route has no coach layout");
            if (stops.Count < 2) E("Route needs an origin and a destination city");
            if (!r.Stages.Any(s => s.Kind == "pickup")) E("Route has no boarding points");
            if (!r.Stages.Any(s => s.Kind == "drop")) E("Route has no dropping points");
            for (var a = 0; a < stops.Count; a++)
                for (var b = a + 1; b < stops.Count; b++)
                    if (!r.Fares.Any(f => f.FromSequence == stops[a].Sequence && f.ToSequence == stops[b].Sequence && (f.Seater > 0 || f.SleeperLower > 0 || f.SleeperUpper > 0)))
                        W($"{stops[a].City?.Name} → {stops[b].City?.Name}: no fare (not on sale)");
            foreach (var s in r.Stages) if (s.Lat is null || s.Lng is null) W($"{s.Name}: no map location", s.Id);
            var ordered = r.Stages.OrderBy(s => s.Day).ThenBy(s => s.Time).ToList();
            for (var i = 1; i < ordered.Count; i++)
            {
                var a = ordered[i - 1]; var b = ordered[i];
                if (a.Lat is null || a.Lng is null || b.Lat is null || b.Lng is null) continue;
                var mins = (b.Day - a.Day) * 1440 + (b.Time.ToTimeSpan() - a.Time.ToTimeSpan()).TotalMinutes;
                double R(decimal d) => (double)d * Math.PI / 180;
                var dLat = R(b.Lat.Value - a.Lat.Value); var dLng = R(b.Lng.Value - a.Lng.Value);
                var h = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) + Math.Cos(R(a.Lat.Value)) * Math.Cos(R(b.Lat.Value)) * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
                var km = 6371 * 2 * Math.Atan2(Math.Sqrt(h), Math.Sqrt(1 - h));
                if (mins > 0 && km / (mins / 60) > 100) W($"{b.Name}: {Math.Round(km)} km from {a.Name} in {mins:0} min — time or pin probably wrong", b.Id);
            }
            return Results.Ok(new { ok = errors == 0, issues });
        }).RequireAuthorization(Policies.Reports);

        // Route edit history (legacy GET /routes/:id/history): audit rows with section + operation detail.
        g.MapGet("/routes/{id:long}/history", async (long id, int? limit, GdsDbContext db) =>
        {
            var rows = await db.AuditLogs.AsNoTracking().Where(a => a.Entity == "route" && a.EntityId == id.ToString())
                .OrderByDescending(a => a.Id).Take(Math.Clamp(limit ?? 100, 1, 500)).Select(a => new { a.Action, a.Actor, a.At, a.DataJson }).ToListAsync();
            return Results.Ok(new { history = rows.Select(a => new { at = a.At, section = a.Action, actor = a.Actor, details = a.DataJson }) });
        }).RequireAuthorization(Policies.Reports);

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
