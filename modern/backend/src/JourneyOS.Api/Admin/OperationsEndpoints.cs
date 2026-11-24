using JourneyOS.Api.Accounts;
using JourneyOS.Api.Operations;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public static class OperationsEndpoints
{
    private static string Actor(HttpContext h) => h.User.Identity!.Name!;

    public static void MapOperations(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization().WithTags("Operations");
        var ops = Policies.Operations;

        // fleet
        g.MapGet("/vehicles", async (GdsDbContext db) => Results.Ok(await db.Vehicles.AsNoTracking().OrderBy(v => v.RegistrationNumber).ToListAsync())).RequireAuthorization(ops);
        g.MapPost("/vehicles", async (VehicleInput i, OperationsService s, HttpContext h) => Results.Ok(await s.SaveVehicleAsync(null, i, Actor(h)))).RequireAuthorization(ops);
        g.MapPut("/vehicles/{id:long}", async (long id, VehicleInput i, OperationsService s, HttpContext h) => Results.Ok(await s.SaveVehicleAsync(id, i, Actor(h)))).RequireAuthorization(ops);

        // staff
        g.MapGet("/staff", async (GdsDbContext db) => Results.Ok(await db.Staff.AsNoTracking().OrderBy(v => v.Name).ToListAsync())).RequireAuthorization(ops);
        g.MapPost("/staff", async (StaffInput i, OperationsService s, HttpContext h) => Results.Ok(await s.SaveStaffAsync(null, i, Actor(h)))).RequireAuthorization(ops);
        g.MapPut("/staff/{id:long}", async (long id, StaffInput i, OperationsService s, HttpContext h) => Results.Ok(await s.SaveStaffAsync(id, i, Actor(h)))).RequireAuthorization(ops);

        // assignments
        g.MapGet("/trips/{id:long}/assignments", async (long id, GdsDbContext db) =>
            Results.Ok(await db.TripAssignments.AsNoTracking().Where(a => a.TripId == id).OrderByDescending(a => a.IsActive).ThenBy(a => a.Role).ToListAsync())).RequireAuthorization(ops);
        g.MapPost("/trips/{id:long}/assignments", async (long id, AssignInput i, OperationsService s, HttpContext h) => Results.Ok(await s.AssignAsync(id, i, Actor(h)))).RequireAuthorization(ops);

        // fares / blocks / generation
        g.MapGet("/routes", async (GdsDbContext db) => Results.Ok(await db.Routes.AsNoTracking().Include(r => r.Fares).Include(r => r.Stages).OrderBy(r => r.ServiceNumber)
            .Select(r => new { r.Id, r.Name, r.ServiceNumber, r.Status, r.DepartureTime,
                fares = r.Fares.OrderBy(f => f.FromSequence).ThenBy(f => f.ToSequence).Select(f => new { f.FromSequence, f.ToSequence, f.Seater, f.SleeperLower, f.SleeperUpper }),
                stages = r.Stages.OrderBy(s => s.StopSequence).ThenBy(s => s.Time).Select(s => new { s.Id, s.Kind, s.Name, s.StopSequence, s.Time }) }).ToListAsync()))
            .RequireAuthorization(ops);
        g.MapPut("/routes/{id:long}/fares", async (long id, List<FareInput> i, OperationsService s, HttpContext h) => Results.Ok(new { updated = await s.UpdateFaresAsync(id, i, Actor(h)) })).RequireAuthorization(ops);
        g.MapPost("/routes/{id:long}/generate", async (long id, GenerateInput i, OperationsService s, HttpContext h) => Results.Ok(new { created = await s.GenerateTripsAsync(id, i, Actor(h)) })).RequireAuthorization(ops);
        g.MapPost("/trips/{id:long}/blocks", async (long id, BlockInput i, OperationsService s, HttpContext h) => Results.Ok(new { blocked = await s.BlockSeatsAsync(id, i, Actor(h)) })).RequireAuthorization(ops);
        g.MapDelete("/trips/{id:long}/blocks/{seat}", async (long id, string seat, OperationsService s, HttpContext h) => Results.Ok(new { released = await s.UnblockSeatAsync(id, seat, Actor(h)) })).RequireAuthorization(ops);

        // v50 parity: route/date passenger-site link is configured per operator.
        // Never advertise an internal GDS URL as a customer-booking link.
        g.MapGet("/trips/{id:long}/share-link",
            async (long id, int? fromSequence, int? toSequence,
                PassengerBookingShareService share, HttpContext h) =>
            {
                h.Response.Headers.CacheControl = "private, no-store";
                return Results.Ok(await share.ForTripAsync(id, fromSequence, toSequence));
            }).RequireAuthorization(ops);

        // Schedule Manage / Bookings: authoritative selected-segment coach geometry.
        // Distinct from the older all-segments /seats endpoint used by Dispatch.
        // Return only what the user is permitted to see, and never derive
        // availability from cached or client-calculated occupancy.
        g.MapGet("/trips/{id:long}/seat-layout", async (long id, int? fromSequence, int? toSequence,
            GdsDbContext db, JourneyOS.Api.Inventory.InventoryService inventory) =>
        {
            var trip = await db.Trips.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
            if (trip is null) return Results.NotFound(new { message = "Service not found" });
            var route = await inventory.LoadRouteAsync(trip.RouteId);
            var ordered = route.Stops.OrderBy(x => x.Sequence).ToList();
            if (ordered.Count < 2) return Results.Conflict(new { message = "Route has no valid segment" });
            var from = fromSequence ?? ordered[0].Sequence;
            var to = toSequence ?? ordered[^1].Sequence;
            if (from >= to || !ordered.Any(x => x.Sequence == from) || !ordered.Any(x => x.Sequence == to))
                return Results.BadRequest(new { message = "Choose an ordered pair of route cities" });

            var states = await inventory.SeatStatesAsync(trip, route, from, to);
            var occupied = await db.SeatAllocations.AsNoTracking()
                .Where(a => a.TripId == id && a.IsActive && a.FromSeq < to && from < a.ToSeq)
                .ToListAsync();
            var bySeat = occupied.GroupBy(a => a.CoachSeatId)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(a => a.Kind == AllocationKind.Booked)
                    .ThenByDescending(a => a.Kind == AllocationKind.Hold).First());

            return Results.Ok(new {
                tripId = trip.Id,
                travelDate = trip.TravelDate.ToString("yyyy-MM-dd"),
                status = trip.Status,
                bookable = trip.Bookable,
                serviceNumber = route.ServiceNumber,
                routeName = route.Name,
                coachName = route.CoachTemplate?.Name ?? "Coach",
                fromSequence = from,
                toSequence = to,
                stops = ordered.Select(x => new {
                    sequence = x.Sequence, cityId = x.CityId,
                    name = x.City?.Name ?? $"City #{x.CityId}",
                    day = x.Day, time = x.Time.ToString("HH:mm")
                }).ToArray(),
                stages = route.Stages.OrderBy(x => x.StopSequence).ThenBy(x => x.Time)
                    .Select(x => new {
                        id = x.Id, kind = x.Kind, name = x.Name, stopSequence = x.StopSequence,
                        day = x.Day, time = x.Time.ToString("HH:mm")
                    }).ToArray(),
                seats = states.Select(x => {
                    bySeat.TryGetValue(x.Seat.Id, out var alloc);
                    var state = alloc is null ? (x.Available ? "available" : "unavailable") :
                        alloc.Kind switch {
                            AllocationKind.Booked => "booked",
                            AllocationKind.Hold => "held",
                            AllocationKind.Blocked => "blocked",
                            _ => "unavailable"
                        };
                    return new {
                        seatCode = x.Seat.Code, deck = x.Seat.Deck,
                        row = x.Seat.Row, col = x.Seat.Col,
                        width = x.Seat.Width, length = x.Seat.Length,
                        seatType = x.Seat.SeatType, state,
                        gender = alloc?.Gender,
                        ladiesOnly = x.LadiesOnly, malesOnly = x.MalesOnly,
                        fare = x.Price?.Fare
                    };
                }).ToArray()
            });
        }).RequireAuthorization(ops);

        // Audit-backed operator History. Historical events are only displayed
        // when an actual audit row exists; never backfill invented actions or
        // timestamps to imitate the legacy screenshots.
        g.MapGet("/trips/{id:long}/history", async (long id, GdsDbContext db) =>
        {
            if (!await db.Trips.AsNoTracking().AnyAsync(t => t.Id == id))
                return Results.NotFound(new { message = "Service not found" });
            var key = id.ToString(System.Globalization.CultureInfo.InvariantCulture);
            return Results.Ok(await db.AuditLogs.AsNoTracking()
                .Where(e => e.Entity == "trip" && e.EntityId == key)
                .OrderByDescending(e => e.At).ThenByDescending(e => e.Id)
                .Take(300)
                .Select(e => new
                {
                    id = e.Id, at = e.At, action = e.Action, actor = e.Actor
                })
                .ToArrayAsync());
        }).RequireAuthorization(ops);

        g.MapGet("/trips/{id:long}/booking-chart", async (long id, GdsDbContext db) =>
        {
            if (!await db.Trips.AsNoTracking().AnyAsync(t => t.Id == id))
                return Results.NotFound(new { message = "Service not found" });
            // No passenger phone, email, ID or payment token in chart response.
            return Results.Ok(await db.Bookings.AsNoTracking().Where(b => b.TripId == id)
                .Include(b => b.Passengers).OrderBy(b => b.Pnr)
                .Select(b => new {
                    b.Pnr, b.Status, b.Channel, b.TotalFare,
                    passengers = b.Passengers.Select(p => new {
                        p.SeatCode, p.Name, p.Status, p.BoardingStatus
                    })
                }).ToArrayAsync());
        }).RequireAuthorization(ops);

        // seat map with current occupancy (any active allocation on any segment)
        g.MapGet("/trips/{id:long}/seats", async (long id, GdsDbContext db) =>
        {
            var trip = await db.Trips.AsNoTracking().Include(t => t.Route).ThenInclude(r => r!.CoachTemplate).ThenInclude(c => c!.Seats).FirstOrDefaultAsync(t => t.Id == id);
            if (trip is null) return Results.NotFound();
            var allocs = await db.SeatAllocations.AsNoTracking().Where(a => a.TripId == id && a.IsActive).ToListAsync();
            return Results.Ok(trip.Route!.CoachTemplate!.Seats.OrderBy(s => s.Deck).ThenBy(s => s.Row).ThenBy(s => s.Col).Select(s =>
            {
                var a = allocs.Where(x => x.CoachSeatId == s.Id).ToList();
                return new { seatCode = s.Code, s.Deck, s.Row, s.Col, s.SeatType, occupied = a.Count > 0,
                    state = a.Any(x => x.Kind == AllocationKind.Booked) ? "booked" : a.Any(x => x.Kind == AllocationKind.Hold) ? "held" : a.Any(x => x.Kind == AllocationKind.Blocked) ? "blocked" : "free",
                    gender = a.Select(x => x.Gender).FirstOrDefault(x => x != null) };
            }));
        }).RequireAuthorization(ops);

        // counter / agent booking
        g.MapPost("/bookings/counter", async (CounterBookingInput i, OperationsService s, GdsDbContext db, HttpContext h) =>
        {
            var b = await s.CounterBookAsync(i, Actor(h));
            var pay = await db.Payments.AsNoTracking().Where(p => p.BookingId == b.Id).ToListAsync();
            return Results.Ok(new { b.Pnr, b.Status, b.TotalFare, b.Channel, payments = pay.Select(p => new { p.Amount, p.Method, p.Status }) });
        }).RequireAuthorization(ops);
        g.MapGet("/bookings/{pnr}", async (string pnr, GdsDbContext db) =>
        {
            var b = await db.Bookings.AsNoTracking().Include(x => x.Passengers).FirstOrDefaultAsync(x => x.Pnr == pnr);
            if (b is null) return Results.NotFound();
            var pay = await db.Payments.AsNoTracking().Where(p => p.BookingId == b.Id).ToListAsync();
            var fin = await db.BookingFinances.AsNoTracking().FirstOrDefaultAsync(f => f.BookingId == b.Id);
            return Results.Ok(new { b.Pnr, b.Status, b.Channel, b.TotalFare, b.TripId, passengers = b.Passengers.Select(p => new { p.SeatCode, p.Name, p.Status }), payments = pay, finance = fin });
        }).RequireAuthorization(Policies.IntegrationRead);

        // reconciliation
        var rc = g.MapGroup("/reconciliation/invoices").RequireAuthorization(Policies.Accounts);
        rc.MapGet("", async (GdsDbContext db) => Results.Ok(await db.OtaInvoices.AsNoTracking().OrderByDescending(x => x.UploadedAt)
            .Select(x => new { x.Id, x.InvoiceNumber, x.FileName, x.PeriodStart, x.PeriodEnd, x.Status, x.UploadedAt, x.UploadedBy, lines = x.Lines.Count,
                outstanding = x.Lines.Count(l => l.Status != "matched" && l.ResolutionAction == null) }).ToListAsync()));
        rc.MapPost("", async (InvoiceUpload u, ReconciliationService s, HttpContext h) =>
        {
            var (inv, dup) = await s.UploadAsync(u, Actor(h));
            return Results.Ok(new { inv.Id, duplicate = dup, totals = dup ? null : ReconciliationService.Totals(inv) });
        });
        rc.MapGet("/{id:long}", async (long id, GdsDbContext db) =>
        {
            var inv = await db.OtaInvoices.AsNoTracking().Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id);
            return inv is null ? Results.NotFound() : Results.Ok(new { inv.Id, inv.InvoiceNumber, inv.PeriodStart, inv.PeriodEnd, inv.Status, inv.WarningsJson, totals = ReconciliationService.Totals(inv) });
        });
        rc.MapGet("/{id:long}/lines", async (long id, string? status, GdsDbContext db) =>
        {
            if (!await db.OtaInvoices.AnyAsync(x => x.Id == id)) return Results.NotFound();
            var q = db.OtaInvoiceLines.AsNoTracking().Where(l => l.InvoiceId == id);
            if (!string.IsNullOrEmpty(status)) q = q.Where(l => l.Status == status);
            return Results.Ok(await q.OrderBy(l => l.Section).ThenBy(l => l.Pnr).Take(5000).ToListAsync());
        });
        rc.MapGet("/{id:long}/export", async (long id, GdsDbContext db) =>
        {
            var inv = await db.OtaInvoices.AsNoTracking().Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id);
            if (inv is null) return Results.NotFound();
            var csv = ReconciliationService.ExportCsv(inv.Lines.OrderBy(l => l.Section).ThenBy(l => l.Pnr));
            return Results.File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv", $"reconciliation-{inv.InvoiceNumber}.csv");
        });
        rc.MapPost("/{id:long}/recheck", async (long id, GdsDbContext db, ReconciliationService s) =>
        {
            var inv = await db.OtaInvoices.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id);
            if (inv is null) return Results.NotFound();
            await s.CompareAsync(inv);
            await db.SaveChangesAsync();
            return Results.Ok(ReconciliationService.Totals(inv));
        });
        rc.MapPost("/{id:long}/resolve", async (long id, ResolveInput r, ReconciliationService s, HttpContext h) =>
        {
            var l = await s.ResolveAsync(id, r, Actor(h));
            return Results.Ok(new { l.Id, l.ResolutionAction, l.ResolvedBy });
        });
    }
}
