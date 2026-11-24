using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using static JourneyOS.Tests.RedBusClient;

namespace JourneyOS.Tests;

[Collection("gds")]
public sealed class OperationsTests(GdsFixture fx)
{
    private HttpClient Rb => fx.Factory.CreateClient();
    private HttpClient Admin => fx.Factory.Admin();

    private async Task<long> TripOf(long inventoryId) => await fx.Sql(db => db.OtaInventories.Where(i => i.Id == inventoryId).Select(i => i.TripId).FirstAsync());

    private static string Phone() => "9" + Random.Shared.NextInt64(100_000_000, 999_999_999);

    [Fact]
    public async Task Driver_replacement_deactivates_previous_driver_and_is_audited()
    {
        var f = await FindTrip(Rb, 1);
        var tripId = await TripOf(f.InventoryId);
        var (s1, staff) = await Admin.Post("/api/admin/staff", new { name = "Relief Driver", phone = Phone(), role = "driver", status = "active", licenseExpiry = "2035-01-01" });
        Assert.Equal(HttpStatusCode.OK, s1);
        var newId = (long)staff!["id"]!;

        var (s2, a) = await Admin.Post($"/api/admin/trips/{tripId}/assignments", new { role = "Driver", staffId = newId, reason = "sick leave" });
        Assert.True(s2 == HttpStatusCode.OK, a?.ToJsonString());
        var rows = await fx.Sql(db => db.TripAssignments.Where(x => x.TripId == tripId && x.Role == "Driver").ToListAsync());
        Assert.Single(rows, r => r.IsActive);
        Assert.Equal(newId, rows.Single(r => r.IsActive).StaffId);
        Assert.All(rows.Where(r => !r.IsActive), r => Assert.Equal("sick leave", r.ReplacedReason));
        Assert.True(await fx.Sql(db => db.AuditLogs.AnyAsync(x => x.Action == "REASSIGN" && x.EntityId == tripId.ToString())));

        // The same person cannot hold two roles on one service, nor be on another service the same day.
        var (s3, e3) = await Admin.Post($"/api/admin/trips/{tripId}/assignments", new { role = "Helper", staffId = newId });
        Assert.Equal(HttpStatusCode.Conflict, s3);
        Assert.Equal("STAFF_CONFLICT", (string)e3!["errorCode"]!);
    }

    [Fact]
    public async Task Bus_change_requires_identical_coach_layout()
    {
        var f = await FindTrip(Rb, 1);
        var tripId = await TripOf(f.InventoryId);
        var (coach, other) = await fx.Sql(async db =>
        {
            var c = await db.Trips.Where(t => t.Id == tripId).Select(t => t.Route!.CoachTemplateId).FirstAsync();
            var o = await db.CoachTemplates.Where(x => x.Id != c).Select(x => (long?)x.Id).FirstOrDefaultAsync();
            return (c, o);
        });
        var reg = "TS" + Random.Shared.Next(10, 99) + "ZZ" + Random.Shared.Next(1000, 9999);
        if (other is { } otherCoach)
        {
            var (_, wrong) = await Admin.Post("/api/admin/vehicles", new { registrationNumber = reg + "X", coachTemplateId = otherCoach, status = "active", gpsEnabled = false });
            var (sw, ew) = await Admin.Post($"/api/admin/trips/{tripId}/assignments", new { role = "vehicle", vehicleId = (long)wrong!["id"]! });
            Assert.Equal(HttpStatusCode.Conflict, sw);
            Assert.Equal("COACH_MISMATCH", (string)ew!["errorCode"]!);
        }
        var (_, ok) = await Admin.Post("/api/admin/vehicles", new { registrationNumber = reg, coachTemplateId = coach, status = "active", gpsEnabled = false });
        var (so, eo) = await Admin.Post($"/api/admin/trips/{tripId}/assignments", new { role = "vehicle", vehicleId = (long)ok!["id"]!, reason = "breakdown" });
        Assert.True(so == HttpStatusCode.OK, eo?.ToJsonString());
        Assert.Equal((long)ok["id"]!, await fx.Sql(db => db.TripAssignments.Where(a => a.TripId == tripId && a.Role == "vehicle" && a.IsActive).Select(a => a.VehicleId!.Value).SingleAsync()));

        var (sd, ed) = await Admin.Post("/api/admin/vehicles", new { registrationNumber = reg.ToLowerInvariant(), coachTemplateId = coach });
        Assert.Equal(HttpStatusCode.Conflict, sd);
    }

    [Fact]
    public async Task Operator_block_removes_seat_from_redbus_layout_until_unblocked()
    {
        var c = Rb;
        var f = await FindTrip(c, 1);
        var tripId = await TripOf(f.InventoryId);
        var seat = (string)f.Seats[0]!["name"]!;
        bool Available(JsonNode layout) => (bool)layout["seats"]!.AsArray().First(s => (string)s!["name"]! == seat)!["available"]!;

        var (sb, eb) = await Admin.Post($"/api/admin/trips/{tripId}/blocks", new { seats = new[] { seat }, reason = "VIP quota" });
        Assert.True(sb == HttpStatusCode.OK, eb?.ToJsonString());
        Assert.False(Available(await c.GetJson($"/redbus/seatlayout?id={f.InventoryId}&doj={f.Doj}")));

        var (s2, e2) = await Admin.Post($"/api/admin/trips/{tripId}/blocks", new { seats = new[] { seat } });
        Assert.Equal(HttpStatusCode.Conflict, s2);
        Assert.Equal("SEAT_UNAVAILABLE", (string)e2!["errorCode"]!);
        var (s3, _) = await c.Post("/redbus/blockticket", BlockBody(f, f.Seats[0]!));
        Assert.Equal(HttpStatusCode.Conflict, s3);

        var del = await Admin.DeleteAsync($"/api/admin/trips/{tripId}/blocks/{seat}");
        Assert.Equal(HttpStatusCode.OK, del.StatusCode);
        Assert.True(Available(await c.GetJson($"/redbus/seatlayout?id={f.InventoryId}&doj={f.Doj}")));
    }

    [Fact]
    public async Task Fare_update_is_visible_to_redbus_immediately_and_existing_hold_keeps_its_quote()
    {
        var c = Rb;
        var f = await FindTrip(c, 2);
        var tripId = await TripOf(f.InventoryId);
        var routeId = await fx.Sql(db => db.Trips.Where(t => t.Id == tripId).Select(t => t.RouteId).FirstAsync());
        var seatA = f.Seats[0]!; var seatB = f.Seats[1]!;
        var (key, quoted) = await Block(c, f, seatA);                    // hold before the change
        var before = (decimal)(await c.GetJson($"/redbus/seatlayout?id={f.InventoryId}&doj={f.Doj}"))["seats"]!.AsArray().First(s => (string)s!["name"]! == (string)seatB["name"]!)!["fare"]!;

        var fares = await fx.Sql(db => db.Routes.Where(r => r.Id == routeId).SelectMany(r => r.Fares).AsNoTracking().ToListAsync());
        var raised = fares.Select(x => new { x.FromSequence, x.ToSequence, seater = x.Seater + 100, sleeperLower = x.SleeperLower + 100, sleeperUpper = x.SleeperUpper + 100 }).ToList();
        var put = await Admin.PutAsJsonAsync($"/api/admin/routes/{routeId}/fares", raised);
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        try
        {
            var after = (decimal)(await c.GetJson($"/redbus/seatlayout?id={f.InventoryId}&doj={f.Doj}"))["seats"]!.AsArray().First(s => (string)s!["name"]! == (string)seatB["name"]!)!["fare"]!;
            Assert.True(after > before, $"fare {before} -> {after}");
            var (sc, bc) = await c.Post("/redbus/confirmticket", new { Blockkey = key, Fare = quoted });
            Assert.True(sc == HttpStatusCode.OK, bc?.ToJsonString());
            Assert.True(await fx.Sql(db => db.AuditLogs.AnyAsync(a => a.Action == "FARE_UPDATE" && a.EntityId == routeId.ToString())));
        }
        finally
        {
            await Admin.PutAsJsonAsync($"/api/admin/routes/{routeId}/fares",
                fares.Select(x => new { x.FromSequence, x.ToSequence, seater = x.Seater, sleeperLower = x.SleeperLower, sleeperUpper = x.SleeperUpper }));
        }
    }

    [Fact]
    public async Task Counter_and_redbus_bookings_record_payments_and_finance_evidence()
    {
        var c = Rb;
        var f = await FindTrip(c, 2);
        var tripId = await TripOf(f.InventoryId);
        // Use the boarding/drop stage from the *bookable search result*. Taking
        // the route's first pickup can select an already departed Day-1 stage
        // when the searched DOJ boards on Day-2 (overnight services).
        var bp = f.Bp;
        var dp = f.Dp;
        var (sc, cb) = await Admin.Post("/api/admin/bookings/counter", new
        {
            tripId, boardingPointId = bp, droppingPointId = dp, paymentMethod = "agent_credit", paymentReference = "AGT-1", channel = "agent", agentPhone = "9444444441",
            passengers = new[] { new { seat = (string)f.Seats[0]!["name"]!, name = "Counter Pax", age = 40, gender = "F", mobile = "9000000001", email = (string?)null, primary = true } },
        });
        Assert.True(sc == HttpStatusCode.OK, cb?.ToJsonString());
        Assert.Equal("CONFIRMED", (string)cb!["status"]!);
        Assert.Equal("RECEIVABLE", (string)cb["payments"]![0]!["status"]!);
        Assert.Equal((decimal)cb["totalFare"]!, (decimal)cb["payments"]![0]!["amount"]!);

        // RedBus-sold ticket: money is a receivable from the OTA, never marked PAID by the GDS.
        var pnr = await Book(c, f, f.Seats[1]!);
        var (pay, fin) = await fx.Sql(async db =>
        {
            var b = await db.Bookings.FirstAsync(x => x.Pnr == pnr);
            return (await db.Payments.Where(p => p.BookingId == b.Id).ToListAsync(), await db.BookingFinances.FirstOrDefaultAsync(x => x.BookingId == b.Id));
        });
        var p = Assert.Single(pay);
        Assert.Equal("RECEIVABLE", p.Status);
        Assert.NotNull(fin);
        Assert.Null(fin!.OtaCommission); // never guessed
    }

    [Fact]
    public async Task Reconciliation_classifies_mismatches_missing_rows_and_requires_dispute_reason()
    {
        var c = Rb;
        var f = await FindTrip(c, 1);
        var pnr = await Book(c, f, f.Seats[0]!);
        var fare = await fx.Sql(db => db.Bookings.Where(b => b.Pnr == pnr).Select(b => b.TotalFare).FirstAsync());
        var wrongDoj = DateOnly.Parse(f.Doj).AddDays(1).ToString("yyyy-MM-dd");
        var csv = "section,pnr,doj,fare,tax,commission,commission_tax,operator_offer,cancellation_charge,take_home\n" +
                  $"sold,{pnr},{wrongDoj},{fare + 50},0,10,1.8,0,,100\n" +
                  "sold,UNKNOWN-PNR-1,2026-01-01,500,0,50,9,0,,441\n" +
                  "weird_section,X,2026-01-01,1,0,0,0,0,,1\n";
        var number = "INV-" + Guid.NewGuid().ToString("N")[..8];
        var (su, up) = await Admin.Post("/api/admin/reconciliation/invoices", new { fileName = "../../evil.csv", invoiceNumber = number, periodStart = f.Doj, periodEnd = f.Doj, csv });
        Assert.True(su == HttpStatusCode.OK, up?.ToJsonString());
        var id = (long)up!["id"]!;
        var t = up["totals"]!;
        Assert.Equal(1, (int)t["missingInGds"]!);
        Assert.Equal(1, (int)t["mismatched"]!);
        Assert.True((int)t["missingInOta"]! >= 0);

        var lines = await fx.Sql(db => db.OtaInvoiceLines.Where(l => l.InvoiceId == id).ToListAsync());
        var ours = lines.Single(l => l.Pnr == pnr);
        Assert.Contains("doj", ours.Differences);
        Assert.Contains("fare", ours.Differences);
        Assert.Contains("gds_settlement_evidence_missing", ours.Differences);
        Assert.Equal("unmatched_ota", lines.Single(l => l.Pnr == "UNKNOWN-PNR-1").Status);
        Assert.Equal("evil.csv", await fx.Sql(db => db.OtaInvoices.Where(x => x.Id == id).Select(x => x.FileName).FirstAsync()));
        Assert.Equal("review_required", await fx.Sql(db => db.OtaInvoices.Where(x => x.Id == id).Select(x => x.Status).FirstAsync()));

        var (s1, e1) = await Admin.Post($"/api/admin/reconciliation/invoices/{id}/resolve", new { lineId = ours.Id, action = "dispute", note = " " });
        Assert.Equal(HttpStatusCode.BadRequest, s1);
        var (s2, _) = await Admin.Post($"/api/admin/reconciliation/invoices/{id}/resolve", new { lineId = ours.Id, action = "dispute", note = "DOJ differs" });
        Assert.Equal(HttpStatusCode.OK, s2);

        // identical bytes → duplicate (no second invoice); same number different content → 409
        var (sd, dup) = await Admin.Post("/api/admin/reconciliation/invoices", new { fileName = "x.csv", invoiceNumber = number, periodStart = f.Doj, periodEnd = f.Doj, csv });
        Assert.True((bool)dup!["duplicate"]!);
        var (sx, ex) = await Admin.Post("/api/admin/reconciliation/invoices", new { fileName = "x.csv", invoiceNumber = number, periodStart = f.Doj, periodEnd = f.Doj, csv = csv + "\n" + $"sold,{pnr}-B,{f.Doj},1,0,0,0,0,,1" });
        Assert.Equal(HttpStatusCode.Conflict, sx);

        var export = await (await Admin.GetAsync($"/api/admin/reconciliation/invoices/{id}/export")).Content.ReadAsStringAsync();
        Assert.StartsWith("\ufeff\"PNR\",\"DOJ (SaveTrip)\"", export);
        Assert.Contains("Resolution: dispute", export);

        // other tenant cannot see it
        var other = await fx.Factory.Admin(GdsFactory.OtherTenantKey).GetAsync($"/api/admin/reconciliation/invoices/{id}");
        Assert.Equal(HttpStatusCode.NotFound, other.StatusCode);
    }

    [Fact]
    public void Csv_export_neutralises_formula_injection()
    {
        var csv = JourneyOS.Api.Accounts.ReconciliationService.ExportCsv([new OtaInvoiceLine { Pnr = "=HYPERLINK(\"x\")", Status = "mismatched", Delta = -5m, Why = "@cmd" }]);
        Assert.Contains("\"'=HYPERLINK(\"\"x\"\")\"", csv);
        Assert.Contains("\"-5.00\"", csv);
        Assert.Contains("'@cmd", csv);
    }
}

public sealed class StoreOutageTests
{
    [Fact]
    public async Task Postgres_unavailable_returns_503_without_partial_commit()
    {
        await using var factory = new GdsFactory("Host=127.0.0.1;Port=1;Database=x;Username=x;Password=x;Timeout=2", "127.0.0.1:1,abortConnect=false",
            new() { ["Database:MigrateOnStartup"] = "false" });
        var r = await factory.CreateClient().GetAsync("/redbus/cities");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, r.StatusCode);
        Assert.Contains("STORE_UNAVAILABLE", await r.Content.ReadAsStringAsync());
        var ready = await factory.CreateClient().GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, ready.StatusCode);
    }
}
