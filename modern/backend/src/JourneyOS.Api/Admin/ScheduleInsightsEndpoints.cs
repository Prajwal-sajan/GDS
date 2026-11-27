using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

/// <summary>
/// Legacy schedule-insights-v36: month occupancy calendar (with the verified 2026 holiday list) and the route bus-halts
/// overview. No provider-verified GPS halt observations are stored in the modern backend, so halts report
/// <c>awaiting_verified_gps</c> instead of inventing corrections.
/// </summary>
public static class ScheduleInsightsEndpoints
{
    private static readonly (string Date, string Name, string Type)[] Holidays2026 =
    [
        ("2026-01-01", "New Year’s Day", "restricted"), ("2026-01-26", "Republic Day", "gazetted"),
        ("2026-03-04", "Holi", "gazetted"), ("2026-03-21", "Id-ul-Fitr", "gazetted"),
        ("2026-03-26", "Ram Navami", "gazetted"), ("2026-03-31", "Mahavir Jayanti", "gazetted"),
        ("2026-04-03", "Good Friday", "gazetted"), ("2026-05-01", "Buddha Purnima", "gazetted"),
        ("2026-05-27", "Id-ul-Zuha (Bakrid)", "gazetted"), ("2026-06-26", "Muharram", "gazetted"),
        ("2026-08-15", "Independence Day", "gazetted"), ("2026-08-26", "Milad-un-Nabi", "gazetted"),
        ("2026-09-04", "Janmashtami", "gazetted"), ("2026-10-02", "Gandhi Jayanti", "gazetted"),
        ("2026-10-20", "Dussehra", "gazetted"), ("2026-11-01", "Andhra Pradesh Formation Day", "observance"),
        ("2026-11-08", "Diwali", "gazetted"), ("2026-11-09", "Govardhan Puja", "restricted"),
        ("2026-11-14", "Children’s Day", "observance"), ("2026-11-24", "Guru Nanak Jayanti", "gazetted"),
        ("2026-12-25", "Christmas Day", "gazetted"),
    ];

    public static void MapScheduleInsights(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/schedules/month-insights", async (string? month, GdsDbContext db) =>
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var first = new DateOnly(today.Year, today.Month, 1);
            if (!string.IsNullOrWhiteSpace(month) && DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", out var m)) first = m;
            var last = first.AddMonths(1).AddDays(-1);
            var trips = await db.Trips.AsNoTracking().Where(t => t.TravelDate >= first && t.TravelDate <= last && t.Status == "active")
                .Select(t => new { t.Id, t.TravelDate, Cap = t.Route!.CoachTemplate!.Seats.Count }).ToListAsync();
            var ids = trips.Select(t => t.Id).ToList();
            var booked = await db.BookingPassengers.AsNoTracking().Where(p => p.Status == "CONFIRMED")
                .Join(db.Bookings.Where(b => ids.Contains(b.TripId) && (b.Status == "CONFIRMED" || b.Status == "PARTIALLY_CANCELLED")),
                    p => p.BookingId, b => b.Id, (p, b) => b.TripId)
                .GroupBy(x => x).Select(g => new { TripId = g.Key, N = g.Count() }).ToDictionaryAsync(x => x.TripId, x => x.N);
            var days = new List<object>();
            for (var d = first; d <= last; d = d.AddDays(1))
            {
                var dt = trips.Where(t => t.TravelDate == d).ToList();
                var cap = dt.Sum(t => t.Cap);
                var bk = dt.Sum(t => booked.GetValueOrDefault(t.Id));
                days.Add(new { date = d.ToString("yyyy-MM-dd"), booked_seats = bk, capacity = cap, services = dt.Count,
                    percent = cap > 0 ? (int?)Math.Round(bk * 100.0 / cap) : null });
            }
            var prefix = first.ToString("yyyy-MM");
            return Results.Ok(new
            {
                month = prefix, daily = days,
                holidays = first.Year == 2026 ? Holidays2026.Where(h => h.Date.StartsWith(prefix)).Select(h => new { date = h.Date, name = h.Name, kind = h.Type,
                    source_url = h.Type == "restricted" ? "https://cdaguwahati.gov.in/pages/restrictedholidays2026.aspx"
                        : h.Date == "2026-11-01" ? "https://www.cgca.gov.in/ccaap/list-of-holiday"
                        : h.Date == "2026-11-14" ? "https://dpl.rashtrapatibhavan.gov.in/public/" : "https://cgca.gov.in/ccadl/list-of-holiday" }).ToArray() : [],
                holidays_verified_for_year = first.Year == 2026,
            });
        });

        // Search services (legacy openSearch → from_city_id/to_city_id filter): routes whose stop order serves from → to.
        app.MapGet("/api/admin/schedules/city-routes", async (long? from, long? to, GdsDbContext db) =>
        {
            var stops = await db.Routes.AsNoTracking().SelectMany(r => r.Stops.Select(s => new { s.RouteId, s.CityId, s.Sequence })).ToListAsync();
            var ids = stops.GroupBy(s => s.RouteId).Where(g =>
            {
                var f = from is null ? (int?)int.MinValue : g.Where(s => s.CityId == from).Select(s => (int?)s.Sequence).Min();
                var t = to is null ? (int?)int.MaxValue : g.Where(s => s.CityId == to).Select(s => (int?)s.Sequence).Max();
                return f != null && t != null && f < t;
            }).Select(g => g.Key).ToArray();
            return Results.Ok(new { route_ids = ids });
        });

        app.MapGet("/api/admin/routes/halts-overview", async (int? days, GdsDbContext db) =>
        {
            var n = days is 7 or 30 ? days.Value : 15;
            var routes = await db.Routes.AsNoTracking().Where(r => r.Status == "active").OrderBy(r => r.ServiceNumber)
                .Select(r => new { r.Id, r.ServiceNumber, Stops = r.Stages.Count(),
                    Origin = r.Stops.OrderBy(s => s.Sequence).Select(s => s.City!.Name).FirstOrDefault(),
                    Destination = r.Stops.OrderByDescending(s => s.Sequence).Select(s => s.City!.Name).FirstOrDefault() }).ToListAsync();
            return Results.Ok(new
            {
                days = n, data_status = "awaiting_verified_gps", totals = new { pins_to_move = (int?)null, times_to_change = (int?)null },
                routes = routes.Select(r => new { id = r.Id, service_number = r.ServiceNumber, origin = r.Origin, destination = r.Destination,
                    provider_evidence = false, from_date = (string?)null, to_date = (string?)null, trips = (int?)null,
                    pins_to_move = (int?)null, times_to_change = (int?)null, fine = (int?)null, waiting = r.Stops }),
            });
        });
    }
}
