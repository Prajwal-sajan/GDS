using System.Text.Json;
using JourneyOS.Api.Accounts;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

/// <summary>
/// Accounts → OTA Invoice Verifier (legacy server/api/ota-reconciliation-v43.js contract) over the ported
/// <see cref="ReconciliationService"/> / <see cref="PaymentAdviceParser"/>. Shapes the stored invoice + lines into the
/// legacy JSON (totals, section_stats, lines with expected{}) that public/js/ota-reconciliation-v43.js renders.
/// </summary>
public static class OtaVerifierEndpoints
{
    private static readonly string[] Sections = ["sold", "pax_cancelled", "bus_cancelled", "exceptional_refund"];
    private static decimal R2(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);
    private static IResult Fail(int status, string message) => Results.Json(new { success = false, message }, statusCode: status);

    private static Dictionary<string, object?> Line(OtaInvoiceLine l, BookingFinance? f)
    {
        var tax = l.ExpectedTax;
        return new()
        {
            ["id"] = l.Id.ToString(), ["pnr"] = l.Pnr, ["section"] = l.Section, ["doj"] = l.Doj?.ToString("yyyy-MM-dd") ?? (l.Section == "missing_in_ota" ? l.ExpectedDoj?.ToString("yyyy-MM-dd") : null),
            ["doj_gds"] = l.ExpectedDoj?.ToString("yyyy-MM-dd"), ["fare"] = l.Fare, ["tax"] = l.Tax, ["commission"] = l.Commission, ["commission_tax"] = l.CommissionTax,
            ["operator_offer"] = l.OperatorOffer, ["cancellation_charge"] = l.CancellationCharge, ["take_home"] = l.TakeHome, ["net_payable"] = l.TakeHome,
            ["booking_status"] = l.BookingStatus, ["status"] = l.Status, ["differences"] = l.Differences, ["why"] = l.Why, ["delta"] = l.Delta,
            ["verified"] = l.Status == "matched",
            ["expected"] = l.BookingId is null && l.Section != "missing_in_ota" ? null : new Dictionary<string, object?>
            {
                ["doj"] = l.ExpectedDoj?.ToString("yyyy-MM-dd") ?? "", ["fare"] = l.ExpectedFare, ["tax"] = tax,
                ["commission"] = f?.OtaCommission, ["commission_tax"] = f?.OtaCommissionGst, ["operator_offer"] = f?.OperatorOffer, ["take_home"] = l.ExpectedTakeHome,
            },
            ["resolution"] = l.ResolutionAction is null ? null : new { action = l.ResolutionAction, by = l.ResolvedBy, at = l.ResolvedAt, note = l.ResolutionNote },
        };
    }

    private static async Task<Dictionary<long, BookingFinance>> FinanceAsync(GdsDbContext db, IEnumerable<OtaInvoiceLine> lines)
    {
        var ids = lines.Where(l => l.BookingId != null).Select(l => l.BookingId!.Value).Distinct().ToList();
        return await db.BookingFinances.AsNoTracking().Where(f => ids.Contains(f.BookingId)).ToDictionaryAsync(f => f.BookingId);
    }

    /// <summary>Legacy pick(doc): invoice meta + totals + section_stats (no lines).</summary>
    private static Dictionary<string, object?> Doc(OtaInvoice inv)
    {
        var rows = inv.Lines;
        var invoiceLines = rows.Where(x => x.Section != "missing_in_ota").ToList();
        var summary = inv.SummaryJson is { } s ? JsonSerializer.Deserialize<Dictionary<string, decimal?>>(s)! : new Dictionary<string, decimal?>();
        if (!summary.ContainsKey("invoice_amount")) summary["invoice_amount"] = inv.StatedAmount;
        var statementLines = invoiceLines.Count(x => x.Section != "exceptional_refund");
        decimal Sum(IEnumerable<decimal?> v) => R2(v.Sum(x => x ?? 0));
        var stats = new Dictionary<string, object?>();
        foreach (var sec in Sections)
        {
            var set = rows.Where(x => x.Section == sec).ToList();
            var comp = set.Where(x => x.ExpectedFare != null && x.ExpectedTakeHome != null).ToList();
            stats[sec] = new Dictionary<string, object?>
            {
                ["count"] = set.Count, ["invoice_fare"] = Sum(set.Select(x => x.Fare)), ["invoice_tax"] = Sum(set.Select(x => x.Tax)),
                ["invoice_gross"] = R2(Sum(set.Select(x => x.Fare)) + Sum(set.Select(x => x.Tax))), ["take_home"] = Sum(set.Select(x => x.TakeHome)),
                ["gds_count"] = comp.Count,
                ["gds_expected_fare"] = comp.Count > 0 ? R2(comp.Sum(x => (x.ExpectedFare ?? 0) + (x.ExpectedTax ?? 0))) : null,
                ["gds_expected_payout"] = comp.Count > 0 ? R2(comp.Sum(x => x.ExpectedTakeHome ?? 0)) : null,
                ["fare_diff"] = comp.Count > 0 ? R2(comp.Sum(x => (x.Fare ?? 0) + (x.Tax ?? 0) - (x.ExpectedFare ?? 0) - (x.ExpectedTax ?? 0))) : null,
                ["payout_diff"] = comp.Count > 0 ? Sum(comp.Select(x => x.Delta)) : null,
            };
        }
        var totals = new Dictionary<string, object?>
        {
            ["invoice_amount"] = summary["invoice_amount"], ["invoice_lines"] = statementLines, ["parsed_events"] = invoiceLines.Count,
            ["invoice_adjustment_events"] = invoiceLines.Count(x => x.Section == "exceptional_refund"),
            ["ticket_rows"] = rows.Count(x => x.Section is not ("exceptional_refund" or "missing_in_ota")),
            ["gds_comparable"] = invoiceLines.Count(x => x.ExpectedFare != null && x.ExpectedTakeHome != null),
            ["verified"] = rows.Count(x => x.Status == "matched"), ["matched"] = rows.Count(x => x.Status == "matched"), ["mismatched"] = rows.Count(x => x.Status == "mismatched"),
            ["needs_review"] = rows.Count(x => x.Status == "needs_review"), ["missing_in_gds"] = rows.Count(x => x.Status == "unmatched_ota"), ["missing_in_ota"] = rows.Count(x => x.Status == "unmatched_gds"),
            ["resolved"] = rows.Count(x => x.ResolutionAction != null), ["disputed"] = rows.Count(x => x.ResolutionAction == "dispute"),
            ["gds_expected"] = Sum(invoiceLines.Where(x => x.Section == "sold" && x.ExpectedTakeHome != null).Select(x => x.ExpectedTakeHome)),
            ["ota_ticket_take_home"] = Sum(invoiceLines.Where(x => x.Section == "sold").Select(x => x.TakeHome)),
            ["discrepancy_total"] = Sum(rows.Where(x => x.Delta != null).Select(x => x.Delta)),
            ["outstanding_issue_count"] = rows.Count(x => x.Status != "matched" && x.ResolutionAction == null),
            ["at_risk_amount"] = R2(rows.Where(x => x.Status == "mismatched" && x.Delta != null).Sum(x => Math.Abs(x.Delta!.Value))),
        };
        var warnings = inv.WarningsJson is { } w ? JsonSerializer.Deserialize<List<string>>(w)! : [];
        return new()
        {
            ["id"] = inv.Id, ["ota_slug"] = "redbus", ["file_name"] = inv.FileName, ["sha256"] = inv.Sha256.ToLowerInvariant(),
            ["operator_code"] = inv.OperatorCode, ["operator_gstin"] = inv.OperatorGstin, ["invoice_number"] = inv.InvoiceNumber,
            ["billing_period_start"] = inv.PeriodStart.ToString("yyyy-MM-dd"), ["billing_period_end"] = inv.PeriodEnd.ToString("yyyy-MM-dd"),
            ["summary"] = summary, ["summary_details"] = new Dictionary<string, object?>(),
            ["summary_delta"] = summary["invoice_amount"] is { } amt && inv.ComputedAmount is { } calc ? R2(amt - calc) : null,
            ["computed_invoice_amount"] = inv.ComputedAmount,
            ["by_section"] = Sections.ToDictionary(x => x, x => invoiceLines.Count(l => l.Section == x)),
            ["statement_lines"] = statementLines, ["unique_pnrs"] = invoiceLines.Select(x => x.Pnr).Distinct().Count(),
            ["parse_warnings"] = warnings, ["totals"] = totals, ["section_stats"] = stats,
            ["status"] = inv.Status, ["uploaded_by"] = inv.UploadedBy, ["uploaded_at"] = inv.UploadedAt,
        };
    }

    public record UploadV43(string? OtaSlug, string? FileName, string? Base64);
    public record ResolveV43(string? LineId, string? Action, string? Note);
    public record DeleteV43(string? Confirm);

    public static void Map(RouteGroupBuilder g)
    {
        var r = g.MapGroup("/reconciliation/v43/invoices").RequireAuthorization(Policies.Accounts);
        r.MapGet("", async (GdsDbContext db) =>
        {
            var list = await db.OtaInvoices.AsNoTracking().Include(x => x.Lines).OrderByDescending(x => x.Id).ToListAsync();
            return Results.Ok(new { imports = list.Select(Doc) });
        });
        r.MapPost("", async (UploadV43 b, ReconciliationService s, GdsDbContext db, HttpContext h) =>
        {
            var name = System.Text.RegularExpressions.Regex.Replace(b.FileName ?? "", @"[^\w.()\s-]", "_");
            if (name.Length > 120) name = name[..120];
            if (!string.Equals(b.OtaSlug, "redbus", StringComparison.OrdinalIgnoreCase)) return Fail(400, "This PDF adapter supports redBus Payment Advice; choose redBus");
            if (!name.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)) return Fail(400, "Select a redBus Payment Advice PDF");
            if (b.Base64 is null || b.Base64.Length > 7 * 1024 * 1024 * 1.38) return Fail(413, "PDF upload exceeds 7 MB");
            try
            {
                var (inv, dup) = await s.UploadAsync(new InvoiceUpload(name, null, null, null, null, null, null, null, b.Base64), h.User.Identity?.Name ?? "operator");
                var full = await db.OtaInvoices.AsNoTracking().Include(x => x.Lines).FirstAsync(x => x.Id == inv.Id);
                var doc = Doc(full); doc["duplicate"] = dup;
                return dup ? Results.Ok(doc) : Results.Json(doc, statusCode: 201);
            }
            catch (GdsException e) when (e.HttpStatus < 500)
            {
                return Fail(e.HttpStatus == 400 ? 422 : e.HttpStatus, e.HttpStatus == 400 ? "Cannot read redBus payment advice: " + e.Message : e.Message);
            }
        });
        r.MapGet("/{id:long}", async (long id, GdsDbContext db) =>
            await db.OtaInvoices.AsNoTracking().Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id) is { } inv ? Results.Ok(Doc(inv)) : Fail(404, "Invoice not found"));
        r.MapGet("/{id:long}/lines", async (long id, string? filter, string? q, string? issue, int? offset, int? limit, GdsDbContext db) =>
        {
            if (!await db.OtaInvoices.AnyAsync(x => x.Id == id)) return Fail(404, "Invoice not found");
            var lines = await db.OtaInvoiceLines.AsNoTracking().Where(l => l.InvoiceId == id).OrderBy(l => l.Id).ToListAsync();
            var f = filter ?? "all";
            if (f != "all") lines = lines.Where(x => x.Status == f || (f == "unresolved" && x.Status != "matched" && x.ResolutionAction == null) || (f == "disputed" && x.ResolutionAction == "dispute")).ToList();
            var search = (q ?? "").Trim().ToLowerInvariant();
            if (search.Length > 120) search = search[..120];
            if (search.Length > 0) lines = lines.Where(x => x.Pnr.ToLowerInvariant().Contains(search) || x.Why.ToLowerInvariant().Contains(search)).ToList();
            if (!string.IsNullOrEmpty(issue) && issue != "all") lines = lines.Where(x => x.Differences.Contains(issue)).ToList();
            var count = lines.Count; var off = Math.Min(Math.Max(0, offset ?? 0), count); var lim = Math.Min(100, Math.Max(1, limit ?? 30));
            var page = lines.Skip(off).Take(lim).ToList();
            var fin = await FinanceAsync(db, page);
            return Results.Ok(new { rows = page.Select(l => Line(l, l.BookingId is { } bid ? fin.GetValueOrDefault(bid) : null)), count, offset = off, limit = lim, has_more = off + lim < count });
        });
        r.MapGet("/{id:long}/export.csv", async (long id, string? filter, GdsDbContext db) =>
        {
            var f = filter ?? "all";
            if (f is not ("all" or "matched" or "mismatched" or "needs_review" or "unmatched_ota" or "unmatched_gds")) return Fail(400, "Unknown export filter");
            var inv = await db.OtaInvoices.AsNoTracking().Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id);
            if (inv is null) return Fail(404, "Invoice not found");
            var csv = ReconciliationService.ExportCsv(inv.Lines.Where(l => f == "all" || l.Status == f).OrderBy(l => l.Id));
            var basename = System.Text.RegularExpressions.Regex.Replace(inv.InvoiceNumber, "[^A-Za-z0-9_-]", "_");
            return Results.File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv; charset=utf-8", $"reconciliation_redbus_{basename}.csv");
        });
        r.MapGet("/{id:long}/original.pdf", async (long id, GdsDbContext db) =>
            await db.OtaInvoices.AsNoTracking().Where(x => x.Id == id).Select(x => x.SourcePdf).FirstOrDefaultAsync() is { Length: > 0 } pdf
                ? Results.File(pdf, "application/pdf") : Fail(404, "Source PDF unavailable"));
        r.MapPost("/{id:long}/recheck", async (long id, GdsDbContext db, ReconciliationService s) =>
        {
            var inv = await db.OtaInvoices.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id);
            if (inv is null) return Fail(404, "Invoice not found");
            await s.CompareAsync(inv);
            await db.SaveChangesAsync();
            return Results.Ok(Doc(inv));
        });
        r.MapPost("/{id:long}/resolve", async (long id, ResolveV43 b, ReconciliationService s, GdsDbContext db, HttpContext h) =>
        {
            if (!long.TryParse(b.LineId, out var lineId)) return Fail(404, "PNR event row not found");
            try
            {
                var line = await s.ResolveAsync(id, new ResolveInput(lineId, b.Action ?? "", b.Note), h.User.Identity?.Name ?? "operator");
                var inv = await db.OtaInvoices.AsNoTracking().Include(x => x.Lines).FirstAsync(x => x.Id == id);
                return Results.Ok(new { row = Line(line, null), totals = Doc(inv)["totals"] });
            }
            catch (GdsException e) when (e.HttpStatus < 500) { return Fail(e.HttpStatus, e.Message); }
        });
        r.MapDelete("/{id:long}", async (long id, [Microsoft.AspNetCore.Mvc.FromBody] DeleteV43? b, GdsDbContext db) =>
        {
            var inv = await db.OtaInvoices.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id);
            if (inv is null) return Fail(404, "Invoice not found");
            if (b?.Confirm != inv.InvoiceNumber) return Fail(400, "Confirm the invoice number to delete");
            db.OtaInvoices.Remove(inv);
            await db.SaveChangesAsync();
            return Results.Ok(new { deleted = true });
        });
    }
}
