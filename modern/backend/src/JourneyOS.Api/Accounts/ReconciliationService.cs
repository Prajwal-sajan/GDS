using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Accounts;

public sealed record InvoiceUpload(string FileName, string? InvoiceNumber, string? OperatorCode, DateOnly? PeriodStart, DateOnly? PeriodEnd,
    decimal? StatedAmount, string? Csv, decimal? Tolerance, string? PdfBase64 = null);
public sealed record ResolveInput(long LineId, string Action, string? Note);

/// <summary>
/// RedBus OTA invoice verifier (port of legacy server/ota-reconciliation-v43.js compareInvoice/exportCsv).
/// Ingestion: normalised CSV rows (section,pnr,doj,fare,tax,commission,commission_tax,operator_offer,
/// cancellation_charge,take_home). The legacy PDF text extractor is not yet ported (see parity matrix).
/// Only captured GDS evidence is compared — missing evidence yields needs_review, never a fabricated match.
/// </summary>
public sealed class ReconciliationService(GdsDbContext db, TimeProvider clock)
{
    private static readonly string[] Sections = ["sold", "pax_cancelled", "bus_cancelled", "exceptional_refund"];
    private static readonly string[] Definitive = ["status", "channel", "cancellation_charge", "doj", "fare", "commission", "commission_tax", "offer", "payout"];
    public static readonly string[] ExportHeaders = ["PNR", "DOJ (SaveTrip)", "DOJ (OTA)", "Fare (SaveTrip)", "Fare (OTA)", "Operator Offer (OTA)", "Tax (SaveTrip)", "Tax (OTA)",
        "Commission (OTA)", "Tax on Commission (OTA)", "TDS (OTA)", "TCS (OTA)", "Payable (SaveTrip)", "Take-home (OTA)", "Take-home Diff", "Status", "Resolved By", "Notes"];

    public async Task<(OtaInvoice Invoice, bool Duplicate)> UploadAsync(InvoiceUpload u, string actor)
    {
        byte[] content;
        List<OtaInvoiceLine> lines; List<string> warnings;
        string number; string? opCode = u.OperatorCode; DateOnly ps, pe; decimal? stated = u.StatedAmount;
        if (!string.IsNullOrEmpty(u.PdfBase64))
        {
            if (u.PdfBase64.Length > 28_000_000) throw new GdsException("FILE_TOO_LARGE", "PDF exceeds 20 MB", 413);
            try { content = Convert.FromBase64String(u.PdfBase64); } catch (FormatException) { throw new GdsException("VALIDATION", "pdfBase64 is not valid base64"); }
            List<string> pages;
            try { pages = PaymentAdviceParser.ExtractPages(content); }
            catch (GdsException) { throw; }
            catch (Exception) { throw new GdsException("PDF_UNREADABLE", "The PDF could not be read (corrupt, encrypted or unsupported)"); }
            var advice = PaymentAdviceParser.Parse(pages);
            number = advice.InvoiceNumber; opCode = advice.OperatorCode; stated = advice.StatedAmount;
            ps = advice.PeriodStart ?? u.PeriodStart ?? throw new GdsException("VALIDATION", "Billing period not found in PDF; supply periodStart/periodEnd");
            pe = advice.PeriodEnd ?? u.PeriodEnd ?? throw new GdsException("VALIDATION", "Billing period not found in PDF; supply periodStart/periodEnd");
            lines = advice.Lines; warnings = advice.Warnings;
            if (lines.Count > 15000) throw new GdsException("TOO_MANY_ROWS", "Invoice contains too many PNR rows", 413);
        }
        else
        {
            if (string.IsNullOrWhiteSpace(u.InvoiceNumber)) throw new GdsException("VALIDATION", "Invoice number is required");
            if (u.PeriodStart is null || u.PeriodEnd is null) throw new GdsException("VALIDATION", "Billing period is required");
            if (string.IsNullOrWhiteSpace(u.Csv) || u.Csv.Length > 10_000_000) throw new GdsException("VALIDATION", "CSV or PDF content is required (CSV max 10 MB)");
            number = u.InvoiceNumber.Trim(); ps = u.PeriodStart.Value; pe = u.PeriodEnd.Value;
            content = Encoding.UTF8.GetBytes(u.Csv);
            (lines, warnings) = ParseCsv(u.Csv);
            if (lines.Count == 0) throw new GdsException("NO_ROWS", "No PNR rows found");
            if (lines.Count > 15000) throw new GdsException("TOO_MANY_ROWS", "Invoice contains too many PNR rows", 413);
        }
        if (pe < ps) throw new GdsException("VALIDATION", "Billing period is invalid");
        var sha = Convert.ToHexString(SHA256.HashData(content));
        var dup = await db.OtaInvoices.FirstOrDefaultAsync(x => x.Provider == "REDBUS" && x.Sha256 == sha);
        if (dup is not null) return (dup, true);
        if (await db.OtaInvoices.AnyAsync(x => x.Provider == "REDBUS" && x.InvoiceNumber == number))
            throw new GdsException("DUPLICATE_INVOICE", "This invoice number already exists with different content", 409);

        var inv = new OtaInvoice
        {
            TenantId = db.CurrentTenantId, InvoiceNumber = number, OperatorCode = opCode, FileName = Path.GetFileName(u.FileName ?? "invoice"),
            Sha256 = sha, PeriodStart = ps, PeriodEnd = pe, StatedAmount = stated, Tolerance = u.Tolerance ?? 1m,
            UploadedBy = actor, UploadedAt = clock.GetUtcNow().UtcDateTime, Lines = lines,
            WarningsJson = warnings.Count > 0 ? System.Text.Json.JsonSerializer.Serialize(warnings) : null,
            Status = warnings.Count > 0 ? "review_required" : "parsed",
        };
        var provider = await db.OtaProviders.AsNoTracking().FirstOrDefaultAsync(p => p.Provider == "REDBUS");
        if (provider is not null && !string.IsNullOrEmpty(opCode) && !string.Equals(provider.OperatorCode, opCode, StringComparison.OrdinalIgnoreCase))
        {
            // The payment advice carries RedBus's numeric operator id; mapping it to our operator code is open (ambiguity A-16).
            if (string.IsNullOrEmpty(u.PdfBase64)) throw new GdsException("OPERATOR_MISMATCH", "Invoice operator code does not match this GDS tenant", 409);
            warnings.Add($"PDF operator code {opCode} differs from configured code {provider.OperatorCode}; confirm this statement belongs to this operator");
            inv.WarningsJson = System.Text.Json.JsonSerializer.Serialize(warnings); inv.Status = "review_required";
        }
        db.OtaInvoices.Add(inv);
        await CompareAsync(inv);
        db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = actor, Action = "INVOICE_UPLOAD", Entity = "ota_invoice", EntityId = inv.InvoiceNumber, At = clock.GetUtcNow().UtcDateTime,
            DataJson = System.Text.Json.JsonSerializer.Serialize(new { rows = lines.Count, sha }) });
        await db.SaveChangesAsync();
        return (inv, false);
    }

    public static (List<OtaInvoiceLine> Lines, List<string> Warnings) ParseCsv(string csv)
    {
        var rows = ReadCsv(csv);
        var warnings = new List<string>();
        if (rows.Count == 0) return ([], warnings);
        var header = rows[0].Select(h => h.Trim().ToLowerInvariant()).ToList();
        int Col(string n) => header.IndexOf(n);
        if (Col("pnr") < 0 || Col("section") < 0) throw new GdsException("CSV_HEADER", "CSV must contain at least 'section' and 'pnr' columns");
        var occurrence = new Dictionary<string, int>();
        var lines = new List<OtaInvoiceLine>();
        for (var r = 1; r < rows.Count; r++)
        {
            var row = rows[r];
            string? Get(string n) { var i = Col(n); return i >= 0 && i < row.Length && !string.IsNullOrWhiteSpace(row[i]) ? row[i].Trim() : null; }
            decimal? Num(string n) => Get(n) is { } s && decimal.TryParse(s.Replace(",", ""), NumberStyles.Number, CultureInfo.InvariantCulture, out var d) ? d : null;
            var pnr = Get("pnr");
            if (pnr is null) continue;
            var section = (Get("section") ?? "sold").ToLowerInvariant();
            if (!Sections.Contains(section)) { warnings.Add($"Row {r + 1}: unknown section '{section}'"); continue; }
            var key = $"{section}:{pnr.ToUpperInvariant()}";
            occurrence[key] = occurrence.GetValueOrDefault(key) + 1;
            var l = new OtaInvoiceLine
            {
                LineKey = $"{key}:{occurrence[key]}", Pnr = pnr, Section = section,
                Doj = Get("doj") is { } d && DateOnly.TryParse(d, CultureInfo.InvariantCulture, out var dd) ? dd : null,
                Fare = Num("fare"), Tax = Num("tax"), Commission = Num("commission"), CommissionTax = Num("commission_tax"),
                OperatorOffer = Num("operator_offer"), CancellationCharge = Num("cancellation_charge"), TakeHome = Num("take_home"),
            };
            if (l.Doj is null || l.Fare is null) warnings.Add($"Row {r + 1}: incomplete date or amount fields");
            lines.Add(l);
        }
        return (lines, warnings);
    }

    /// <summary>Re-run comparison against current GDS records, preserving operator resolutions.</summary>
    public async Task CompareAsync(OtaInvoice inv)
    {
        var tol = inv.Tolerance;
        inv.Lines.RemoveAll(l => l.Section == "missing_in_ota");
        var pnrs = inv.Lines.Select(l => l.Pnr).Distinct().ToList();
        var bookings = await db.Bookings.AsNoTracking().Include(b => b.Passengers).Include(b => b.Trip)
            .Where(b => pnrs.Contains(b.Pnr) || (b.Channel == "redbus" && b.Trip!.TravelDate >= inv.PeriodStart && b.Trip.TravelDate <= inv.PeriodEnd))
            .ToListAsync();
        var ids = bookings.Select(b => b.Id).ToList();
        var fin = await db.BookingFinances.AsNoTracking().Where(f => ids.Contains(f.BookingId)).ToDictionaryAsync(f => f.BookingId);
        var byPnr = bookings.ToDictionary(b => b.Pnr, StringComparer.OrdinalIgnoreCase);

        foreach (var l in inv.Lines)
        {
            var flags = new List<string>();
            if (!byPnr.TryGetValue(l.Pnr, out var b))
            {
                Set(l, null, "unmatched_ota", ["missing_in_gds"], "PNR not found in GDS");
                continue;
            }
            fin.TryGetValue(b.Id, out var f);
            var oursCancelled = b.Status == "CANCELLED";
            var invCancelled = l.Section is "pax_cancelled" or "bus_cancelled";
            if (invCancelled != oursCancelled) flags.Add("status");
            if (b.Channel != "redbus") flags.Add("channel");
            var ourCharge = b.Passengers.Sum(p => p.CancellationCharge);
            if (l.Section == "pax_cancelled" && oursCancelled && l.CancellationCharge is { } cc && Math.Abs(ourCharge - cc) > tol) flags.Add("cancellation_charge");
            if (l.Doj is { } doj && b.Trip!.TravelDate != doj) flags.Add("doj");
            var expectedFare = f?.NetFare ?? b.TotalFare;
            var expectedTax = f?.Gst;
            var takeHome = f?.OtaTakeHome ?? (f is { OtaCommission: { } c, OtaCommissionGst: { } cg, OperatorOffer: { } o } ? b.TotalFare - c - cg - o : null);
            if (l.Fare is { } fare && Math.Abs(expectedFare - fare) > tol) flags.Add("fare");
            if (f?.OtaCommission is { } ec && l.Commission is { } lc && Math.Abs(ec - lc) > tol) flags.Add("commission");
            if (f?.OtaCommissionGst is { } ecg && l.CommissionTax is { } lct && Math.Abs(ecg - lct) > tol) flags.Add("commission_tax");
            if (f?.OperatorOffer is { } eo && l.OperatorOffer is { } lo && Math.Abs(eo - lo) > tol) flags.Add("offer");
            decimal? delta = l.TakeHome is { } th && takeHome is { } eth ? Math.Round(th - eth, 2) : null;
            if (delta is { } dl && Math.Abs(dl) > tol) flags.Add("payout");
            var hasEvidence = expectedTax is not null && f?.OtaCommission is not null && f.OtaCommissionGst is not null && f.OperatorOffer is not null && takeHome is not null;
            if (!hasEvidence) flags.Add("gds_settlement_evidence_missing");
            var mismatch = flags.Any(Definitive.Contains);
            var verified = hasEvidence && !mismatch && l.Section == "sold" && b.Status == "CONFIRMED";
            l.ExpectedDoj = b.Trip!.TravelDate; l.ExpectedFare = expectedFare; l.ExpectedTax = expectedTax; l.ExpectedTakeHome = takeHome; l.Delta = delta;
            Set(l, b, mismatch ? "mismatched" : verified ? "matched" : "needs_review", flags,
                mismatch ? string.Join(", ", flags.Where(Definitive.Contains)) : !hasEvidence ? "GDS settlement evidence incomplete — financial fields left unverified" : verified ? "Verified against recorded GDS evidence" : "Needs review");
        }

        // Missing in OTA: RedBus-origin GDS bookings travelling in the billing period but absent from the statement.
        var invoicePnrs = inv.Lines.Select(l => l.Pnr).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var b in bookings.Where(b => b.Channel == "redbus" && b.Trip!.TravelDate >= inv.PeriodStart && b.Trip.TravelDate <= inv.PeriodEnd && !invoicePnrs.Contains(b.Pnr)))
        {
            fin.TryGetValue(b.Id, out var f);
            var l = new OtaInvoiceLine { LineKey = $"missing:{b.Id}", Pnr = b.Pnr, Section = "missing_in_ota", ExpectedDoj = b.Trip!.TravelDate, ExpectedFare = f?.NetFare ?? b.TotalFare };
            Set(l, b, "unmatched_gds", ["missing_in_ota"], "GDS RedBus PNR absent from uploaded statement");
            inv.Lines.Add(l);
        }
    }

    private static void Set(OtaInvoiceLine l, Booking? b, string status, List<string> flags, string why)
    {
        l.BookingId = b?.Id; l.BookingStatus = b?.Status; l.Status = status; l.Differences = flags.Distinct().ToArray(); l.Why = why;
    }

    public static object Totals(OtaInvoice inv)
    {
        var l = inv.Lines;
        return new
        {
            lines = l.Count,
            matched = l.Count(x => x.Status == "matched"), mismatched = l.Count(x => x.Status == "mismatched"), needsReview = l.Count(x => x.Status == "needs_review"),
            missingInGds = l.Count(x => x.Status == "unmatched_ota"), missingInOta = l.Count(x => x.Status == "unmatched_gds"),
            resolved = l.Count(x => x.ResolutionAction != null), disputed = l.Count(x => x.ResolutionAction == "dispute"),
            outstanding = l.Count(x => x.Status != "matched" && x.ResolutionAction == null),
            otaTakeHome = l.Where(x => x.Section == "sold").Sum(x => x.TakeHome ?? 0),
            atRisk = l.Where(x => x.Status == "mismatched" && x.Delta != null).Sum(x => Math.Abs(x.Delta!.Value)),
            bySection = Sections.Append("missing_in_ota").ToDictionary(s => s, s => l.Count(x => x.Section == s)),
            issues = l.SelectMany(x => x.Differences).GroupBy(x => x).ToDictionary(g => g.Key, g => g.Count()),
        };
    }

    public async Task<OtaInvoiceLine> ResolveAsync(long invoiceId, ResolveInput r, string actor)
    {
        if (r.Action is not ("accept_ota" or "dispute" or "investigating" or "clear")) throw new GdsException("VALIDATION", "Invalid reconciliation action");
        var inv = await db.OtaInvoices.FirstOrDefaultAsync(x => x.Id == invoiceId) ?? throw new GdsException("NOT_FOUND", "Invoice not found", 404);
        var line = await db.OtaInvoiceLines.FirstOrDefaultAsync(x => x.Id == r.LineId && x.InvoiceId == inv.Id) ?? throw new GdsException("NOT_FOUND", "Line not found", 404);
        if (line.Status == "matched" && r.Action != "clear") throw new GdsException("VALIDATION", "Matched records cannot be disputed unless evidence changes");
        var note = (r.Note ?? "").Trim();
        if (r.Action == "dispute" && note.Length == 0) throw new GdsException("VALIDATION", "Dispute reason is required");
        if (r.Action == "clear") { line.ResolutionAction = null; line.ResolutionNote = null; line.ResolvedBy = null; line.ResolvedAt = null; }
        else { line.ResolutionAction = r.Action; line.ResolutionNote = note.Length > 2000 ? note[..2000] : note; line.ResolvedBy = actor; line.ResolvedAt = clock.GetUtcNow().UtcDateTime; }
        db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = actor, Action = "INVOICE_RESOLVE", Entity = "ota_invoice_line", EntityId = line.Id.ToString(), At = clock.GetUtcNow().UtcDateTime,
            DataJson = System.Text.Json.JsonSerializer.Serialize(new { r.Action, note }) });
        await db.SaveChangesAsync();
        return line;
    }

    /// <summary>Same columns, ordering, BOM and formula-injection escaping as the approved legacy export.</summary>
    public static string ExportCsv(IEnumerable<OtaInvoiceLine> lines)
    {
        static string Esc(string? v, bool numeric = false)
        {
            var s = v ?? "";
            if (!numeric && System.Text.RegularExpressions.Regex.IsMatch(s, @"^[=+@\t\r]|^-(?!\d+(?:\.\d+)?$)")) s = "'" + s;
            return "\"" + s.Replace("\"", "\"\"") + "\"";
        }
        static string M(decimal? v) => v is { } d ? d.ToString("0.00", CultureInfo.InvariantCulture) : "";
        static string D(DateOnly? d) => d is { } x ? x.ToString("yyyy-MM-dd") + "T00:00:00" : "";
        static string St(string s) => s switch { "matched" => "Matched", "mismatched" => "Mismatched", "needs_review" => "Needs Review", "unmatched_ota" => "Missing in GDS", "unmatched_gds" => "Missing in OTA", _ => s };
        var sb = new StringBuilder("\ufeff");
        sb.Append(string.Join(',', ExportHeaders.Select(h => Esc(h)))).Append("\r\n");
        foreach (var r in lines)
        {
            var paid = r.ExpectedFare is { } ef ? ef + (r.ExpectedTax ?? 0) : (decimal?)null;
            var notes = string.Join(" | ", new[] { r.ResolutionAction is null ? "" : "Resolution: " + r.ResolutionAction, string.IsNullOrEmpty(r.ResolutionNote) ? r.Why : r.ResolutionNote }.Where(x => !string.IsNullOrEmpty(x)));
            string[] cells = [Esc(r.Pnr), Esc(D(r.ExpectedDoj)), Esc(D(r.Doj)), Esc(M(paid), true), Esc(M(r.Fare), true), Esc(M(r.OperatorOffer), true), Esc(M(r.ExpectedTax), true),
                Esc(M(r.Tax), true), Esc(M(r.Commission), true), Esc(M(r.CommissionTax), true), Esc("", true), Esc("", true), Esc(M(paid), true), Esc(M(r.TakeHome), true),
                Esc(M(r.Delta), true), Esc(St(r.Status)), Esc(r.ResolvedBy), Esc(notes)];
            sb.Append(string.Join(',', cells)).Append("\r\n");
        }
        return sb.ToString();
    }

    private static List<string[]> ReadCsv(string text)
    {
        var rows = new List<string[]>();
        var cur = new List<string>(); var field = new StringBuilder(); var q = false;
        text = text.TrimStart('\ufeff');
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (q)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                else if (c == '"') q = false;
                else field.Append(c);
            }
            else if (c == '"') q = true;
            else if (c == ',') { cur.Add(field.ToString()); field.Clear(); }
            else if (c is '\n' or '\r')
            {
                if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                cur.Add(field.ToString()); field.Clear();
                if (cur.Any(x => x.Length > 0)) rows.Add([.. cur]);
                cur.Clear();
            }
            else field.Append(c);
        }
        cur.Add(field.ToString());
        if (cur.Any(x => x.Length > 0)) rows.Add([.. cur]);
        return rows;
    }
}
