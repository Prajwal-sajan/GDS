using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Reports;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Sarathi;

public sealed record AskInput(string Question, long? ConversationId);
public sealed record SarathiAnswer(string Text, JsonArray Table, string Intent, string Period);

/// <summary>
/// Sarathi: deterministic, rule-based operations analyst (port of legacy sarathiAnswer). It is NOT an LLM: each intent is a
/// keyword rule answered from the same report queries the UI uses, so numbers always match the Reports screens.
/// </summary>
public sealed class SarathiService(GdsDbContext db, ReportsService reports, TimeProvider clock)
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    public static readonly string[] Suggestions =
    [
        "How many passengers travelled this week?", "What was yesterday's revenue?", "Show occupancy for the last 30 days",
        "Which channel gives the most revenue?", "Which service performed best this week?", "How many cancellations yesterday?",
        "Which documents are expiring soon?", "What is the profit this week?",
    ];

    public static (DateOnly From, DateOnly To, string Label) Period(string q, DateOnly today)
    {
        if (q.Contains("yesterday")) return (today.AddDays(-1), today.AddDays(-1), "yesterday");
        if (q.Contains("today")) return (today, today, "today");
        if (q.Contains("last month") || q.Contains("past month") || q.Contains("30 days")) return (today.AddDays(-30), today, "the last 30 days");
        if (q.Contains("tomorrow")) return (today.AddDays(1), today.AddDays(1), "tomorrow");
        return (today.AddDays(-6), today, "the last 7 days");
    }

    private static string Inr(decimal n) => "₹" + Math.Round(n).ToString("#,##0", CultureInfo.GetCultureInfo("en-IN"));
    private static JsonNode J(object o) => JsonSerializer.SerializeToNode(o, Web)!;
    private static decimal D(JsonNode? n) => n?.GetValue<decimal>() ?? 0;

    public async Task<SarathiAnswer> AnswerAsync(string question)
    {
        var q = question.ToLowerInvariant();
        var today = await reports.TodayAsync();
        var (from, to, label) = Period(q, today);
        var an = J(await reports.AnalyticsAsync(from, to, null));
        var t = an["totals"]!;
        var rows = an["rows"]!.AsArray();
        JsonArray Table(Func<JsonNode, object> f) => new(rows.Select(r => J(f(r!))).ToArray());
        string P = $"{from:yyyy-MM-dd}..{to:yyyy-MM-dd}";

        if (q.Contains("occupan"))
            return new($"Average occupancy for {label} was {D(t["occupancyPct"])}% across {D(t["trips"])} trips.",
                Table(r => new { date = (string)r["date"]!, occupancy = $"{D(r["occupancyPct"])}%", trips = D(r["trips"]) }), "occupancy", P);
        if (q.Contains("cancel"))
        {
            var c = J(await reports.CancellationsReportAsync(from, to));
            var cr = c["rows"]!.AsArray();
            return new($"{cr.Count} cancellations in {label}; cancellation charges {Inr(D(t["cancelCharges"]))} (ex-GST), refunds {Inr(D(t["refunds"]))}.",
                new JsonArray(cr.Take(15).Select(x => x!.DeepClone()).ToArray()), "cancellations", P);
        }
        if (System.Text.RegularExpressions.Regex.IsMatch(q, "no.?show"))
        {
            var c = J(await reports.NoShowsAsync(from, to))["rows"]!.AsArray();
            return new($"{c.Count} no-shows recorded in {label}.", new JsonArray(c.Take(15).Select(x => x!.DeepClone()).ToArray()), "no_shows", P);
        }
        if (q.Contains("profit") || q.Contains("p&l") || q.Contains("pnl") || q.Contains("expense"))
        {
            var cov = t["expenseCoverage"]!;
            var caveat = D(cov["tripsWithExpense"]) < D(cov["trips"]) ? $" Only {D(cov["tripsWithExpense"])} of {D(cov["trips"])} trips have recorded expenses, so profit is overstated." : "";
            return new($"For {label}: net sales {Inr(D(t["netSales"]))}, recorded expenses {Inr(D(t["expense"]))}, profit {Inr(D(t["profit"]))}.{caveat}",
                Table(r => new { date = (string)r["date"]!, netSales = D(r["netSales"]), expense = D(r["expense"]), profit = D(r["profit"]) }), "profit", P);
        }
        if (q.Contains("passenger") || q.Contains("travelled") || q.Contains("traveled") || q.Contains("seats"))
        {
            var trips = D(t["trips"]);
            return new($"{D(t["seats"])} passengers travelled in {label} on {trips} trips (avg {Math.Round(D(t["seats"]) / (trips == 0 ? 1 : trips))} per trip).",
                Table(r => new { date = (string)r["date"]!, passengers = D(r["seats"]), trips = D(r["trips"]) }), "passengers", P);
        }
        if (q.Contains("channel") || q.Contains("source") || q.Contains("ota") || q.Contains("redbus") || q.Contains("abhibus"))
        {
            var ch = an["channels"]!.AsArray();
            var top = ch.FirstOrDefault();
            return new($"Top channel in {label} is {(string?)top?["channel"] ?? "—"} with {Inr(D(top?["netSales"]))} net sales.",
                new JsonArray(ch.Select(x => x!.DeepClone()).ToArray()), "channels", P);
        }
        if (q.Contains("route") || q.Contains("service") || q.Contains("best") || q.Contains("worst"))
        {
            var sv = an["services"]!.AsArray();
            if (sv.Count == 0) return new($"No confirmed bookings in {label}.", [], "services", P);
            return new($"Best performing service in {label}: {sv[0]!["service"]} ({Inr(D(sv[0]!["netSales"]))}). Lowest: {sv[^1]!["service"]}.",
                new JsonArray(sv.Select(x => x!.DeepClone()).ToArray()), "services", P);
        }
        if (q.Contains("document") || q.Contains("expir") || q.Contains("insurance") || q.Contains("permit") || q.Contains("licen"))
        {
            var ops = J(await reports.DailyOpsAsync(today))["compliance"]!;
            var table = new JsonArray();
            foreach (var d in ops["vehicleDocuments"]!.AsArray()) table.Add(J(new { owner = (string?)d!["vehicle"], document = (string?)d["document"], expiry = (string?)d["expiryDate"], state = (string?)d["state"] }));
            foreach (var l in ops["licences"]!.AsArray()) table.Add(J(new { owner = (string?)l!["name"], document = "Driving licence", expiry = (string?)l["licenseExpiry"], state = (string?)l["state"] }));
            return new($"{table.Count} documents expired or expiring within 30 days.", table, "documents", $"{today:yyyy-MM-dd}+30d");
        }
        if (q.Contains("revenue") || q.Contains("sales") || q.Contains("earn") || q.Contains("income") || q.Contains("asp"))
            return new($"Net sales for {label}: {Inr(D(t["netSales"]))} from {D(t["seats"])} seats (ASP {Inr(D(t["asp"]))}).",
                Table(r => new { date = (string)r["date"]!, netSales = D(r["netSales"]), seats = D(r["seats"]), asp = D(r["asp"]) }), "revenue", P);
        return new("I can answer questions on passengers, revenue, occupancy, cancellations, no-shows, profit, channels, services and expiring documents. Try \"How many passengers travelled this week?\"",
            [], "help", P);
    }

    public async Task<(long ConversationId, SarathiAnswer Answer)> AskAsync(AskInput i, string owner)
    {
        var question = (i.Question ?? "").Trim();
        if (question.Length == 0) throw new GdsException("VALIDATION", "Ask a question");
        if (question.Length > 500) throw new GdsException("VALIDATION", "Question too long");
        var ans = await AnswerAsync(question);
        var now = clock.GetUtcNow().UtcDateTime;
        SarathiConversation? conv = null;
        if (i.ConversationId is { } cid)
            conv = await db.SarathiConversations.FirstOrDefaultAsync(c => c.Id == cid && c.Owner == owner) ?? throw new GdsException("NOT_FOUND", "Conversation not found", 404);
        if (conv is null)
        {
            conv = new SarathiConversation { TenantId = db.CurrentTenantId, Owner = owner, Title = question[..Math.Min(60, question.Length)], CreatedAt = now };
            db.SarathiConversations.Add(conv);
        }
        var msgs = JsonNode.Parse(conv.MessagesJson)!.AsArray();
        msgs.Add(J(new { role = "user", text = question, ts = now }));
        msgs.Add(J(new { role = "assistant", text = ans.Text, table = ans.Table.DeepClone(), intent = ans.Intent, period = ans.Period, ts = now }));
        conv.MessagesJson = msgs.ToJsonString();
        conv.UpdatedAt = now;
        await db.SaveChangesAsync();
        return (conv.Id, ans);
    }
}
