using System.Data.Common;
using System.Net;
using JourneyOS.Api.Accounts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using UglyToad.PdfPig.Writer;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using static JourneyOS.Tests.RedBusClient;

namespace JourneyOS.Tests;

/// <summary>Simulates the process dying after all booking rows are written but before COMMIT.</summary>
public sealed class CrashBeforeCommit : DbTransactionInterceptor
{
    public volatile bool Armed;
    public int Fired;
    public override ValueTask<InterceptionResult> TransactionCommittingAsync(DbTransaction t, TransactionEventData e, InterceptionResult r, CancellationToken ct = default)
    {
        if (Armed) { Armed = false; Interlocked.Increment(ref Fired); throw new InvalidOperationException("simulated crash before commit"); }
        return base.TransactionCommittingAsync(t, e, r, ct);
    }
}

[Collection("gds")]
public sealed class FailureRecoveryTests(GdsFixture fx)
{
    [Fact]
    public async Task Crash_during_confirm_commits_nothing_and_retry_books_exactly_once()
    {
        var crash = new CrashBeforeCommit();
        await using var node = new GdsFactory(fx.Pg.GetConnectionString(), fx.Redis.GetConnectionString(),
            services: s => s.AddSingleton<IInterceptor>(crash));
        var c = node.CreateClient();
        var f = await FindTrip(c, 1);
        var (key, total) = await Block(c, f, f.Seats[0]!);

        crash.Armed = true;
        var (s1, _) = await c.Post("/redbus/confirmticket", new { Blockkey = key, Fare = total });
        Assert.Equal(1, crash.Fired);
        Assert.False(s1 == HttpStatusCode.OK, "confirm must not report success when the commit did not happen");

        // What RedBus does next per contract: checkpnr. Nothing was committed, so NOT_BOOKED — and no booking, payment or callback leaked.
        var chk = await c.GetAsync($"/redbus/checkpnr?blockkey={key}");
        Assert.Equal(HttpStatusCode.NotFound, chk.StatusCode);
        Assert.Contains("NOT_BOOKED", await chk.Content.ReadAsStringAsync());
        Assert.Equal(0, await fx.Sql(db => db.Bookings.CountAsync(b => db.SeatHolds.Any(h => h.Id == b.HoldId && h.BlockKey == key))));
        Assert.Equal(0, await fx.Sql(db => db.Payments.CountAsync(p => db.Bookings.Any(b => b.Id == p.BookingId && db.SeatHolds.Any(h => h.Id == b.HoldId && h.BlockKey == key)))));

        // The hold survived (still within TTL), so a retry — on a *fresh* node, as after a restart — books exactly once.
        var restarted = fx.Factory.CreateClient();
        var (s2, b2) = await restarted.Post("/redbus/confirmticket", new { Blockkey = key, Fare = total });
        Assert.True(s2 == HttpStatusCode.OK, b2?.ToJsonString());
        var (s3, b3) = await restarted.Post("/redbus/confirmticket", new { Blockkey = key, Fare = total });
        Assert.Equal((string)b2!["pnr"]!, (string)b3!["pnr"]!);
        Assert.Equal(1, await fx.Sql(db => db.Bookings.CountAsync(b => db.SeatHolds.Any(h => h.Id == b.HoldId && h.BlockKey == key))));
        Assert.Equal(1, await fx.Sql(db => db.Payments.CountAsync(p => db.Bookings.Any(b => b.Id == p.BookingId && db.SeatHolds.Any(h => h.Id == b.HoldId && h.BlockKey == key)))));
    }

    [Fact]
    public async Task Client_timeout_during_confirm_is_resolved_by_checkpnr_without_double_booking()
    {
        var c = fx.Factory.CreateClient();
        var f = await FindTrip(c, 1);
        var (key, total) = await Block(c, f, f.Seats[0]!);

        // RedBus gives up almost immediately: the server may or may not finish the confirm.
        using (var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(1)))
        {
            try { await c.PostAsync("/redbus/confirmticket", System.Net.Http.Json.JsonContent.Create(new { Blockkey = key, Fare = total }), cts.Token); }
            catch (OperationCanceledException) { }
        }
        await Task.Delay(500);

        var chk = await c.GetAsync($"/redbus/checkpnr?blockkey={key}");
        string pnr;
        if (chk.StatusCode == HttpStatusCode.OK)
            pnr = (string)System.Text.Json.Nodes.JsonNode.Parse(await chk.Content.ReadAsStringAsync())!["pnr"]!;
        else
        {
            Assert.Contains("NOT_BOOKED", await chk.Content.ReadAsStringAsync());
            var (s, b) = await c.Post("/redbus/confirmticket", new { Blockkey = key, Fare = total });
            Assert.True(s == HttpStatusCode.OK, b?.ToJsonString());
            pnr = (string)b!["pnr"]!;
        }
        // A confirm retry after the timeout always returns the same PNR.
        var (_, again) = await c.Post("/redbus/confirmticket", new { Blockkey = key, Fare = total });
        Assert.Equal(pnr, (string)again!["pnr"]!);
        Assert.Equal(1, await fx.Sql(db => db.Bookings.CountAsync(b => db.SeatHolds.Any(h => h.Id == b.HoldId && h.BlockKey == key))));
    }
}

public sealed class PaymentAdviceParserTests
{
    private static readonly string[] Page1 =
    [
        "DEMO TRAVELS",
        "Operator Code : 12345   GSTIN : 29ABCDE1234F1Z5",
        "Invoice No : 2026-11-000123   Date : 05/11/2026",
        "Billing Period : From : 01/11/2026 To : 03/11/2026",
        "Invoice Summary",
        "Booking (a)   1,000.00   100.00   9.00   9.00   0.00   50.00   940.00",
        "Cancellation (b)   200.00",
        "Cancellation Charges (c)   50.00",
        "Operator Offers (h)   20.00",
        "TDS 194-O (m)   10.00",
        "Invoice Amount(Z)   760.00",
    ];
    private static readonly string[] Page2 =
    [
        "SEC12345678 - Payment",
        "ST123456789012345678   01/11   02/11   12345678   L1   1,000.00   100.00   50.00   940.00   10.00   20.00",
        "SEC12345678 - Cancellation",
        "ST9876543210987",
        "65432   01/11   03/11   12345678   U2   500.00   450.00   50.00   2.50   447.50",
    ];

    [Fact]
    public void Parses_header_summary_sections_and_wrapped_pnrs()
    {
        var a = PaymentAdviceParser.Parse([string.Join('\n', Page1), string.Join('\n', Page2)]);
        Assert.Equal("2026-11-000123", a.InvoiceNumber);
        Assert.Equal("12345", a.OperatorCode);
        Assert.Equal(new DateOnly(2026, 11, 1), a.PeriodStart);
        Assert.Equal(760.00m, a.StatedAmount);
        // legacy formula uses the net-settlement column (last value) of the Booking (a) row
        Assert.Equal(940m - 200m + 50m - 20m - 10m, a.ComputedAmount);
        Assert.DoesNotContain(a.Warnings, w => w.Contains("formula"));

        var sold = Assert.Single(a.Lines, l => l.Section == "sold");
        Assert.Equal("ST123456789012345678", sold.Pnr);
        Assert.Equal(new DateOnly(2026, 11, 2), sold.Doj);
        Assert.Equal(1000m, sold.Fare);
        Assert.Equal(940m - 20m - 10m, sold.TakeHome);
        Assert.Equal(18m, sold.CommissionTax);

        var canc = Assert.Single(a.Lines, l => l.Section == "pax_cancelled");
        Assert.Equal("ST987654321098765432", canc.Pnr); // 15-char fragment + 5-digit continuation on the next line
        Assert.Equal(50m, canc.CancellationCharge);
    }

    [Fact]
    public void Rejects_documents_that_are_not_payment_advice()
    {
        var ex = Assert.Throws<JourneyOS.Api.Inventory.GdsException>(() => PaymentAdviceParser.Parse(["Hello world"]));
        Assert.Equal("NOT_PAYMENT_ADVICE", ex.Code);
        Assert.Equal("NOT_PDF", Assert.Throws<JourneyOS.Api.Inventory.GdsException>(() => PaymentAdviceParser.ExtractPages("not a pdf"u8.ToArray())).Code);
    }

    [Fact]
    public void Extracts_positioned_lines_from_a_real_pdf()
    {
        var b = new PdfDocumentBuilder();
        var font = b.AddStandard14Font(Standard14Font.Helvetica);
        foreach (var lines in new[] { Page1, Page2 })
        {
            var page = b.AddPage(UglyToad.PdfPig.Content.PageSize.A4, isPortrait: false);
            var y = 560.0;
            foreach (var line in lines) { page.AddText(line, 8, new UglyToad.PdfPig.Core.PdfPoint(20, y), font); y -= 14; }
        }
        var pages = PaymentAdviceParser.ExtractPages(b.Build());
        Assert.True(pages.Count == 2 && pages[1].Contains("ST123456789012345678"), string.Join("\n----\n", pages));
        var a = PaymentAdviceParser.Parse(pages);
        Assert.Equal("2026-11-000123", a.InvoiceNumber);
        Assert.Equal(2, a.Lines.Count);
        Assert.Equal(760.00m, a.StatedAmount);
    }
}
