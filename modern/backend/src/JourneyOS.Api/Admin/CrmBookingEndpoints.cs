using System.Security.Claims;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

/// <summary>
/// CRM booking detail (legacy <c>GET /api/crm/booking/:pnr</c>, crm-screenshot-v8.js openBooking + crm-journey-v45 seat map).
/// The seat map only exposes aggregate state and whether a seat belongs to the requested PNR — never other passengers'
/// names, PNRs or contacts. Seat fares use the same <see cref="FareCalculator"/> as RedBus seat layouts (segment of this booking).
/// Fields the platform does not record (booking comments, coupons, miles redeemed) are returned empty, never guessed.
/// </summary>
public static class CrmBookingEndpoints
{
    private static bool SeePhone(HttpContext h) => (h.User.FindFirstValue(ClaimTypes.Role) ?? "viewer") is "owner" or "admin" or "ops";
    private static string? Mask(string? p, bool see) => see || string.IsNullOrEmpty(p) || p.Length < 8 ? p : $"{p[..2]}xxxxxx{p[^2..]}";

    public static void MapCrmBooking(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/crm/booking/{pnr}", async (string pnr, GdsDbContext db, HttpContext h) =>
        {
            var key = pnr.Trim();
            var b = await db.Bookings.AsNoTracking().Include(x => x.Passengers)
                .FirstOrDefaultAsync(x => x.Pnr == key || (key.Length == 6 && x.Pnr.EndsWith(key)))
                ?? throw new GdsException("BOOKING_NOT_FOUND", "Booking not found", 404);
            var trip = await db.Trips.AsNoTracking().FirstAsync(t => t.Id == b.TripId);
            var route = await db.Routes.AsNoTracking().AsSplitQuery().Include(r => r.Stages).Include(r => r.Fares).Include(r => r.SeatFareRules)
                .Include(r => r.CoachTemplate).ThenInclude(c => c!.Seats).FirstAsync(r => r.Id == trip.RouteId);
            var pay = await db.Payments.AsNoTracking().Where(p => p.BookingId == b.Id).OrderBy(p => p.Id).FirstOrDefaultAsync();
            var fin = await db.BookingFinances.AsNoTracking().FirstOrDefaultAsync(f => f.BookingId == b.Id);
            var allocs = await db.SeatAllocations.AsNoTracking().Where(a => a.TripId == trip.Id && a.IsActive).ToListAsync();
            var paxIds = allocs.Where(a => a.BookingPassengerId != null).Select(a => a.BookingPassengerId!.Value).Distinct().ToList();
            var pax = await db.BookingPassengers.AsNoTracking().Where(p => paxIds.Contains(p.Id)).Select(p => new { p.Id, p.BookingId, p.BoardingStatus }).ToDictionaryAsync(p => p.Id);
            var see = SeePhone(h);

            var stage = (long id) => route.Stages.FirstOrDefault(s => s.Id == id);
            var bp = stage(b.BoardingStageId); var dp = stage(b.DroppingStageId);
            var status = b.Status switch { "CANCELLED" => "cancelled", _ => "confirmed" };
            var primary = b.Passengers.FirstOrDefault(p => p.IsPrimary) ?? b.Passengers.OrderBy(p => p.Id).FirstOrDefault();
            var gross = b.Passengers.Sum(p => p.BaseFare);
            var gst = fin?.Gst ?? (b.Passengers.Sum(p => p.Gst) is var pg && pg > 0 ? pg : b.TotalFare - gross);

            string SeatState(CoachSeat s, out bool current)
            {
                current = false;
                var mine = allocs.Where(a => a.CoachSeatId == s.Id).ToList();
                var overlap = mine.Where(a => a.FromSeq < b.ToSeq && b.FromSeq < a.ToSeq).ToList();
                var booked = overlap.FirstOrDefault(a => a.Kind == AllocationKind.Booked);
                if (booked is not null)
                {
                    pax.TryGetValue(booked.BookingPassengerId ?? 0, out var p);
                    current = p?.BookingId == b.Id;
                    return p?.BoardingStatus == "No-Show" ? "no_show" : booked.Gender is "F" or "Female" ? "booked_female" : "booked_male";
                }
                if (overlap.Any(a => a.Kind == AllocationKind.Hold)) return "hold";
                if (mine.Any(a => a.Kind != AllocationKind.Blocked)) return "other_leg";
                return overlap.Any(a => a.Kind == AllocationKind.Blocked) ? "blocked" : "available";
            }
            var seats = route.CoachTemplate?.Seats ?? [];
            var decks = seats.GroupBy(s => s.Deck).OrderBy(g => g.Key == "LOWER" ? 0 : 1).Select(g => new
            {
                deck = g.Key,
                rows = g.Max(s => s.Row + Math.Max(1, s.Length)),
                cols = g.Max(s => s.Col + Math.Max(1, s.Width)),
                seats = g.OrderBy(s => s.Id).Select(s =>
                {
                    var st = SeatState(s, out var current);
                    var fare = FareCalculator.ListedFare(route, s, b.FromSeq, b.ToSeq, trip.TravelDate, trip);
                    return new
                    {
                        code = s.Code, row = s.Row, col = s.Col, w = s.Width, h = s.Length, type = s.SeatType, status = st, fare,
                        reservationCount = allocs.Count(a => a.CoachSeatId == s.Id && a.Kind is AllocationKind.Booked or AllocationKind.Hold),
                        booking = current || st.StartsWith("booked") || st == "no_show" ? new { isCurrent = current } : null,
                    };
                }).ToList(),
            }).ToList();

            return Results.Ok(new
            {
                booking = new
                {
                    b.Pnr, ticketNumber = b.Pnr.Length > 6 ? b.Pnr[^6..] : b.Pnr, service = route.ServiceNumber, source = b.Channel, status,
                    payment = pay?.Status switch { "PAID" => "paid", "PENDING" => "settle_later", "RECEIVABLE" => "receivable", null => null, var x => x.ToLowerInvariant() },
                    paymentMethod = pay?.Method, travelDate = trip.TravelDate, bookedAt = b.DateOfIssue, scheduleId = trip.Id, routeId = route.Id,
                    passengers = b.Passengers.OrderBy(p => p.Id).Select(p => new
                    {
                        seat = p.SeatCode, p.Name, p.Gender, age = p.Age > 0 ? p.Age : (int?)null, fare = p.BaseFare,
                        status = p.Status == "CANCELLED" ? "cancelled" : p.BoardingStatus switch { "Boarded" => "boarded", "No-Show" => "no_show", _ => "booked" },
                    }),
                    fare = new { gross, discount = 0m, net = gross, gst, total = b.TotalFare, commission = fin?.OtaCommission, milesDiscount = 0m },
                    amount = b.TotalFare,
                    from = bp?.Name, to = dp?.Name,
                    boarding = bp is null ? null : new { bp.Name, time = bp.Time.ToString("HH:mm"), bp.Day },
                    dropping = dp is null ? null : new { dp.Name, time = dp.Time.ToString("HH:mm"), dp.Day },
                    contact = new { name = primary?.Name, phone = Mask(b.ContactMobile, see), email = b.ContactEmail ?? "" },
                    comments = Array.Empty<object>(),
                },
                map = new { coach = route.CoachTemplate is null ? null : new { route.CoachTemplate.Id, route.CoachTemplate.Name, capacity = seats.Count }, decks },
            });
        }).RequireAuthorization(Policies.Reports).WithTags("CRM");
    }
}
