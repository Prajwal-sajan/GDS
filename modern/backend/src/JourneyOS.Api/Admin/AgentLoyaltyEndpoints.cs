using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

/// <summary>
/// Accounts → Agent Settings and Loyalty (legacy server/api/accounts.js: /accounts/channels, PUT /accounts/channels/agents,
/// /reconciliation/config, /coupons). Responses keep the legacy snake_case shapes the ported screens consume.
/// </summary>
public static class AgentLoyaltyEndpoints
{
    private static readonly string[] TermKeys = ["balance", "settlement_cycle_days", "commission_base", "settlement_mode", "tax_on_fare_percent", "tds_percent", "gst_on_commission_percent", "match_tolerance", "independent_commission"];

    private static string Actor(HttpContext h) => h.User.Identity!.Name!;

    /// <summary>Lenient number read (legacy forms post numbers as strings; "" ⇒ default).</summary>
    private static decimal? Num(Dictionary<string, JsonElement> b, string k)
    {
        if (!b.TryGetValue(k, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.Number => v.GetDecimal(),
            JsonValueKind.String when v.GetString() is { Length: > 0 } s => decimal.TryParse(s, NumberStyles.Number, CultureInfo.InvariantCulture, out var d) ? d : throw new GdsException("VALIDATION", $"{k.Replace('_', ' ')} must be a number"),
            _ => null,
        };
    }
    private static string? Str(Dictionary<string, JsonElement> b, string k) => b.TryGetValue(k, out var v) && v.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined) ? (v.ValueKind == JsonValueKind.String ? v.GetString() : v.GetRawText()) : null;
    private static bool? Bool(Dictionary<string, JsonElement> b, string k) => !b.TryGetValue(k, out var v) ? null : v.ValueKind switch
    {
        JsonValueKind.True => true, JsonValueKind.False => false,
        JsonValueKind.String => v.GetString() is "true" or "on" or "1",
        JsonValueKind.Number => v.GetDecimal() != 0, _ => null,
    };

    // ---------------- agents ----------------
    private static Dictionary<string, object?> AgentRow(AppUser u)
    {
        var o = new Dictionary<string, object?>
        {
            ["channel_key"] = "agent:" + u.Phone, ["id"] = u.Id, ["name"] = u.Name, ["phone"] = u.Phone,
            ["commission_pct"] = u.CommissionPct, ["credit_limit"] = u.CreditLimit, ["is_active"] = u.Status != "INACTIVE",
        };
        if (u.AgentTermsJson is { Length: > 0 } j && JsonNode.Parse(j) is JsonObject terms)
            foreach (var (k, v) in terms) o[k] = v?.DeepClone();
        return o;
    }

    // ---------------- OTA configs ----------------
    private static Dictionary<string, object?> ConfigRow(OtaSettlementConfig c) => new()
    {
        ["ota_slug"] = c.OtaSlug, ["ota_display_name"] = c.DisplayName, ["commission_percent"] = c.CommissionPercent, ["commission_base"] = c.CommissionBase,
        ["tds_percent"] = c.TdsPercent, ["gst_on_commission_percent"] = c.GstOnCommissionPercent, ["tax_on_fare_percent"] = c.TaxOnFarePercent,
        ["settlement_mode"] = c.SettlementMode, ["settlement_cycle_days"] = c.SettlementCycleDays, ["tds_section"] = c.TdsSection,
        ["match_tolerance"] = c.MatchTolerance, ["tax_receivable_from_ota"] = c.TaxReceivableFromOta,
        ["commission_kept_on_passenger_cancel"] = c.CommissionKeptOnPassengerCancel, ["is_active"] = c.IsActive,
    };

    // ---------------- coupons ----------------
    private static Dictionary<string, object?> CouponRow(Coupon c, List<CouponRedemption> red, DateTime since)
    {
        var mine = red.Where(r => r.Code == c.Code).ToList();
        var recent = mine.Where(r => r.At >= since).ToList();
        return new()
        {
            ["id"] = c.Id, ["created_at"] = c.CreatedAt, ["code"] = c.Code, ["description"] = c.Description, ["discount_type"] = c.DiscountType,
            ["discount_value"] = c.DiscountValue, ["min_fare"] = c.MinFare, ["max_discount_amount"] = c.MaxDiscountAmount, ["audience"] = c.Audience,
            ["channels"] = c.Channels, ["is_active"] = c.IsActive, ["stackable"] = c.Stackable, ["private"] = c.Private,
            ["per_user_limit"] = c.PerUserLimit, ["total_limit"] = c.TotalLimit,
            ["valid_from"] = c.ValidFrom?.ToString("yyyy-MM-dd"), ["valid_until"] = c.ValidUntil?.ToString("yyyy-MM-dd"),
            ["uses_total"] = mine.Count, ["uses_30d"] = recent.Count, ["given_30d"] = Math.Round(recent.Sum(r => r.Amount), 2),
        };
    }

    private static DateOnly? DateOf(Dictionary<string, JsonElement> b, string k)
    {
        var s = Str(b, k);
        if (string.IsNullOrWhiteSpace(s)) return null;
        return DateOnly.TryParseExact(s, "yyyy-MM-dd", out var d) ? d : throw new GdsException("VALIDATION", $"{k.Replace('_', ' ')} must be a date (yyyy-MM-dd)");
    }

    /// <summary>Apply coupon fields present in the body (legacy PUT merges the given fields; code is never changed).</summary>
    private static void ApplyCoupon(Coupon c, Dictionary<string, JsonElement> b)
    {
        if (b.ContainsKey("description")) c.Description = (Str(b, "description") ?? "").Trim();
        if (b.ContainsKey("discount_type")) c.DiscountType = Str(b, "discount_type") is "percent" or "percentage" ? "percent" : "flat";
        if (b.ContainsKey("discount_value")) c.DiscountValue = Num(b, "discount_value") ?? 0;
        if (b.ContainsKey("min_fare")) c.MinFare = Num(b, "min_fare");
        if (b.ContainsKey("max_discount_amount")) c.MaxDiscountAmount = Num(b, "max_discount_amount");
        if (b.ContainsKey("total_limit")) c.TotalLimit = Num(b, "total_limit") is { } t ? (int)t : null;
        if (b.ContainsKey("per_user_limit")) c.PerUserLimit = Num(b, "per_user_limit") is { } p ? (int)p : null;
        if (b.ContainsKey("valid_from")) c.ValidFrom = DateOf(b, "valid_from");
        if (b.ContainsKey("valid_until")) c.ValidUntil = DateOf(b, "valid_until");
        if (b.ContainsKey("audience")) c.Audience = Str(b, "audience") is { Length: > 0 } a ? a : "all";
        if (b.TryGetValue("channels", out var ch) && ch.ValueKind == JsonValueKind.Array)
            c.Channels = ch.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x is "website" or "agent" or "branch").Distinct().ToArray();
        if (Bool(b, "stackable") is { } st) c.Stackable = st;
        if (Bool(b, "private") is { } pr) c.Private = pr;
        if (Bool(b, "is_active") is { } ia) c.IsActive = ia;
        if (c.DiscountValue <= 0) throw new GdsException("VALIDATION", "Discount must be positive");
        if (c.DiscountType == "percent" && c.DiscountValue > 100) throw new GdsException("VALIDATION", "Percent discount cannot exceed 100%");
        if (c.MinFare < 0 || c.MaxDiscountAmount < 0 || c.TotalLimit < 0 || c.PerUserLimit < 0) throw new GdsException("VALIDATION", "Limits cannot be negative");
        if (c.ValidFrom is { } f && c.ValidUntil is { } u && f > u) throw new GdsException("VALIDATION", "Invalid date range");
        if (c.Description.Length > 200) throw new GdsException("VALIDATION", "Description must be at most 200 characters");
    }

    public static void Map(RouteGroupBuilder g)
    {
        // Agent Settings screen data: legacy /accounts/channels agents (users order, terms spread) + reconciliation config.
        g.MapGet("/accounts/agent-settings", async (GdsDbContext db) =>
        {
            var agents = (await db.Users.AsNoTracking().Where(u => u.Role == "agent").OrderBy(u => u.Id).ToListAsync()).Select(AgentRow).ToList();
            var configs = (await db.OtaSettlementConfigs.AsNoTracking().OrderBy(c => c.SortOrder).ThenBy(c => c.Id).ToListAsync()).Select(ConfigRow).ToList();
            return Results.Ok(new { agents, configs });
        }).RequireAuthorization(Policies.Accounts);

        // Legacy PUT /accounts/channels/agents: upsert agent financial terms; a new phone creates the agent login (no password until invited).
        g.MapPut("/accounts/channels/agents", async ([FromBody] Dictionary<string, JsonElement> b, GdsDbContext db, HttpContext h) =>
        {
            var phone = (Str(b, "phone") ?? "").Trim();
            if (!Regex.IsMatch(phone, @"^\d{10}$")) throw new GdsException("VALIDATION", "Agent phone must be 10 digits");
            var name = (Str(b, "name") ?? "").Trim();
            if (name.Length == 0) throw new GdsException("VALIDATION", "Agent name required");
            if (name.Length > 120) throw new GdsException("VALIDATION", "Agent name is too long");
            var pct = Num(b, "commission_pct") ?? 0;
            if (pct is < 0 or > 100) throw new GdsException("VALIDATION", "Commission must be 0–100%");
            foreach (var k in new[] { "balance", "credit_limit", "settlement_cycle_days", "tax_on_fare_percent", "tds_percent", "gst_on_commission_percent", "match_tolerance" })
                if (Num(b, k) < 0) throw new GdsException("VALIDATION", $"{k.Replace('_', ' ')} cannot be negative");
            var terms = new JsonObject
            {
                ["balance"] = Num(b, "balance") ?? 0, ["settlement_cycle_days"] = Num(b, "settlement_cycle_days") ?? 7,
                ["commission_base"] = Str(b, "commission_base") == "fare_plus_gst" ? "fare_plus_gst" : "fare_only",
                ["settlement_mode"] = Str(b, "settlement_mode") is "DOJ" or "DOB" or "weekly" ? Str(b, "settlement_mode") : "DOJ",
                ["tax_on_fare_percent"] = Num(b, "tax_on_fare_percent") ?? 0, ["tds_percent"] = Num(b, "tds_percent") ?? 0,
                ["gst_on_commission_percent"] = Num(b, "gst_on_commission_percent") ?? 18, ["match_tolerance"] = Num(b, "match_tolerance") ?? 1,
                ["independent_commission"] = Bool(b, "independent_commission") ?? false,
            };
            var status = Bool(b, "is_active") == false ? "INACTIVE" : "ACTIVE";
            var u = await db.Users.FirstOrDefaultAsync(x => x.Phone == phone);
            if (u is not null && u.Role != "agent") throw new GdsException("CONFLICT", "This phone belongs to a non-agent user", 409);
            if (u is null)
            {
                u = new AppUser { TenantId = db.CurrentTenantId, Phone = phone, Role = "agent", CreatedAt = DateTime.UtcNow };
                db.Users.Add(u);
            }
            u.Name = name; u.CommissionPct = pct; u.CreditLimit = Num(b, "credit_limit") ?? 0; u.Status = status; u.AgentTermsJson = terms.ToJsonString();
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = Actor(h), Action = "AGENT_TERMS_SET", Entity = "user", EntityId = phone, DataJson = JsonSerializer.Serialize(new { commission_pct = pct, status }), At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            return Results.Ok(AgentRow(u));
        }).RequireAuthorization(Policies.Accounts);

        g.MapGet("/reconciliation/config", async (GdsDbContext db) =>
            Results.Ok((await db.OtaSettlementConfigs.AsNoTracking().OrderBy(c => c.SortOrder).ThenBy(c => c.Id).ToListAsync()).Select(ConfigRow)))
            .RequireAuthorization(Policies.Accounts);

        // Legacy PUT /reconciliation/config replaces the whole list (add / edit / toggle / delete all post the full array).
        g.MapPut("/reconciliation/config", async ([FromBody] List<Dictionary<string, JsonElement>> list, GdsDbContext db, HttpContext h) =>
        {
            if (list.Count > 50) throw new GdsException("VALIDATION", "Too many OTA configurations");
            var next = new List<OtaSettlementConfig>();
            foreach (var (b, i) in list.Select((b, i) => (b, i)))
            {
                var slug = (Str(b, "ota_slug") ?? "").Trim().ToLowerInvariant();
                if (!Regex.IsMatch(slug, "^[a-z0-9_-]{2,30}$")) throw new GdsException("VALIDATION", "OTA code must be 2-30 letters, digits, - or _");
                if (next.Any(x => x.OtaSlug == slug)) throw new GdsException("VALIDATION", "OTA exists");
                var com = Num(b, "commission_percent") ?? 0;
                if (com is < 0 or > 100) throw new GdsException("VALIDATION", "Invalid commission");
                foreach (var k in new[] { "tds_percent", "gst_on_commission_percent", "tax_on_fare_percent", "settlement_cycle_days", "match_tolerance" })
                    if (Num(b, k) < 0) throw new GdsException("VALIDATION", $"{k.Replace('_', ' ')} cannot be negative");
                next.Add(new OtaSettlementConfig
                {
                    TenantId = db.CurrentTenantId, OtaSlug = slug, DisplayName = (Str(b, "ota_display_name") ?? slug).Trim(), CommissionPercent = com,
                    CommissionBase = Str(b, "commission_base") == "fare_plus_gst" ? "fare_plus_gst" : "fare_only", TdsPercent = Num(b, "tds_percent") ?? 0,
                    GstOnCommissionPercent = Num(b, "gst_on_commission_percent") ?? 18, TaxOnFarePercent = Num(b, "tax_on_fare_percent") ?? 0,
                    SettlementMode = Str(b, "settlement_mode") == "DOB" ? "DOB" : "DOJ", SettlementCycleDays = (int)(Num(b, "settlement_cycle_days") ?? 7),
                    TdsSection = Str(b, "tds_section"), MatchTolerance = Num(b, "match_tolerance"), TaxReceivableFromOta = Bool(b, "tax_receivable_from_ota") ?? false,
                    CommissionKeptOnPassengerCancel = Bool(b, "commission_kept_on_passenger_cancel") ?? false, IsActive = Bool(b, "is_active") ?? true, SortOrder = i,
                });
            }
            await using var tx = await db.Database.BeginTransactionAsync();
            db.OtaSettlementConfigs.RemoveRange(await db.OtaSettlementConfigs.ToListAsync());
            await db.SaveChangesAsync();
            db.OtaSettlementConfigs.AddRange(next);
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = Actor(h), Action = "OTA_CONFIG_SET", Entity = "reconciliation_config", EntityId = "all", DataJson = JsonSerializer.Serialize(next.Select(x => new { x.OtaSlug, x.CommissionPercent, x.IsActive })), At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(next.Select(ConfigRow));
        }).RequireAuthorization(Policies.Accounts);

        // ---------- Loyalty coupons ----------
        g.MapGet("/coupons", async (GdsDbContext db) =>
        {
            var since = DateTime.UtcNow.AddDays(-30);
            var red = await db.CouponRedemptions.AsNoTracking().ToListAsync();
            var rows = (await db.Coupons.AsNoTracking().OrderBy(c => c.Id).ToListAsync()).Select(c => CouponRow(c, red, since)).ToList();
            return Results.Ok(new { coupons = rows });
        }).RequireAuthorization(Policies.Accounts);

        g.MapPost("/coupons", async ([FromBody] Dictionary<string, JsonElement> b, GdsDbContext db, HttpContext h) =>
        {
            var code = (Str(b, "code") ?? "").Trim().ToUpperInvariant();
            if (!Regex.IsMatch(code, "^[A-Z0-9]{3,20}$")) throw new GdsException("VALIDATION", "Code must be 3-20 letters/digits");
            if (await db.Coupons.AnyAsync(c => c.Code == code)) throw new GdsException("CONFLICT", "Code exists", 409);
            var c = new Coupon { TenantId = db.CurrentTenantId, Code = code, CreatedAt = DateTime.UtcNow, Channels = [] };
            ApplyCoupon(c, b);
            db.Coupons.Add(c);
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = Actor(h), Action = "COUPON_CREATE", Entity = "coupon", EntityId = code, DataJson = JsonSerializer.Serialize(b), At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            return Results.Ok(CouponRow(c, [], DateTime.UtcNow));
        }).RequireAuthorization(Policies.IntegrationWrite);

        g.MapPut("/coupons/{id:long}", async (long id, [FromBody] Dictionary<string, JsonElement> b, GdsDbContext db, HttpContext h) =>
        {
            var c = await db.Coupons.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "Coupon not found", 404);
            b.Remove("code"); // codes are immutable (legacy strips it too)
            ApplyCoupon(c, b);
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = Actor(h), Action = "COUPON_UPDATE", Entity = "coupon", EntityId = c.Code, DataJson = JsonSerializer.Serialize(b), At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            var red = await db.CouponRedemptions.AsNoTracking().Where(r => r.Code == c.Code).ToListAsync();
            return Results.Ok(CouponRow(c, red, DateTime.UtcNow.AddDays(-30)));
        }).RequireAuthorization(Policies.IntegrationWrite);
    }
}
