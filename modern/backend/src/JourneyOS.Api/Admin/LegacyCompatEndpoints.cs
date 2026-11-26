using JourneyOS.Api.Security;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Reports;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

/// <summary>
/// Read-only views in the exact JSON shape of the legacy Node routes that the vendored legacy screens (Daily Ops v12, Chats/Calls v14,
/// Sarathi v12) consume. Everything is derived from PostgreSQL; fields the modern store does not record are null (never estimated).
/// </summary>
public static class LegacyCompatEndpoints
{
    public static void Map(RouteGroupBuilder g)
    {
        // legacy GET /api/daily-ops?date= (fleet section consumed by dailyops-parity-v12)
        g.MapGet("/legacy/daily-ops", async (string? date, GdsDbContext db, ReportsService reports) =>
        {
            var day = date is null ? await reports.TodayAsync() : DateOnly.Parse(date);
            var basis = System.Text.Json.JsonSerializer.SerializeToNode(await reports.DailyOpsAsync(day))!;
            var trips = await db.Trips.AsNoTracking().Where(t => t.TravelDate == day && t.DeletedAt == null)
                .Select(t => new { t.Id, t.DepartureTime, Route = t.Route!.DepartureTime, t.TripStatus, t.RouteId }).ToDictionaryAsync(t => t.Id);
            var routeIds = trips.Values.Select(t => t.RouteId).Distinct().ToList();
            var ends = await db.RouteStops.AsNoTracking().Where(s => routeIds.Contains(s.RouteId)).Include(s => s.City)
                .GroupBy(s => s.RouteId).Select(x => new { RouteId = x.Key, From = x.OrderBy(s => s.Sequence).First().City!.Name, To = x.OrderByDescending(s => s.Sequence).First().City!.Name })
                .ToDictionaryAsync(x => x.RouteId);
            var fleet = basis["fleet"]!["trips"]!.AsArray().Select(n =>
            {
                var id = (long)n!["tripId"]!; var t = trips.GetValueOrDefault(id);
                var e = t is null ? null : ends.GetValueOrDefault(t.RouteId);
                return new
                {
                    schedule_id = id, service = (string?)n["service"], name = (string?)n["route"],
                    route = e is null ? (string?)n["route"] : $"{e.From} → {e.To}",
                    departure_time = t is null ? null : (t.DepartureTime ?? t.Route).ToString("HH:mm"),
                    status = (string?)n["status"], trip_status = t?.TripStatus, vehicle = (string?)n["vehicle"],
                    crew = n["crew"]!.AsArray().Select(c => new { role = (string?)c!["role"], name = (string?)c["name"], phone = (string?)c["phone"] }),
                    seats = (int)n["seats"]!, capacity = (int)n["capacity"]!, occupancy_pct = (decimal)n["occupancyPct"]!, net_sales = (decimal)n["netSales"]!,
                };
            }).OrderBy(x => x.departure_time).ToList();
            var s = basis["fleet"]!["summary"]!;
            return Results.Ok(new
            {
                date = day.ToString("yyyy-MM-dd"),
                fleet = new { trips = fleet, summary = new { trips = (int)s["trips"]!, running = (int)s["running"]!, without_bus = (int)s["withoutBus"]!, seats = (int)s["seats"]!, capacity = (int)s["capacity"]! } },
            });
        }).RequireAuthorization(Policies.Reports);

        // legacy GET /api/trips?date= (fields dailyops-parity-v12 reads: id, counts.checked_in, unread_chats, delay_minutes)
        g.MapGet("/legacy/trips", async (string? date, GdsDbContext db, ReportsService reports) =>
        {
            var day = date is null ? await reports.TodayAsync() : DateOnly.Parse(date);
            var trips = await db.Trips.AsNoTracking().Where(t => t.TravelDate == day && t.DeletedAt == null)
                .Select(t => new { t.Id, t.Route!.ServiceNumber, t.DelayMinutes }).ToListAsync();
            var ids = trips.Select(t => t.Id).ToList();
            var pax = await db.Bookings.AsNoTracking().Where(b => ids.Contains(b.TripId))
                .SelectMany(b => b.Passengers.Where(p => p.Status == "CONFIRMED").Select(p => new { b.TripId, p.BoardingStatus })).ToListAsync();
            var prefix = day.ToString("yyyy-MM-dd");
            var unread = (await db.ChatMessages.AsNoTracking().Where(m => m.Direction == "in" && !m.Read).Select(m => m.ConversationId).ToListAsync())
                .Select(c => c.Split('_')).Where(p => p.Length > 2 && p[2] == prefix).GroupBy(p => p[1]).ToDictionary(x => x.Key, x => x.Count());
            return Results.Ok(new
            {
                date = prefix,
                trips = trips.Select(t => new
                {
                    id = t.Id, delay_minutes = t.DelayMinutes, unread_chats = unread.GetValueOrDefault(t.ServiceNumber),
                    counts = new { checked_in = pax.Count(p => p.TripId == t.Id && string.Equals(p.BoardingStatus, "checked_in", StringComparison.OrdinalIgnoreCase)) },
                }),
            });
        }).RequireAuthorization(Policies.Reports);
    }
}
