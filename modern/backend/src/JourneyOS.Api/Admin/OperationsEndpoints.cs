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
