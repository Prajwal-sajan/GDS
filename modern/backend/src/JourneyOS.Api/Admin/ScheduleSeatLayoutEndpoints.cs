using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

/// <summary>
/// Schedule → Bookings seat layout (legacy <c>GET /api/schedules/:id/seat-layout?from_city_id&amp;to_city_id</c> rendered by
/// schedule-manage-v48 seatDiagram). Per-seat geometry (w/h for berths), state for the requested segment, listed fare
/// (same <see cref="FareCalculator"/> as RedBus/CRM) and the reservation counter badge.
/// </summary>
public static class ScheduleSeatLayoutEndpoints
{
    public static void MapScheduleSeatLayout(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/schedules/{id:long}/seat-layout", async (long id, int? from, int? to, GdsDbContext db) =>
        {
            var trip = await db.Trips.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id)
                ?? throw new GdsException("TRIP_NOT_FOUND", "Schedule not found", 404);
            var route = await db.Routes.AsNoTracking().AsSplitQuery().Include(r => r.Stages).Include(r => r.Fares).Include(r => r.SeatFareRules)
                .Include(r => r.CoachTemplate).ThenInclude(c => c!.Seats).FirstAsync(r => r.Id == trip.RouteId);
            var allAllocs = await db.SeatAllocations.AsNoTracking().Where(a => a.TripId == id).ToListAsync();
            var allocs = allAllocs.Where(a => a.IsActive).ToList();
            var paxIds = allocs.Where(a => a.BookingPassengerId != null).Select(a => a.BookingPassengerId!.Value).Distinct().ToList();
            var pax = await db.BookingPassengers.AsNoTracking().Where(p => paxIds.Contains(p.Id))
                .Join(db.Bookings, p => p.BookingId, b => b.Id, (p, b) => new { p.Id, p.BoardingStatus, p.Gender, b.Pnr })
                .ToDictionaryAsync(p => p.Id);
            var maxSeq = Math.Max(1, allocs.Count > 0 ? allocs.Max(a => a.ToSeq) : 1);
            var seqs = route.Fares.SelectMany(f => new[] { f.FromSequence, f.ToSequence }).ToList();
            int fs = from ?? (seqs.Count > 0 ? seqs.Min() : 0), ts = to ?? (seqs.Count > 0 ? seqs.Max() : maxSeq);
            if (ts <= fs) throw new GdsException("INVALID_SEGMENT", "Destination must come after origin", 400);

            var seats = route.CoachTemplate?.Seats ?? [];
            var decks = seats.GroupBy(s => s.Deck).OrderBy(g => g.Key == "LOWER" ? 0 : 1).Select(g => new
            {
                deck = g.Key,
                rows = g.Max(s => s.Row + Math.Max(1, s.Length)),
                cols = g.Max(s => s.Col + Math.Max(1, s.Width)),
                seats = g.OrderBy(s => s.Id).Select(s =>
                {
                    var mine = allocs.Where(a => a.CoachSeatId == s.Id).ToList();
                    var overlap = mine.Where(a => a.FromSeq < ts && fs < a.ToSeq).ToList();
                    var booked = overlap.FirstOrDefault(a => a.Kind == AllocationKind.Booked);
                    string status; string? pnr = null;
                    if (booked is not null)
                    {
                        pax.TryGetValue(booked.BookingPassengerId ?? 0, out var p);
                        pnr = p?.Pnr;
                        var g2 = booked.Gender ?? p?.Gender;
                        status = p?.BoardingStatus == "No-Show" ? "no_show" : g2 is "F" or "Female" or "FEMALE" ? "booked_female" : "booked_male";
                    }
                    else if (overlap.Any(a => a.Kind == AllocationKind.Hold)) status = "hold";
                    else if (overlap.Any(a => a.Kind == AllocationKind.Blocked)) status = "blocked";
                    else status = "available";
                    decimal? fare = null;
                    try { fare = FareCalculator.ListedFare(route, s, fs, ts, trip.TravelDate, trip); } catch (GdsException) { }
                    return new
                    {
                        code = s.Code, row = s.Row, col = s.Col, w = Math.Max(1, s.Width), h = Math.Max(1, s.Length), type = s.SeatType, status, fare, pnr,
                        reservationCount = allAllocs.Count(a => a.CoachSeatId == s.Id && a.Kind == AllocationKind.Booked),
                    };
                }).ToList(),
            }).ToList();
            return Results.Ok(new { from = fs, to = ts, decks });
        }).RequireAuthorization(Policies.Reports).WithTags("Schedules");
    }
}
