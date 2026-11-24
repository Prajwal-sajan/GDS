using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using UglyToad.PdfPig;

namespace JourneyOS.Api.Accounts;

public sealed record PaymentAdvice(string InvoiceNumber, string OperatorCode, string? OperatorGstin, DateOnly? PeriodStart, DateOnly? PeriodEnd,
    decimal? StatedAmount, decimal ComputedAmount, Dictionary<string, decimal?> Summary, List<OtaInvoiceLine> Lines, List<string> Warnings);

/// <summary>
/// Port of the legacy redBus Payment Advice PDF parser (server/ota-reconciliation-v43.js: positionedLines,
/// parseSummary, parseLineItems, invoiceFormula). Text is extracted with PdfPig and rebuilt into visual lines
/// using glyph positions, mirroring the pdfjs-based legacy implementation.
/// Verified only against synthetic documents shaped like the legacy fixtures — not yet against a real
/// redBus statement in this stack.
/// </summary>
public static partial class PaymentAdviceParser
{
    public const int MaxPages = 200;
    private static readonly Regex Money = MoneyRx();
    private static readonly (string Key, string Label)[] SummaryRows =
    [
        ("bookings", "Booking (a)"), ("pax_cancel", "Cancellation (b)"), ("cancellation_credit", "Cancellation Charges (c)"),
        ("operator_cancel", "Bus Cancellation (d)"), ("exception_refund", "Exceptional Refund (e)"), ("dynamic_pricing", "Dynamic Pricing (f)"),
        ("ads", "Ad.s Deduction (g)"), ("operator_offers", "Operator Offers (h)"), ("partner_commission", "SS partner commission"),
        ("yourbus", "YourBus Charge"), ("gds_commission", "Gds Commission"), ("tcs", "TCS Deductions (l)"), ("tds", "TDS 194-O (m)"),
        ("reschedule", "Reschedule Charges (n)"), ("reschedule_excess", "Reschedule Excess Fare"), ("differential_gst", "DifferentialGST (p)"),
        ("open_ticket_offers", "Offers-Open Ticket (q)"), ("generic_addon", "Generic Add On(r)"), ("rise", "Rise Program (s)"), ("srp", "SRP (t)"),
        ("sponsored", "Sponsored Listing (u)"), ("nova", "Nova (v)"), ("bo_rewards", "BO Offer Rewards (w)"), ("invoice_amount", "Invoice Amount(Z)"),
    ];

    // ---------------- PDF → page text ----------------
    public static List<string> ExtractPages(byte[] pdf)
    {
        if (pdf.Length < 5 || Encoding.ASCII.GetString(pdf, 0, 5) != "%PDF-") throw new GdsException("NOT_PDF", "File is not a PDF");
        using var doc = PdfDocument.Open(pdf);
        if (doc.NumberOfPages > MaxPages) throw new GdsException("PDF_TOO_LARGE", $"PDF exceeds the {MaxPages}-page safety limit", 413);
        var pages = new List<string>();
        foreach (var page in doc.GetPages())
        {
            var cells = page.GetWords()
                .Where(w => !string.IsNullOrWhiteSpace(w.Text))
                // PDF y grows upwards; flip so lines sort top → bottom like the pdfjs viewport.
                .Select(w => (X: w.BoundingBox.Left, Y: page.Height - w.BoundingBox.Bottom, S: w.Text.Trim(), W: w.BoundingBox.Width))
                .OrderBy(c => c.Y).ThenBy(c => c.X).ToList();
            var lines = new List<(double Y, List<(double X, double Y, string S, double W)> Cells)>();
            foreach (var c in cells)
            {
                if (lines.Count > 0 && Math.Abs(c.Y - lines[^1].Y) <= 3.5) lines[^1].Cells.Add(c);
                else lines.Add((c.Y, [c]));
            }
            var sb = new StringBuilder();
            foreach (var l in lines)
            {
                var line = new StringBuilder(); var right = double.NegativeInfinity;
                foreach (var c in l.Cells.OrderBy(c => c.X))
                {
                    if (line.Length > 0) { var gap = c.X - right; if (gap > 1.5) line.Append(' ', gap > 26 ? 3 : 1); }
                    line.Append(c.S); right = Math.Max(right, c.X + c.W);
                }
                var t = line.ToString().Trim();
                if (t.Length > 0) sb.Append(t).Append('\n');
            }
            pages.Add(sb.ToString());
        }
        return pages;
    }

    // ---------------- text → advice ----------------
    public static PaymentAdvice Parse(IReadOnlyList<string> pages)
    {
        if (pages.Count == 0 || pages.All(string.IsNullOrWhiteSpace)) throw new GdsException("PDF_NO_TEXT", "PDF has no selectable text (scanned image PDFs are not supported)");
        var first = pages[0];
        var flat = Regex.Replace(first, @"\r?\n", " ");
        string? M(string rx) { var m = Regex.Match(flat, rx, RegexOptions.IgnoreCase); return m.Success ? m.Groups[1].Value : null; }
        var invoice = M(@"Invoice\s*No\s*:\s*([0-9-]{8,})");
        var op = M(@"Operator\s*Code\s*:\s*(\d+)");
        if (invoice is null || op is null) throw new GdsException("NOT_PAYMENT_ADVICE", "Not a recognised redBus Payment Advice PDF: invoice number/operator code missing");
        var period = Regex.Match(flat, @"Billing\s*Period\s*:\s*From\s*:\s*(\d{2}[-/]\d{2}[-/]\d{2,4})\s*To\s*:\s*(\d{2}[-/]\d{2}[-/]\d{2,4})", RegexOptions.IgnoreCase);
        DateOnly? ps = period.Success ? ParseDate(period.Groups[1].Value, null) : null, pe = period.Success ? ParseDate(period.Groups[2].Value, null) : null;
        var issue = M(@"Date\s*:\s*(\d{2}[-/]\d{2}[-/]\d{2,4})");
        var year = ps?.Year ?? (issue is null ? null : ParseDate(issue, null)?.Year) ?? DateTime.UtcNow.Year;

        var lines = first.Split('\n');
        var summary = new Dictionary<string, decimal?>();
        foreach (var (k, label) in SummaryRows)
        {
            var at = Array.FindIndex(lines, x => x.Contains(label, StringComparison.OrdinalIgnoreCase));
            if (at >= 0) summary[k] = SummaryValue(lines, at);
        }
        var zAt = Array.FindIndex(lines, x => x.Contains("Invoice Amount(Z)", StringComparison.OrdinalIgnoreCase));
        if (zAt >= 0) { var z = Values(string.Join(' ', lines.Skip(zAt).Take(5))); if (z.Count > 0) summary["invoice_amount"] = z[^1]; }

        var rows = ParseLineItems(pages, year);
        if (rows.Count == 0) throw new GdsException("NO_ROWS", "No PNR payment/cancellation rows found in the document");
        var occurrence = new Dictionary<string, int>();
        foreach (var r in rows) { var k = $"{r.Section}:{r.Pnr}"; occurrence[k] = occurrence.GetValueOrDefault(k) + 1; r.LineKey = $"{k}:{occurrence[k]}"; }

        var warnings = new List<string>();
        if (!rows.All(r => PnrRx().IsMatch(r.Pnr))) warnings.Add("Some invoice PNRs are split or malformed; review source rows");
        var stated = summary.GetValueOrDefault("invoice_amount");
        if (stated is null) warnings.Add("Invoice payout total could not be parsed");
        var calc = Formula(summary);
        if (stated is { } s && Math.Abs(calc - s) > 0.05m) warnings.Add("Invoice summary formula does not equal stated net payout: check document parse");
        if (rows.Any(r => r.Doj is null || r.Fare is null)) warnings.Add("Some rows have incomplete date or amount fields");
        return new PaymentAdvice(invoice, op, M(@"GSTIN\s*:\s*([0-9A-Z]{15})"), ps, pe, stated, calc, summary, rows, warnings);
    }

    public static decimal Formula(IReadOnlyDictionary<string, decimal?> s)
    {
        decimal V(string k) => s.GetValueOrDefault(k) ?? 0;
        return Math.Round(V("bookings") - V("pax_cancel") + V("cancellation_credit") - V("operator_cancel") - V("exception_refund") - V("dynamic_pricing") - V("ads")
            - V("operator_offers") - V("partner_commission") - V("yourbus") - V("gds_commission") - V("tcs") - V("tds") + V("reschedule") + V("reschedule_excess")
            + V("differential_gst") - V("open_ticket_offers") + V("generic_addon") - V("rise") - V("srp") - V("sponsored") - V("nova") - V("bo_rewards"), 2);
    }

    private static List<OtaInvoiceLine> ParseLineItems(IReadOnlyList<string> pages, int year)
    {
        string? section = null;
        var rows = new List<OtaInvoiceLine>();
        foreach (var page in pages)
        {
            var lines = page.Split('\n');
            for (var i = 0; i < lines.Length; i++)
            {
                var h = SectionRx().Match(lines[i]);
                if (h.Success) { section = h.Groups[1].Value.ToLowerInvariant() switch { "payment" => "sold", "cancellation" => "pax_cancelled", "bus cancelled" => "bus_cancelled", "exceptional refund" => "exceptional_refund", _ => null }; continue; }
                if (section is null) continue;
                foreach (Match cand in PnrStartRx().Matches(lines[i]))
                {
                    var pnr = Regex.Replace(cand.Value.ToUpperInvariant(), @"\s+", "");
                    var nearby = lines.Skip(i + 1).Take(3).ToArray();
                    if (pnr.Length < 20)
                        foreach (var cont in nearby)
                        {
                            var f = Regex.Match(cont, @"^\s*(\d{4,6})(?:\s+.*)?$");
                            if (f.Success && f.Groups[1].Value.Length + pnr.Length == 20) { pnr += f.Groups[1].Value; break; }
                        }
                    var nearbyText = string.Join(' ', new[] { lines[i] }.Concat(nearby));
                    string? doe = null, doj = null, route = null; List<decimal> prices = [];
                    var row = Regex.Match(nearbyText, @"(\d{2}/\d{2})\s+(\d{2}/\d{2})\s+(\d{7,10})\s+([\s\S]*?)(?=ST\d{12,18}|$)", RegexOptions.IgnoreCase);
                    if (row.Success)
                    {
                        doe = row.Groups[1].Value; doj = row.Groups[2].Value; route = row.Groups[3].Value;
                        var rest = row.Groups[4].Value; var ms = Money.Match(rest);
                        if (ms.Success) prices = Values(rest[ms.Index..]);
                    }
                    if (prices.Count == 0)
                    {
                        // Large multi-seat PNRs wrap the route/seat column ABOVE their dates.
                        var dates = Regex.Match(nearbyText, @"(\d{2}/\d{2})\s+(\d{2}/\d{2})");
                        var firstLine = lines[i][(cand.Index + cand.Length)..];
                        var code = Regex.Match(firstLine, @"\b(\d{7,10})\b");
                        if (!dates.Success || !code.Success) continue;
                        doe = dates.Groups[1].Value; doj = dates.Groups[2].Value; route = code.Groups[1].Value;
                        var after = nearbyText[(nearbyText.IndexOf(dates.Value, StringComparison.Ordinal) + dates.Value.Length)..];
                        var st = Money.Match(after);
                        if (!st.Success) continue;
                        prices = Values(PnrStartRx().Split(after[st.Index..])[0]);
                    }
                    if (prices.Count == 0 || route is null) continue;
                    decimal? P(int k) => k < prices.Count ? prices[k] : null;
                    var l = new OtaInvoiceLine { Pnr = pnr, Section = section, Doj = ParseDate(doj!, year), Fare = P(0) };
                    switch (section)
                    {
                        case "sold":
                            l.Commission = P(1); l.Tax = P(2);
                            var net = P(3) ?? 0; var gds = P(4) ?? 0; l.OperatorOffer = P(5);
                            l.TakeHome = Math.Round(net - (l.OperatorOffer ?? 0) - gds, 2);
                            l.CommissionTax = l.Commission is { } c ? Math.Round(c * 0.18m, 2) : null;
                            break;
                        case "pax_cancelled":
                            l.CancellationCharge = P(2); l.Tax = P(3); l.TakeHome = Math.Round(l.CancellationCharge ?? 0, 2);
                            break;
                        case "bus_cancelled":
                            l.Commission = P(1); l.Tax = P(2); l.TakeHome = -Math.Round(P(3) ?? 0, 2);
                            break;
                        case "exceptional_refund":
                            l.TakeHome = -Math.Round(P(1) ?? 0, 2);
                            break;
                    }
                    rows.Add(l);
                }
            }
        }
        return rows;
    }

    private static decimal? SummaryValue(string[] lines, int at)
    {
        var direct = Values(lines[at]);
        if (direct.Count > 0) return direct[^1];
        for (var i = at + 1; i <= at + 3 && i < lines.Length; i++)
        {
            if (Regex.IsMatch(lines[i].Trim(), @"^(?:Booking|Cancellation \(|Bus Cancellation|Operator Offers|TDS|TCS|Dynamic Pricing|Invoice Amount|PaymentMode|Ad.s Deduction|SS partner)", RegexOptions.IgnoreCase)) break;
            var f = Values(lines[i]);
            if (f.Count > 0) return f[^1];
        }
        return null;
    }

    public static List<decimal> Values(string s) =>
        Money.Matches(s ?? "").Select(m => decimal.Parse(m.Value.Replace(",", ""), NumberStyles.Number | NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture)).ToList();

    public static DateOnly? ParseDate(string s, int? year)
    {
        var m = Regex.Match(s ?? "", @"^(\d{2})[-/](\d{2})(?:[-/](\d{2,4}))?$");
        if (!m.Success) return null;
        var y = m.Groups[3].Success ? int.Parse(m.Groups[3].Value.Length == 2 ? "20" + m.Groups[3].Value : m.Groups[3].Value) : year;
        if (y is null) return null;
        try { return new DateOnly(y.Value, int.Parse(m.Groups[2].Value), int.Parse(m.Groups[1].Value)); } catch (ArgumentOutOfRangeException) { return null; }
    }

    [GeneratedRegex(@"-?\d[\d,]*\.\d{2}")] private static partial Regex MoneyRx();
    [GeneratedRegex(@"[0-9A-Z]{8,20}\s*-\s*(Payment|Cancellation|Bus Cancelled|Exceptional Refund)", RegexOptions.IgnoreCase)] private static partial Regex SectionRx();
    [GeneratedRegex(@"ST\d{12,18}", RegexOptions.IgnoreCase)] private static partial Regex PnrStartRx();
    [GeneratedRegex(@"^ST\d{18}$", RegexOptions.IgnoreCase)] private static partial Regex PnrRx();
}
