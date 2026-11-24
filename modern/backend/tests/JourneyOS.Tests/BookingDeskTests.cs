using System.Net;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using static JourneyOS.Tests.RedBusClient;

namespace JourneyOS.Tests;

/// <summary>Real HTTP/PostgreSQL authorization, quote and cancellation state transitions.</summary>
[Collection("gds")]
public sealed class BookingDeskTests(GdsFixture fx)
{
    [Fact]
    public async Task Operator_booking_can_be_quoted_cancelled_and_audited_without_claiming_payout()
    {
        var rb = fx.Factory.CreateClient();
        var f = await FindTrip(rb, 5);
        var tripId = await fx.Sql(db => db.OtaInventories.Where(i => i.Id == f.InventoryId).Select(i => i.TripId).FirstAsync());
        var (bp, dp) = await fx.Sql(async db =>
        {
            var routeId = await db.Trips.Where(t => t.Id == tripId).Select(t => t.RouteId).FirstAsync();
            var stages = await db.RouteStages.Where(s => s.RouteId == routeId).ToListAsync();
            return (stages.Where(s => s.Kind == "pickup").OrderBy(s => s.StopSequence).First().Id,
                stages.Where(s => s.Kind == "drop").OrderBy(s => s.StopSequence).Last().Id);
        });
        var seat = (string)f.Seats[0]!["name"]!;
        using var admin = fx.Factory.Admin();
        var (created, booked) = await admin.Post("/api/admin/bookings/counter", new
        {
            tripId, boardingPointId = bp, droppingPointId = dp,
            channel = "counter", paymentMethod = "cash", paymentReference = "counter-test",
            passengers = new[] { new { seat, name = "Cancellation QA", age = 32, gender = "M", primary = true } }
        });
        Assert.Equal(HttpStatusCode.OK, created);
        var pnr = (string)booked!["pnr"]!;

        // This is a read-only policy quote: no seat release or settlement yet.
        var (qs, quote) = await admin.Post($"/api/admin/bookings/{pnr}/cancellation-quote", new { seats = new[] { seat } });
        Assert.Equal(HttpStatusCode.OK, qs);
        Assert.Equal(pnr, (string)quote!["pnr"]!);
        var charged = (decimal)quote["charge"]!;
        var refunded = (decimal)quote["refund"]!;
        Assert.Equal((decimal)booked["totalFare"]!, charged + refunded);
        Assert.Equal("CONFIRMED", await fx.Sql(db => db.Bookings.Where(b => b.Pnr == pnr).Select(b => b.Status).SingleAsync()));

        var (bad, _) = await admin.Post($"/api/admin/bookings/{pnr}/cancellation-quote", new { seats = new[] { seat, seat } });
        Assert.Equal(HttpStatusCode.BadRequest, bad);

        var (status, result) = await admin.Post($"/api/admin/bookings/{pnr}/cancel", new { seats = new[] { seat }, notes = "Verified passenger request" });
        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("CANCELLED", (string)result!["status"]!);
        Assert.Equal("PENDING_EXTERNAL_SETTLEMENT", (string)result["settlementStatus"]!);
        Assert.Equal(refunded, (decimal)result["refund"]!);
        var bookingId = await fx.Sql(db => db.Bookings.Where(b => b.Pnr == pnr).Select(b => b.Id).SingleAsync());
        Assert.True(await fx.Sql(db => db.Cancellations.AnyAsync(c => c.BookingId == bookingId && c.Notes == "Verified passenger request")));
        Assert.True(await fx.Sql(db => db.AuditLogs.AnyAsync(a => a.Action == "CANCEL" && a.Entity == "booking" && a.EntityId == pnr)));

        var (again, _) = await admin.Post($"/api/admin/bookings/{pnr}/cancel", new { seats = new[] { seat }, notes = "retry" });
        Assert.Equal(HttpStatusCode.Conflict, again);
        using var other = fx.Factory.Admin(GdsFactory.OtherTenantKey);
        var (crossTenant, _) = await other.Post($"/api/admin/bookings/{pnr}/cancellation-quote", new { seats = new[] { seat } });
        Assert.Equal(HttpStatusCode.NotFound, crossTenant);
    }

    [Fact]
    public async Task Redbus_owned_ticket_cannot_be_cancelled_from_operator_desk()
    {
        var rb = fx.Factory.CreateClient();
        var f = await FindTrip(rb, 6);
        var pnr = await Book(rb, f, f.Seats[0]!);
        using var admin = fx.Factory.Admin();
        var seat = (string)f.Seats[0]!["name"]!;
        var (quoted, body) = await admin.Post($"/api/admin/bookings/{pnr}/cancellation-quote", new { seats = new[] { seat } });
        Assert.Equal(HttpStatusCode.Conflict, quoted);
        Assert.Equal("PROVIDER_MANAGED", (string)body!["errorCode"]!);
        var (cancelled, _) = await admin.Post($"/api/admin/bookings/{pnr}/cancel", new { seats = new[] { seat }, notes = "invalid" });
        Assert.Equal(HttpStatusCode.Conflict, cancelled);
        Assert.Equal("CONFIRMED", await fx.Sql(db => db.Bookings.Where(b => b.Pnr == pnr).Select(b => b.Status).SingleAsync()));
    }
}
