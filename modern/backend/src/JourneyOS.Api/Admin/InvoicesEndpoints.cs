using System.Text.Json;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

/// <summary>
/// Accounts → Invoices (legacy server/api/platform-billing-v25.js operator routes, server/invoices-v24.js shapes).
/// The operator only sees documents the platform has issued (status "issued"). Imported legacy catalogue entries
/// (status Paid / null) are not issued documents, exactly as in legacy where they never appear on this screen.
/// Operators can never create, replace or edit issued financial documents. No PDF store exists in this version, so
/// PDF / bundle downloads report that the original is unavailable instead of fabricating a document.
/// </summary>
public static class InvoicesEndpoints
{
    public static readonly (string Id, string Label, string Title, int Rank)[] Types =
    [
        ("tax", "Tax Invoice", "TAX INVOICE", 0),
        ("metro", "Metro Feeder Statement", "METRO FEEDER SERVICE STATEMENT", 1),
        ("cloud", "Cloud Calling Statement", "CLOUD CALLS USAGE STATEMENT", 2),
        ("ai", "AI Calling Statement", "AI VOICE CALLS USAGE STATEMENT", 3),
        ("chat", "Chat Statement", "WHATSAPP, AI MESSAGES & SMS USAGE STATEMENT", 4),
        ("platform", "Platform Sales Statement", "PLATFORM SALES STATEMENT", 5),
        ("operator", "Operator Statement", "STATEMENT OF ACCOUNT", 6),
    ];

    /// <summary>Legacy typeOf(): kind / label → document type.</summary>
    public static string? TypeOf(string? kind, string? label)
    {
        var k = (kind ?? "").ToLowerInvariant();
        if (Types.Any(t => t.Id == k)) return k;
        var l = (label ?? "").ToLowerInvariant();
        if (k == "invoice" || l.Contains("tax invoice")) return "tax";
        if (k == "metro" || l.Contains("metro feeder")) return "metro";
        if (k == "chats" || l.Contains("chat statement")) return "chat";
        if (k == "platform" || l.Contains("platform sales")) return "platform";
        if (k == "operator" || l.Contains("operator statement")) return "operator";
        if (k == "calls" || l.Contains("calling")) return System.Text.RegularExpressions.Regex.IsMatch(l, @"\bai\b") ? "ai" : "cloud";
        return null;
    }

    private static Dictionary<string, object?>? AsDoc(OperatorDocument r)
    {
        var type = TypeOf(r.Kind, r.Label);
        if (type is null) return null;
        var t = Types.First(x => x.Id == type);
        var month = r.Month ?? r.Date.ToString("yyyy-MM");
        return new()
        {
            ["key"] = "issued-" + r.Id, ["id"] = r.Id, ["type"] = type, ["label"] = t.Label, ["name"] = r.Name,
            ["period_month"] = month, ["document_date"] = r.Date.ToString("yyyy-MM-dd"), ["period_start"] = month + "-01", ["period_end"] = "",
            ["status"] = r.Status, ["amount"] = r.Amount, ["is_reference"] = false, ["has_pdf"] = false, ["has_snapshot"] = false,
            ["pdf_sha256"] = null, ["original_filename"] = null, ["source"] = "issued", ["rank"] = t.Rank, ["imported_at"] = null,
        };
    }

    private static async Task<List<Dictionary<string, object?>>> IssuedAsync(GdsDbContext db) =>
        (await db.OperatorDocuments.AsNoTracking().Where(d => d.Status == "issued").ToListAsync())
            .Select(AsDoc).OfType<Dictionary<string, object?>>()
            .OrderByDescending(d => (string)d["period_month"]!).ThenByDescending(d => (string)d["document_date"]!)
            .ThenBy(d => (int)d["rank"]!).ThenBy(d => (string)d["key"]!, StringComparer.Ordinal).ToList();

    private static async Task<Dictionary<string, object?>> ListAsync(GdsDbContext db)
    {
        var docs = await IssuedAsync(db);
        var statement = docs.Where(d => (string)d["type"]! == "operator")
            .OrderByDescending(d => (string)d["document_date"]!).ThenByDescending(d => (string)d["period_month"]!).FirstOrDefault();
        decimal? n = statement?["amount"] is decimal a ? Math.Round(a, 2) : null;
        return new()
        {
            ["documents"] = docs,
            ["types"] = Types.Select(t => new { id = t.Id, label = t.Label }),
            ["years"] = docs.Select(d => ((string)d["period_month"]!)[..4]).Distinct().OrderDescending(),
            ["balance"] = new Dictionary<string, object?>
            {
                ["statement"] = statement?["name"], ["statement_key"] = statement?["key"], ["statement_date"] = statement?["document_date"],
                ["closing_balance"] = n, ["payable_to_operator"] = n is null ? null : Math.Max(0, n.Value),
                ["payable_by_operator"] = n is null ? null : Math.Max(0, -n.Value), ["has_evidence"] = n is not null,
                ["pending_payments"] = 0,
            },
            ["reference_current"] = null, ["auto_issued"] = true, ["scope"] = "operator",
        };
    }

    private static IResult Fail(int status, string message) => Results.Json(new { success = false, message }, statusCode: status);

    public record PaymentInput(JsonElement? Amount, string? Reference);

    public static void Map(RouteGroupBuilder g)
    {
        const string P = "/accounts/invoices";
        g.MapGet(P, async (GdsDbContext db) => Results.Ok(await ListAsync(db))).RequireAuthorization(Policies.Accounts);
        g.MapGet(P + "/documents/{key}", async (string key, GdsDbContext db) =>
        {
            var doc = (await IssuedAsync(db)).FirstOrDefault(d => (string)d["key"]! == key);
            return doc is null ? Fail(404, "Issued document not found for this operator") : Results.Ok(new { document = doc, snapshot = (object?)null });
        }).RequireAuthorization(Policies.Accounts);
        g.MapGet(P + "/documents/{key}/pdf", async (string key, GdsDbContext db) =>
            (await IssuedAsync(db)).Any(d => (string)d["key"]! == key)
                ? Fail(409, "Original PDF not uploaded yet. Import the provider-issued PDF to enable exact viewing and download.")
                : Fail(404, "Issued document not found for this operator")).RequireAuthorization(Policies.Accounts);
        g.MapGet(P + "/bundle/{month}", async (string month, GdsDbContext db) =>
        {
            if (!System.Text.RegularExpressions.Regex.IsMatch(month, @"^\d{4}-(0[1-9]|1[0-2])$")) return Fail(400, "Invalid month");
            var docs = (await IssuedAsync(db)).Where(d => (string)d["period_month"]! == month).ToList();
            return docs.Count == 0 ? Fail(404, "No issued documents for this month") : Fail(409, "Import all original PDFs before downloading this month: " + string.Join(", ", docs.Select(d => d["name"])));
        }).RequireAuthorization(Policies.Accounts);
        g.MapGet(P + "/reconcile/{month}", async (string month, GdsDbContext db) =>
            (await IssuedAsync(db)).Any(d => (string)d["period_month"]! == month)
                ? Results.Ok(new { summary = new { matched = 0, mismatched = 0, insufficient_evidence = 0 }, checks = Array.Empty<object>() })
                : Fail(404, "No issued documents for this period")).RequireAuthorization(Policies.Accounts);
        g.MapPost(P + "/payments", async (PaymentInput i, GdsDbContext db, HttpContext h) =>
        {
            var bal = (Dictionary<string, object?>)(await ListAsync(db))["balance"]!;
            if (bal["payable_by_operator"] is not decimal due || due <= 0) return Fail(400, "No issued payable-by-operator balance");
            var amount = i.Amount is { } a && (a.ValueKind == JsonValueKind.Number ? a.TryGetDecimal(out var d) : a.ValueKind == JsonValueKind.String && decimal.TryParse(a.GetString(), System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out d)) ? Math.Round(d, 2) : 0;
            var reference = (i.Reference ?? "").Trim();
            if (amount <= 0 || amount > due + 0.011m) return Fail(400, "Invalid payment amount");
            if (reference.Length is < 5 or > 120) return Fail(400, "Valid bank transfer reference required");
            if (await db.OperatorPayments.AnyAsync(p => p.Reference.ToLower() == reference.ToLower())) return Fail(409, "Payment reference already submitted");
            var p = new OperatorPayment { TenantId = db.CurrentTenantId, Amount = amount, Reference = reference, By = h.User.Identity?.Name ?? "operator", At = DateTime.UtcNow };
            db.OperatorPayments.Add(p);
            await db.SaveChangesAsync();
            return Results.Json(new { id = p.Id, amount = p.Amount, status = "pending_verification", message = "Reference recorded; transfer not initiated, and statement balance unchanged" }, statusCode: 202);
        }).RequireAuthorization(Policies.Accounts);
    }
}
