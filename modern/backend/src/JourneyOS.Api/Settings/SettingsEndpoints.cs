using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using static JourneyOS.Api.Settings.LegacyIam;
using static JourneyOS.Api.Settings.TeamAccessEndpoints;

namespace JourneyOS.Api.Settings;

/// <summary>
/// Settings menu (everything except Team &amp; access). Ports of legacy server/api/configuration-v30.js (+ v31 schema),
/// about-v32.js, settings-complete.js (branding, WhatsApp templates, sessions), whatsapp-v33.js (Meta Embedded Signup),
/// loyalty-v34.js and switch-user-v34.js. Legacy <c>db.meta(key)</c> values live in <see cref="TenantDocument"/> rows
/// and legacy collections speed_dials / notification_subscriptions / notification_delivery_log are documents holding arrays.
/// Paths, validation messages and JSON shapes match legacy.
/// </summary>
public static class SettingsEndpoints
{
    private static IResult J(JsonNode n) => Results.Text(n.ToJsonString(), "application/json");
    private static JsonNode V(object? o) => JsonSerializer.SerializeToNode(o)!;
    private static string Now() => Iso(DateTime.UtcNow)!;
    private static bool Plain(JsonNode? n) => n is JsonObject;
    private static JsonValueKind K(JsonNode? n) => n switch { null => JsonValueKind.Undefined, JsonValue v => v.GetValueKind(), JsonArray => JsonValueKind.Array, _ => JsonValueKind.Object };
    private static string Str(JsonNode? n) => n is JsonValue v && v.GetValueKind() == JsonValueKind.String ? v.GetValue<string>() : n is null || K(n) == JsonValueKind.Null ? "" : n.ToJsonString();
    private static string Txt(JsonNode? v, int len = 200) { var s = Str(v).Trim(); return s.Length > len ? s[..len] : s; }
    private static void SettingsAudit(GdsDbContext db, Actor a, string entity, string id, object? data) =>
        db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = a.Name, Action = "settings", Entity = entity, EntityId = id, DataJson = data is null ? null : JsonSerializer.Serialize(data), At = DateTime.UtcNow });

    private static async Task<JsonObject> Obj(GdsDbContext db, string key) => await Doc(db, key) as JsonObject ?? new JsonObject();
    private static async Task<JsonArray> Arr(GdsDbContext db, string key) => await Doc(db, key) as JsonArray ?? new JsonArray();
    private static long NextId(JsonArray a) => a.OfType<JsonObject>().Select(x => (long?)Number(x["id"]) ?? 0).DefaultIfEmpty(0).Max() + 1;
    private static JsonObject? ById(JsonArray a, string id) => a.OfType<JsonObject>().FirstOrDefault(x => Str(x["id"]) == id);

    // ======================================================== configuration v30 / v31
    private static readonly JsonObject DefaultColors = new()
    {
        ["male"] = "#458bff", ["female"] = "#f04b9d", ["not_given"] = "#df393f", ["branch"] = "#8552f6", ["mine"] = "#0aaac0", ["my_branch"] = "#79b71d",
        ["agent"] = "#e2a51e", ["online_otas"] = "#9aadc3", ["website"] = "#a7a9c5", ["other"] = "#b8c5d4",
    };
    private static JsonObject Base() => new()
    {
        ["business"] = new JsonObject { ["operator_name"] = "", ["support_email"] = "", ["gst_receivable"] = false, ["gst_number"] = "", ["gst_registration_name"] = "" },
        ["website"] = new JsonObject
        {
            ["tagline"] = "", ["company_legal_name"] = "", ["address_lines"] = "", ["email"] = "", ["helpline"] = "", ["whatsapp_number"] = "", ["business_hours"] = "", ["copyright_line"] = "", ["booking_search_url"] = "",
            ["boarding_window_minutes"] = 30, ["refund_processing_days"] = 7, ["carry_on_kg"] = 7, ["check_in_kg"] = 15, ["baggage_liability_inr"] = 2000, ["child_free_age"] = 5, ["unaccompanied_minor_age"] = 12,
            ["jurisdiction_city"] = "", ["jurisdiction_state"] = "", ["grievance_officer_name"] = "", ["grievance_designation"] = "",
        },
        ["communications"] = new JsonObject
        {
            ["cloud_calling"] = false, ["passenger_masking"] = false, ["direct_to_vehicle"] = false, ["call_individual_drivers"] = false, ["savetrip_line"] = "", ["whatsapp_sender"] = "", ["support_number"] = "",
            ["published_office_numbers"] = new JsonArray(), ["escalation_contacts"] = new JsonArray(), ["ring_order"] = "share", ["speed_dial_during_calls"] = false, ["dial_bus_last4"] = false,
            ["city_contacts"] = new JsonArray(), ["office_extra"] = new JsonArray(), ["crew_extra"] = new JsonArray(),
        },
        ["notifications"] = new JsonObject
        {
            ["bus_live_status"] = false, ["boarding_point_cutoff"] = 45, ["pre_boarding_minutes"] = 360, ["pre_boarding_based_on"] = "boarding_point", ["checkin_reminder_minutes"] = 45,
            ["rating_request_minutes"] = 120, ["builtin_crew_push"] = true, ["builtin_office_push"] = true,
        },
        ["pricing"] = new JsonObject { ["dynamic_pricing_enabled"] = true, ["sarathi_ai_assistant_enabled"] = true, ["manual_pair_fare_hold_hours"] = 3 },
        ["office"] = new JsonObject { ["default_hold"] = "until_departure", ["max_hold"] = "until_departure" },
        ["vehicle"] = new JsonObject
        {
            ["enabled"] = true, ["fuel_drop_threshold_liters"] = 10, ["fuel_window_minutes"] = 20, ["fuel_max_odometer_km"] = 1.0, ["fuel_max_engine_hours"] = 0.1, ["overspeed_speed_limit_kmh"] = 90,
            ["overspeed_consecutive_readings"] = 2, ["idling_duration_minutes"] = 45, ["idling_max_odometer_km"] = 1, ["offline_threshold_minutes"] = 60, ["alert_recipients"] = new JsonArray(),
        },
        ["expenses"] = new JsonObject { ["diesel_cost_per_litre"] = null },
        ["seats"] = new JsonObject { ["fill_seats_by"] = "gender", ["outer_ring_by"] = "booking_channel", ["ring_channels"] = new JsonArray("branch", "mine", "my_branch", "agent"), ["colors"] = DefaultColors.DeepClone() },
        ["monitoring"] = new JsonObject
        {
            ["enabled"] = true, ["monitor_window_hours"] = 12, ["baseline_ttl_hours"] = 72, ["alert_cooldown_minutes"] = 60, ["move_distance_km"] = 1, ["geofence_radius_meters"] = 500,
            ["move_speed_kmh"] = 20, ["engine_on_minutes"] = 30, ["engine_idle_speed_kmh"] = 5, ["fuel_drop_liters"] = 1, ["fuel_drop_percent"] = 5,
        },
        ["whatsapp"] = new JsonObject { ["enabled"] = true, ["recipients"] = new JsonArray() },
        ["bot"] = new JsonObject
        {
            ["enabled"] = true, ["respond_to_user_types"] = new JsonArray("passenger"), ["max_responses_per_passenger"] = 10, ["response_delay_seconds"] = 1,
            ["escalation_keywords"] = new JsonArray("complaint", "refund", "cancel booking", "speak to manager", "urgent"), ["free_metro_ticket_enabled"] = true, ["metro_exchange_point"] = "", ["metro_ticket_instructions"] = "",
        },
    };
    private static readonly JsonNode[] Hold = ["until_departure", 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 720, 1440];
    private static readonly string[] Channels = ["branch", "mine", "my_branch", "agent", "online_otas", "website", "other"];
    private static readonly string[] UserTypes = ["passenger", "driver", "agent", "staff", "all"];

    public static async Task<JsonObject> ConfigAll(GdsDbContext db)
    {
        var current = await Obj(db, "config_v30"); var op = await Obj(db, "operator"); var result = Base();
        foreach (var (k, v) in result.ToList())
            if (current[k] is JsonObject c) foreach (var (f, x) in c) ((JsonObject)v!)[f] = x?.DeepClone();
        var biz = (JsonObject)result["business"]!; var web = (JsonObject)result["website"]!;
        foreach (var k in new[] { "operator_name", "support_email" })
            if (Str(op[k]).Length > 0 && Str(biz[k]).Length == 0) biz[k] = op[k]!.DeepClone();
        if (Str(op["tagline"]).Length > 0 && Str(web["tagline"]).Length == 0) web["tagline"] = op["tagline"]!.DeepClone();
        if (Str(op["helpline_number"]).Length > 0 && Str(web["helpline"]).Length == 0) web["helpline"] = op["helpline_number"]!.DeepClone();
        return result;
    }

    // v30 helpers (coercing like JS Number()/String())
    private static JsonNode Int30(JsonNode? v, string key, double max)
    {
        var n = K(v) == JsonValueKind.Null ? 0 : Number(v) ?? double.NaN;
        if (K(v) is JsonValueKind.Array or JsonValueKind.Object) n = double.NaN;
        if (!double.IsFinite(n) || n < 0 || n > max || n % 1 != 0) throw Fail("Invalid " + key);
        return (long)n;
    }
    private static string Str30(JsonNode? v, string key, int max = 150)
    {
        if (K(v) != JsonValueKind.String || v!.GetValue<string>().Length > max) throw Fail("Invalid " + key);
        return v.GetValue<string>().Trim();
    }
    private static string Phone30(JsonNode? v)
    {
        var s = Regex.Replace(Str(v), @"[\s()-]", "");
        if (!Regex.IsMatch(s, @"^\+?[0-9]{7,15}$")) throw Fail("Enter a valid phone number");
        return s;
    }
    private static JsonNode Bool(JsonNode? v, string key) => K(v) is JsonValueKind.True or JsonValueKind.False ? v!.GetValue<bool>() : throw Fail("Invalid " + key);
    private static JsonArray CleanArray(JsonNode? v, string key, int count = 30)
    {
        if (v is not JsonArray a || a.Count > count) throw Fail("Invalid " + key);
        return new JsonArray(a.Select(Phone30).Distinct().Select(x => (JsonNode)x).ToArray());
    }
    private static JsonArray CityContacts(JsonNode? v)
    {
        if (v is not JsonArray a || a.Count > 45) throw Fail("Invalid city contacts");
        var names = new HashSet<string>(); var o = new JsonArray();
        foreach (var x in a)
        {
            if (x is not JsonObject c) throw Fail("Invalid city contact");
            var city = Str30(c["city"], "city", 90);
            if (city.Length == 0 || !names.Add(city.ToLowerInvariant())) throw Fail("Duplicate or empty city");
            o.Add(new JsonObject { ["city"] = city, ["phones"] = CleanArray(c["phones"] ?? new JsonArray(), "city numbers", 20) });
        }
        return o;
    }
    private static string Email30(JsonNode? v, string key, string label) { var s = Str30(v, key, 180); if (s.Length > 0 && !Regex.IsMatch(s, @"^[^\s@]+@[^\s@]+\.[^\s@]+$")) throw Fail("Invalid " + label); return s; }

    // v31 helpers (strict types)
    private static JsonNode Int31(JsonNode? v, string name, double max, double min = 0)
    {
        if (K(v) != JsonValueKind.Number || v!.GetValue<double>() is var d && (d % 1 != 0 || d < min || d > max || Math.Abs(d) > 9007199254740991))
            throw Fail(name + " must be a whole number between " + min + " and " + max);
        return (long)v.GetValue<double>();
    }
    private static JsonNode Dec31(JsonNode? v, string name, double max, double min = 0)
    {
        if (K(v) != JsonValueKind.Number || v!.GetValue<double>() is var d && (!double.IsFinite(d) || d < min || d > max))
            throw Fail(name + " must be a number between " + min + " and " + max);
        var r = Math.Round(v.GetValue<double>() * 10000, MidpointRounding.AwayFromZero) / 10000;
        return r % 1 == 0 ? JsonValue.Create((long)r) : JsonValue.Create(r);
    }
    private static JsonNode Choice(JsonNode? v, string name, IEnumerable<string> options) => K(v) == JsonValueKind.String && options.Contains(v!.GetValue<string>()) ? v.GetValue<string>() : throw Fail("Invalid " + name);
    private static string Str31(JsonNode? v, string name, int max = 160)
    {
        if (K(v) != JsonValueKind.String || v!.GetValue<string>().Length > max || Regex.IsMatch(v.GetValue<string>(), "[\u0000-\u0008\u000b-\u001f]")) throw Fail("Invalid " + name);
        return v.GetValue<string>().Trim();
    }
    private static JsonArray List31(JsonNode? v, string name, int max, Func<JsonNode?, string> parse)
    {
        if (v is not JsonArray a || a.Count > max) throw Fail("Invalid " + name);
        var o = a.Select(parse).ToList();
        if (o.Select(x => x.ToLowerInvariant()).Distinct().Count() != o.Count) throw Fail("Duplicate " + name);
        return new JsonArray(o.Select(x => (JsonNode)x).ToArray());
    }
    private static string Phone31(JsonNode? v)
    {
        var n = Regex.Replace(Str31(v, "phone number", 25), @"[\s()+-]", "");
        if (!Regex.IsMatch(n, "^[0-9]{10,15}$")) throw Fail("Phone number must contain 10 to 15 digits");
        return n;
    }
    private static JsonNode HoldValue(JsonNode? v)
    {
        if (K(v) == JsonValueKind.String && v!.GetValue<string>() is var s && s != "until_departure" && Regex.IsMatch(s, @"^\d+$")) v = JsonValue.Create(double.Parse(s, CultureInfo.InvariantCulture));
        var hit = Hold.FirstOrDefault(h => K(v) == K(h) && (K(h) == JsonValueKind.String ? Str(h) == Str(v) : Number(h) == Number(v)));
        return hit?.DeepClone() ?? throw Fail("Invalid seat hold");
    }
    private static JsonObject Colors(JsonNode? v)
    {
        if (v is not JsonObject o || o.Count > DefaultColors.Count) throw Fail("Invalid seat legend colours");
        var r = (JsonObject)DefaultColors.DeepClone();
        foreach (var (k, x) in o)
        {
            if (!DefaultColors.ContainsKey(k) || K(x) != JsonValueKind.String || !Regex.IsMatch(x!.GetValue<string>(), "^#[0-9a-fA-F]{6}$")) throw Fail("Invalid colour for " + k);
            r[k] = x.GetValue<string>().ToLowerInvariant();
        }
        return r;
    }

    private static readonly Dictionary<string, Dictionary<string, Func<JsonNode?, JsonNode?>>> Rules = new()
    {
        ["business"] = new()
        {
            ["operator_name"] = v => Str30(v, "operator name", 150), ["support_email"] = v => Email30(v, "support email", "support email"),
            ["gst_receivable"] = v => K(v) is JsonValueKind.True or JsonValueKind.False ? v!.GetValue<bool>() : throw Fail("Invalid GST switch"),
            ["gst_number"] = v => { var s = Str30(v, "GST number", 15).ToUpperInvariant(); if (s.Length > 0 && !Regex.IsMatch(s, "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")) throw Fail("Invalid GSTIN"); return s; },
            ["gst_registration_name"] = v => Str30(v, "GST registration name", 170),
        },
        ["website"] = new()
        {
            ["tagline"] = v => Str30(v, "tagline", 180), ["company_legal_name"] = v => Str30(v, "company legal name", 170), ["address_lines"] = v => Str30(v, "address lines", 1200),
            ["email"] = v => Email30(v, "email", "email"), ["helpline"] = v => Str30(v, "helpline", 120),
            ["whatsapp_number"] = v => K(v) is JsonValueKind.String or JsonValueKind.Number && Str(v).Length > 0 && Str(v) != "0" ? Phone30(v) : "",
            ["business_hours"] = v => Str30(v, "business hours", 150), ["copyright_line"] = v => Str30(v, "copyright line", 220),
            ["booking_search_url"] = v =>
            {
                if (K(v) == JsonValueKind.String && v!.GetValue<string>() == "") return "";
                if (K(v) != JsonValueKind.String) throw Fail("Invalid passenger booking search URL");
                if (!Uri.TryCreate(v!.GetValue<string>().Trim(), UriKind.Absolute, out var u) || u.Scheme != "https" || u.UserInfo.Length > 0 || u.Fragment.Length > 0 || v.GetValue<string>().Length > 500)
                    throw Fail("Passenger booking search URL must be an https URL without credentials or fragments");
                return u.ToString();
            },
            ["boarding_window_minutes"] = v => Int30(v, "boarding window", 1440), ["refund_processing_days"] = v => Int30(v, "refund days", 365),
            ["carry_on_kg"] = v => Int30(v, "carry-on baggage", 250), ["check_in_kg"] = v => Int30(v, "check-in baggage", 250),
            ["baggage_liability_inr"] = v => Int30(v, "baggage liability cap", 10000000), ["child_free_age"] = v => Int30(v, "child free age", 21),
            ["unaccompanied_minor_age"] = v => Int30(v, "minor age", 21), ["jurisdiction_city"] = v => Str30(v, "jurisdiction city", 100),
            ["jurisdiction_state"] = v => Str30(v, "jurisdiction state", 100), ["grievance_officer_name"] = v => Str30(v, "officer name", 140),
            ["grievance_designation"] = v => Str30(v, "designation", 140),
        },
        ["communications"] = new()
        {
            ["cloud_calling"] = v => Bool(v, "cloud calling"), ["passenger_masking"] = v => Bool(v, "passenger masking"), ["direct_to_vehicle"] = v => Bool(v, "direct to vehicle"),
            ["call_individual_drivers"] = v => Bool(v, "call individual drivers"),
            ["savetrip_line"] = _ => throw Fail("Managed calling line is configured by the connected provider"),
            ["whatsapp_sender"] = _ => throw Fail("Managed WhatsApp sender is configured by the connected provider"),
            ["support_number"] = v => Str30(v, "support number", 60), ["published_office_numbers"] = v => CleanArray(v, "office numbers"),
            ["escalation_contacts"] = v => CleanArray(v, "escalation contacts"),
            ["ring_order"] = v => Str(v) is "share" or "sequential" && K(v) == JsonValueKind.String ? Str(v) : throw Fail("Invalid ring order"),
            ["speed_dial_during_calls"] = v => Bool(v, "speed dial during calls"), ["dial_bus_last4"] = v => Bool(v, "last four digits"),
            ["city_contacts"] = CityContacts, ["office_extra"] = v => CleanArray(v, "office team extras"), ["crew_extra"] = v => CleanArray(v, "crew extras"),
        },
        ["notifications"] = new()
        {
            ["bus_live_status"] = v => Bool(v, "bus live status"), ["boarding_point_cutoff"] = v => Int30(v, "boarding change cutoff", 1440),
            ["pre_boarding_minutes"] = v => Int30(v, "pre-boarding minutes", 43200),
            ["pre_boarding_based_on"] = v => Str(v) is "boarding_point" or "departure" && K(v) == JsonValueKind.String ? Str(v) : throw Fail("Invalid pre-boarding reference"),
            ["checkin_reminder_minutes"] = v => Int30(v, "check-in reminder", 43200), ["rating_request_minutes"] = v => Int30(v, "rating request", 43200),
            ["builtin_crew_push"] = v => Bool(v, "crew push"), ["builtin_office_push"] = v => Bool(v, "office push"),
        },
        ["pricing"] = new()
        {
            ["dynamic_pricing_enabled"] = v => B31(v, "Dynamic Pricing"), ["sarathi_ai_assistant_enabled"] = v => B31(v, "Sarathi assistant"),
            ["manual_pair_fare_hold_hours"] = v => Dec31(v, "Manual pair fare hold", 720),
        },
        ["office"] = new() { ["default_hold"] = HoldValue, ["max_hold"] = HoldValue },
        ["vehicle"] = new()
        {
            ["enabled"] = v => B31(v, "Vehicle Alerts"), ["fuel_drop_threshold_liters"] = v => Dec31(v, "Fuel drop threshold", 10000),
            ["fuel_window_minutes"] = v => Int31(v, "Fuel detection window", 10080), ["fuel_max_odometer_km"] = v => Dec31(v, "Fuel odometer limit", 10000),
            ["fuel_max_engine_hours"] = v => Dec31(v, "Maximum engine hours", 240), ["overspeed_speed_limit_kmh"] = v => Dec31(v, "Overspeed threshold", 250),
            ["overspeed_consecutive_readings"] = v => Int31(v, "Consecutive overspeed readings", 100, 1), ["idling_duration_minutes"] = v => Int31(v, "Idling duration", 1440),
            ["idling_max_odometer_km"] = v => Dec31(v, "Idling maximum odometer", 1000), ["offline_threshold_minutes"] = v => Int31(v, "Offline threshold", 10080),
            ["alert_recipients"] = v => List31(v, "vehicle recipients", 30, Phone31),
        },
        ["expenses"] = new() { ["diesel_cost_per_litre"] = v => K(v) == JsonValueKind.Null || (K(v) == JsonValueKind.String && Str(v) == "") ? null : Dec31(v, "Diesel cost", 100000) },
        ["seats"] = new()
        {
            ["fill_seats_by"] = v => Choice(v, "seat fill mode", ["gender", "booking_channel", "none"]), ["outer_ring_by"] = v => Choice(v, "seat ring mode", ["booking_channel", "none"]),
            ["ring_channels"] = v => List31(v, "seat ring channels", Channels.Length, x => Str(Choice(x, "booking channel", Channels))), ["colors"] = Colors,
        },
        ["monitoring"] = new()
        {
            ["enabled"] = v => B31(v, "Post-Trip Monitoring"), ["monitor_window_hours"] = v => Dec31(v, "Monitor window", 720), ["baseline_ttl_hours"] = v => Dec31(v, "Baseline TTL", 8760),
            ["alert_cooldown_minutes"] = v => Int31(v, "Alert cooldown", 10080), ["move_distance_km"] = v => Dec31(v, "Move distance", 10000),
            ["geofence_radius_meters"] = v => Dec31(v, "Geofence radius", 100000), ["move_speed_kmh"] = v => Dec31(v, "Move speed", 250),
            ["engine_on_minutes"] = v => Int31(v, "Engine on", 10080), ["engine_idle_speed_kmh"] = v => Dec31(v, "Engine idle speed", 100),
            ["fuel_drop_liters"] = v => Dec31(v, "Fuel drop liters", 10000), ["fuel_drop_percent"] = v => Dec31(v, "Fuel drop percent", 100),
        },
        ["whatsapp"] = new() { ["enabled"] = v => B31(v, "WhatsApp Operational Alerts"), ["recipients"] = v => List31(v, "WhatsApp alert recipients", 30, Phone31) },
        ["bot"] = new()
        {
            ["enabled"] = v => B31(v, "AI Bot"), ["respond_to_user_types"] = v => List31(v, "user types", UserTypes.Length, x => Str(Choice(x, "user type", UserTypes))),
            ["max_responses_per_passenger"] = v => Int31(v, "Maximum responses", 1000), ["response_delay_seconds"] = v => Dec31(v, "Response delay", 120),
            ["escalation_keywords"] = v => List31(v, "escalation keywords", 40, x => { var s = Str31(x, "keyword", 90).ToLowerInvariant(); if (s.Length == 0) throw Fail("Escalation keyword cannot be empty"); return s; }),
            ["free_metro_ticket_enabled"] = v => B31(v, "Free Metro Ticket"), ["metro_exchange_point"] = v => Str31(v, "Metro exchange point", 200),
            ["metro_ticket_instructions"] = v => Str31(v, "Metro ticket instructions", 2000),
        },
    };
    private static JsonNode B31(JsonNode? v, string name) => K(v) is JsonValueKind.True or JsonValueKind.False ? v!.GetValue<bool>() : throw Fail(name + " must be true or false");

    private static async Task<JsonObject> UpdateSection(GdsDbContext db, Actor a, string section, JsonNode? payload)
    {
        if (!Rules.TryGetValue(section, out var rules) || payload is not JsonObject p) throw Fail("Invalid section");
        if (p.Any(kv => !rules.ContainsKey(kv.Key))) throw Fail("Unknown setting field");
        var patch = new JsonObject();
        foreach (var (k, v) in p) patch[k] = rules[k](v);
        var all = await ConfigAll(db); var merged = (JsonObject)all[section]!.DeepClone();
        foreach (var (k, v) in patch) merged[k] = v?.DeepClone();
        if (section == "office")
        {
            double Rank(JsonNode? x) => Str(x) == "until_departure" ? double.PositiveInfinity : Number(x) ?? 0;
            if (Rank(merged["default_hold"]) > Rank(merged["max_hold"])) throw Fail("Default hold cannot exceed maximum hold");
        }
        if (section == "bot" && merged["respond_to_user_types"] is JsonArray ut && ut.Any(x => Str(x) == "all") && ut.Count != 1)
            throw Fail("All user types cannot be combined with individual types");
        var store = await Obj(db, "config_v30"); store[section] = merged;
        await SetDoc(db, "config_v30", store);
        if (section is "business" or "website")
        {
            var op = await Obj(db, "operator"); var changed = false;
            foreach (var (from, to) in section == "business" ? new[] { ("operator_name", "operator_name"), ("support_email", "support_email") } : [("tagline", "tagline"), ("helpline", "helpline_number")])
                if (patch.ContainsKey(from)) { op[to] = patch[from]?.DeepClone(); changed = true; }
            if (changed) await SetDoc(db, "operator", op);
        }
        SettingsAudit(db, a, "configuration_v30", section, new { fields = patch.Select(x => x.Key).ToArray() });
        await db.SaveChangesAsync();
        return new JsonObject { ["section"] = section, ["value"] = merged.DeepClone(), ["saved"] = true, ["delivery_connected"] = false };
    }

    private static readonly string[] Events = ["New booking", "Booking changed", "Cancellation", "Trip delayed / cancelled", "Unpaid hold expired", "Payment received", "Check-in reminder", "Live Journey", "Pre-boarding / tracking link", "Rating request", "Bus approaching"];
    private static readonly string[] Sources = ["Website", "app", "Branch", "Agent", "GDS", "Partner"];
    private static JsonObject SubClean(JsonNode? body, JsonObject? existing)
    {
        if (body is not JsonObject b) throw Fail("Invalid subscription");
        if (b.ContainsKey("enabled") && b.Count == 1 && existing is not null) { var e = (JsonObject)existing.DeepClone(); e["enabled"] = Bool(b["enabled"], "status"); return e; }
        var events = b["event_types"] is JsonArray ea ? ea.Select(Str).Distinct().ToList() : (existing?["event_types"] as JsonArray)?.Select(Str).ToList() ?? [];
        if (events.Count == 0 || events.Any(x => !Events.Contains(x))) throw Fail("Choose one or more events");
        string Pick(params JsonNode?[] xs) => xs.Select(Str).FirstOrDefault(x => x.Length > 0) ?? "";
        var channel = Pick(b["protocol"], b["channel"], existing?["channel"]); if (channel == "") channel = "whatsapp";
        if (channel is not ("whatsapp" or "push")) throw Fail("Only WhatsApp and app push are supported by this screen");
        var endpoint = Pick(b["endpoint"], existing?["endpoint"]); if (endpoint == "") endpoint = "phone";
        if (endpoint is not ("phone" or "booking_passenger" or "crew" or "office")) throw Fail("Invalid endpoint");
        var contacts = b["contacts"] as JsonArray ?? existing?["contacts"] as JsonArray ?? new JsonArray();
        if (contacts.Count > 20) throw Fail("Too many contacts");
        var normalized = contacts.Select(x =>
        {
            if (x is not JsonObject c) throw Fail("Invalid contact");
            return new JsonObject { ["phone"] = Phone30(c["phone"]), ["name"] = Str30(c["name"] is { } n && Str(n).Length > 0 ? n : "", "name", 90) };
        }).ToList();
        if (endpoint == "phone" && normalized.Count == 0) throw Fail("Add at least one mobile contact");
        var onlySources = b.ContainsKey("only_sources") ? Bool(b["only_sources"], "booking sources").GetValue<bool>() : existing?["only_sources"] is JsonValue os && os.GetValueKind() == JsonValueKind.True;
        var sourceList = b["booking_sources"] is JsonArray sa ? sa.Select(Str).Distinct().ToList() : (existing?["booking_sources"] as JsonArray)?.Select(Str).ToList() ?? [];
        if (sourceList.Any(x => !Sources.Contains(x))) throw Fail("Unknown booking source");
        if (onlySources && sourceList.Count == 0) throw Fail("Choose a booking source");
        var display = endpoint == "phone" ? string.Join(", ", normalized.Select(x => Str(x["name"]) is { Length: > 0 } n ? n : Str(x["phone"]))) : endpoint;
        if (display.Length > 120) display = display[..120];
        return new JsonObject
        {
            ["subscriber_type"] = endpoint == "phone" ? "contacts" : "group", ["subscriber_ref"] = endpoint, ["display_name"] = display,
            ["event_types"] = new JsonArray(events.Select(x => (JsonNode)x).ToArray()), ["channel"] = channel, ["endpoint"] = endpoint,
            ["contacts"] = new JsonArray(normalized.ToArray<JsonNode>()), ["only_sources"] = onlySources,
            ["booking_sources"] = new JsonArray((onlySources ? sourceList : []).Select(x => (JsonNode)x).ToArray()),
            ["quiet_hours"] = b.ContainsKey("quiet_hours") ? Bool(b["quiet_hours"], "quiet hours") : existing?["quiet_hours"] is JsonValue q && q.GetValueKind() == JsonValueKind.True,
            ["enabled"] = b.ContainsKey("enabled") ? Bool(b["enabled"], "enabled") : !(existing?["enabled"] is JsonValue en && en.GetValueKind() == JsonValueKind.False),
            ["managed_by"] = "config-v30", ["delivery_status"] = "not_connected",
        };
    }

    // ======================================================== loyalty v34
    private static readonly string[] TierNames = ["Bronze", "Gold", "Platinum", "Silver"];
    private static readonly double[] DefaultRates = [0, 75, 75, 75, 30, 0, 30];
    private static readonly Dictionary<string, double> DefaultTiers = new() { ["Bronze"] = 1, ["Gold"] = 1.2, ["Platinum"] = 1.5, ["Silver"] = 1.1 };
    private static JsonNode Num(double d) => d % 1 == 0 && Math.Abs(d) < 1e15 ? JsonValue.Create((long)d) : JsonValue.Create(d);

    public static async Task<JsonObject> LoyaltyRead(GdsDbContext db)
    {
        var m = await Obj(db, "miles");
        var general = new JsonObject
        {
            ["is_active"] = K(m["is_active"]) is JsonValueKind.True or JsonValueKind.False ? m["is_active"]!.GetValue<bool>() : true,
            ["miles_to_rupee_ratio"] = m["miles_to_rupee_ratio"]?.DeepClone() ?? 0.1, ["max_discount_percent"] = m["max_discount_percent"]?.DeepClone() ?? 30,
            ["min_redeemable_miles"] = m["min_redeemable_miles"]?.DeepClone() ?? 1000, ["min_booking_amount"] = m["min_booking_amount"]?.DeepClone() ?? 50,
        };
        var rates = (await Arr(db, "day_rates")).OfType<JsonObject>().ToList();
        var daily = new JsonArray(Enumerable.Range(0, 7).Select(i => (JsonNode)new JsonObject
        {
            ["day_of_week"] = i, ["redemption_rate"] = Num(rates.FirstOrDefault(x => Number(x["day_of_week"]) == i) is { } r && !IsNull(r["redemption_rate"]) ? Number(r["redemption_rate"]) ?? 0 : DefaultRates[i]),
        }).ToArray());
        var tierRows = (await Arr(db, "tier_multipliers")).OfType<JsonObject>().ToList();
        var tiers = new JsonArray(TierNames.Select(t => (JsonNode)new JsonObject
        {
            ["tier_name"] = t, ["multiplier"] = Num(tierRows.FirstOrDefault(x => Str(x["tier_name"]) == t) is { } r && !IsNull(r["multiplier"]) ? Number(r["multiplier"]) ?? 0 : DefaultTiers[t]),
        }).ToArray());
        var blocked = new JsonArray((await Arr(db, "blackout_dates")).Select(v => (JsonNode)(K(v) == JsonValueKind.String
            ? new JsonObject { ["date"] = Str(v), ["rate"] = 0, ["reason"] = "" }
            : new JsonObject { ["date"] = Str(v?["date"]), ["rate"] = Num(Number(v?["rate"]) ?? 0), ["reason"] = Str(v?["reason"]) })).ToArray());
        var up = await Obj(db, "loyalty_upgrade_v34");
        var upgrades = new JsonObject
        {
            ["enabled"] = up["enabled"]?.DeepClone() ?? true, ["minutes_before_boarding"] = 20,
            ["description"] = "Unsold seats in the last 20 minutes before boarding are offered to eligible loyal passengers as a free upgrade.",
            ["preference_order"] = new JsonArray("shared → single", "upper → lower berth", "back → front row"),
            ["execution_status"] = "automated_offers_with_consent_required",
            ["notice"] = "Eligible unsold-seat offers are generated within 20 minutes of boarding; seat changes require operator-recorded passenger consent and live inventory validation. Provider delivery is not implied.",
        };
        return new JsonObject { ["general"] = general, ["daily_limits"] = daily, ["tier_bonus"] = tiers, ["blocked_dates"] = blocked, ["seat_upgrades"] = upgrades };
    }
    private static double LNum(JsonNode? v, string key, double min, double max, int precision = 2)
    {
        var k = K(v);
        double n = k == JsonValueKind.Number ? v!.GetValue<double>() : k == JsonValueKind.String && Str(v).Trim() != "" && double.TryParse(Str(v), NumberStyles.Float, CultureInfo.InvariantCulture, out var p) ? p : double.NaN;
        if (k is JsonValueKind.True or JsonValueKind.False or JsonValueKind.Null || !double.IsFinite(n)) throw Fail(key + " must be a number");
        if (n < min || n > max || Math.Round(n, precision, MidpointRounding.AwayFromZero) != n) throw Fail(key + " must be " + min + "–" + max);
        return n;
    }
    private static JsonNode LoyaltyValidate(string section, JsonNode? value)
    {
        switch (section)
        {
            case "general":
                if (value is not JsonObject g) throw Fail("Invalid general settings");
                if (K(g["is_active"]) is not (JsonValueKind.True or JsonValueKind.False)) throw Fail("Enable loyalty must be true or false");
                return new JsonObject
                {
                    ["is_active"] = g["is_active"]!.GetValue<bool>(), ["miles_to_rupee_ratio"] = Num(LNum(g["miles_to_rupee_ratio"], "Value per mile", 0, 100, 4)),
                    ["max_discount_percent"] = Num(LNum(g["max_discount_percent"], "Maximum discount", 0, 100)),
                    ["min_redeemable_miles"] = Num(LNum(g["min_redeemable_miles"], "Minimum miles to use", 0, 100000000, 0)),
                    ["min_booking_amount"] = Num(LNum(g["min_booking_amount"], "Minimum booking amount", 0, 100000000)),
                };
            case "daily_limits":
            {
                if (value is not JsonArray a || a.Count != 7) throw Fail("Provide exactly seven daily limits");
                var seen = new HashSet<double>();
                return new JsonArray(a.Select(v =>
                {
                    var day = LNum(v?["day_of_week"], "Day of week", 0, 6, 0); var pct = LNum(v?["redemption_rate"], "Daily redemption limit", 0, 100);
                    if (!seen.Add(day)) throw Fail("Duplicate day of week");
                    return (day, pct);
                }).ToList().OrderBy(x => x.day).Select(x => (JsonNode)new JsonObject { ["day_of_week"] = Num(x.day), ["redemption_rate"] = Num(x.pct) }).ToArray());
            }
            case "tier_bonus":
            {
                if (value is not JsonArray a || a.Count != 4) throw Fail("Provide four loyalty tiers");
                var m = new Dictionary<string, double>();
                foreach (var v in a)
                {
                    var t = Str(v?["tier_name"]);
                    if (!TierNames.Contains(t) || m.ContainsKey(t)) throw Fail("Unknown or duplicated loyalty tier");
                    m[t] = LNum(v?["multiplier"], "Tier bonus", 0, 10, 3);
                }
                return new JsonArray(TierNames.Select(t => (JsonNode)new JsonObject { ["tier_name"] = t, ["multiplier"] = Num(m[t]) }).ToArray());
            }
            case "blocked_dates":
            {
                if (value is not JsonArray a || a.Count > 365) throw Fail("Too many blocked dates");
                var seen = new HashSet<string>();
                return new JsonArray(a.Select(v =>
                {
                    if (v is not JsonObject o) throw Fail("Invalid blocked date");
                    var date = Str(o["date"]);
                    if (!Regex.IsMatch(date, @"^\d{4}-\d{2}-\d{2}$")) throw Fail("Enter a valid YYYY-MM-DD date");
                    if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) throw Fail("Invalid calendar date");
                    if (!seen.Add(date)) throw Fail("That date is already listed");
                    var rate = LNum(o["rate"], "Blocked date rate", 0, 100);
                    var reasonRaw = IsNull(o["reason"]) ? "" : Str(o["reason"]);
                    var reason = reasonRaw.Trim(); if (reason.Length > 160) reason = reason[..160];
                    if (reasonRaw.Length > 160) throw Fail("Reason must be at most 160 characters");
                    return new JsonObject { ["date"] = date, ["rate"] = Num(rate), ["reason"] = reason };
                }).OrderBy(x => Str(x["date"]), StringComparer.Ordinal).ToArray<JsonNode>());
            }
            case "seat_upgrades":
                if (K(value?["enabled"]) is not (JsonValueKind.True or JsonValueKind.False)) throw Fail("Seat upgrade enable value must be boolean");
                return new JsonObject { ["enabled"] = value!["enabled"]!.GetValue<bool>() };
        }
        throw Fail("Unknown loyalty section", 404);
    }

    // ======================================================== switch user v34
    private static readonly Dictionary<string, int> Level = new()
    {
        ["owner"] = 100, ["admin"] = 90, ["manager"] = 80, ["branch_admin"] = 75, ["pickup_manager"] = 65, ["accountant"] = 60, ["booking_executive"] = 55,
        ["service_associate"] = 50, ["service_agent"] = 45, ["driver"] = 30, ["conductor"] = 30, ["helper"] = 25, ["agent"] = 20, ["viewer"] = 10,
    };
    private static int Lvl(AppUser u) => Level.GetValueOrDefault(RoleOf(u));
    private static bool ActiveUser(AppUser u) => u.Status == "ACTIVE" && u.DeletedAt is null && !(RoleOf(u) == "agent" && ProfileOf(u).Mode == "Offline");
    private static bool CanViewAs(AppUser? real, AppUser? target) => real is not null && target is not null && RoleOf(real) is "owner" or "admin" && ActiveUser(real) && ActiveUser(target) && real.Id != target.Id && Lvl(target) < Lvl(real);
    private static async Task<AppUser?> RealUser(GdsDbContext db, ClaimsPrincipal p) =>
        long.TryParse(p.FindFirstValue("uid"), out var uid) ? await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid) : null;

    // ======================================================== WhatsApp (Meta Embedded Signup v4)
    private sealed record MetaCfg(string AppId, string ConfigId, string Secret, byte[]? Key, bool Ready, string Graph);
    private static MetaCfg Meta(IConfiguration c)
    {
        string E(string k) => (c[k] ?? Environment.GetEnvironmentVariable(k.Replace(':', '_').ToUpperInvariant()) ?? "").Trim();
        var appId = E("Meta:AppId"); var configId = E("Meta:WhatsAppConfigId"); var secret = E("Meta:AppSecret"); var ks = E("Meta:WaEncryptionKey");
        if (appId == "") appId = (Environment.GetEnvironmentVariable("META_APP_ID") ?? "").Trim();
        if (configId == "") configId = (Environment.GetEnvironmentVariable("META_WHATSAPP_CONFIG_ID") ?? "").Trim();
        if (secret == "") secret = (Environment.GetEnvironmentVariable("META_APP_SECRET") ?? "").Trim();
        if (ks == "") ks = (Environment.GetEnvironmentVariable("GDS_WA_ENCRYPTION_KEY") ?? "").Trim();
        byte[]? key = Regex.IsMatch(ks, "^[0-9a-fA-F]{64}$") ? Convert.FromHexString(ks) : Regex.IsMatch(ks, "^[A-Za-z0-9+/]{43}=$") ? Convert.FromBase64String(ks) : null;
        if (key is { Length: not 32 }) key = null;
        var gv = Environment.GetEnvironmentVariable("META_GRAPH_API_VERSION") ?? "";
        return new MetaCfg(appId, configId, secret, key, Regex.IsMatch(appId, @"^\d{5,24}$") && Regex.IsMatch(configId, @"^\d{5,30}$") && secret.Length > 0 && key is not null,
            Regex.IsMatch(gv, @"^v\d{1,2}\.\d{1,2}$") ? gv : "v24.0");
    }
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, (long Uid, string Sid, DateTime Deadline)> Pending = new();
    private static async Task<JsonObject> PublicConnection(GdsDbContext db)
    {
        var c = await Obj(db, "wa_meta_connection");
        JsonNode? G(string k) => IsNull(c[k]) || Str(c[k]) == "" ? null : c[k]!.DeepClone();
        return new JsonObject
        {
            ["status"] = G("status") ?? "not_connected", ["business_name"] = G("business_name"), ["waba_id"] = G("waba_id"), ["phone_number_id"] = G("phone_number_id"),
            ["display_phone_number"] = G("display_phone_number"), ["connected_at"] = G("connected_at"), ["authorized_at"] = G("authorized_at"),
        };
    }
    private static async Task<AppUser> WaAdmin(GdsDbContext db, HttpContext h, Actor a)
    {
        var person = await RealUser(db, h.User);
        if (person is null || RoleOf(person) is not ("owner" or "admin")) throw Fail("An organization owner or administrator must connect WhatsApp.", 403);
        if (!a.Permissions.Contains("settings.modify")) throw Fail("Missing settings.modify permission", 403);
        return person;
    }
    private static string B64u(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private static byte[] FromB64u(string s) { s = s.Replace('-', '+').Replace('_', '/'); return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=')); }
    private static string Encrypt(string token, byte[] key)
    {
        var nonce = RandomNumberGenerator.GetBytes(12); var plain = System.Text.Encoding.UTF8.GetBytes(token); var cipher = new byte[plain.Length]; var tag = new byte[16];
        using var g = new AesGcm(key, 16); g.Encrypt(nonce, plain, cipher, tag);
        return "gcm1." + B64u(nonce) + "." + B64u(tag) + "." + B64u(cipher);
    }
    private static string Decrypt(string value, byte[] key)
    {
        var p = (value ?? "").Split('.');
        if (p.Length != 4 || p[0] != "gcm1") throw Fail("Stored WhatsApp credentials are invalid. Reconnect Meta.", 409);
        var cipher = FromB64u(p[3]); var plain = new byte[cipher.Length];
        using var g = new AesGcm(key, 16); g.Decrypt(FromB64u(p[1]), cipher, FromB64u(p[2]), plain);
        return System.Text.Encoding.UTF8.GetString(plain);
    }
    private static async Task<JsonObject> Graph(IHttpClientFactory f, MetaCfg cfg, string path, string? token = null, Dictionary<string, string>? qs = null, JsonObject? body = null, bool appCredentials = false)
    {
        var q = new Dictionary<string, string>(qs ?? []);
        if (appCredentials) { q["client_id"] = cfg.AppId; q["client_secret"] = cfg.Secret; }
        var url = "https://graph.facebook.com/" + cfg.Graph + "/" + path.TrimStart('/') + (q.Count > 0 ? "?" + string.Join("&", q.Select(kv => Uri.EscapeDataString(kv.Key) + "=" + Uri.EscapeDataString(kv.Value))) : "");
        using var req = new HttpRequestMessage(body is null ? HttpMethod.Get : HttpMethod.Post, url);
        req.Headers.Accept.ParseAdd("application/json");
        if (token is not null) req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        if (body is not null) req.Content = new StringContent(body.ToJsonString(), System.Text.Encoding.UTF8, "application/json");
        using var cts = new CancellationTokenSource(12000);
        try
        {
            using var resp = await f.CreateClient().SendAsync(req, cts.Token);
            var raw = await resp.Content.ReadAsStringAsync(cts.Token);
            JsonObject data;
            try { data = JsonNode.Parse(raw) as JsonObject ?? throw new JsonException(); } catch (JsonException) { throw Fail("Meta returned a non-JSON response", 502); }
            if (!resp.IsSuccessStatusCode || data["error"] is not null)
            {
                var code = (int)(Number(data["error"]?["code"]) ?? 0);
                if (code is 190 or 200 or 10) throw Fail("Meta authorization is missing or expired. Reconnect WhatsApp.", 403);
                throw Fail("Meta rejected this step (code " + (code != 0 ? code : (int)resp.StatusCode) + "). Check your Meta business permissions and phone registration.", 409);
            }
            return data;
        }
        catch (OperationCanceledException) { throw Fail("Meta did not respond in time. Please retry.", 504); }
        catch (HttpRequestException) { throw Fail("Unable to reach the Meta Graph API. Please retry.", 502); }
    }

    // ======================================================== mapping
    public static void Map(RouteGroupBuilder g)
    {
        // ---- configuration v30
        g.MapGet("/settings/config-v30/seat-display", async (HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "schedules.view");
            return J(new JsonObject { ["seat_legends"] = (await ConfigAll(db))["seats"]!.DeepClone() });
        });
        g.MapGet("/settings/config-v30/office-hold", async (HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "bookings.create");
            var all = await ConfigAll(db);
            return J(new JsonObject
            {
                ["enabled"] = (await Obj(db, "config_v30"))["office"] is not null, ["default_hold"] = all["office"]!["default_hold"]!.DeepClone(), ["max_hold"] = all["office"]!["max_hold"]!.DeepClone(),
                ["options"] = new JsonArray(Hold.Select(x => x.DeepClone()).ToArray()), ["note"] = "All unpaid seat holds end no later than the scheduled departure.",
            });
        });
        g.MapGet("/settings/config-v30", async (HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.view");
            var users = await db.Users.AsNoTracking().Where(u => u.DeletedAt == null).OrderBy(u => u.Id).ToListAsync();
            var visible = users.Where(u => a.Role is "owner" or "admin" or "manager" || u.Id == a.Id || (a.BranchId is not null && a.BranchId == u.BranchId));
            return J(new JsonObject
            {
                ["sections"] = await ConfigAll(db), ["dials"] = await Arr(db, "speed_dials"), ["subscriptions"] = await Arr(db, "notification_subscriptions"),
                ["users"] = new JsonArray(visible.Select(u => (JsonNode)new JsonObject { ["id"] = u.Id, ["name"] = u.Name, ["phone"] = u.Phone, ["role"] = RoleOf(u) }).ToArray()),
                ["delivery_connected"] = false, ["provider_note"] = "Cloud calls, WhatsApp and push delivery need separately configured authorized providers.",
            });
        });
        g.MapPost("/settings/config-v30/dials", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            var b = body ?? new JsonObject(); var code = Str(b["code"]).Trim(); var kind = Str(b["kind"]) is { Length: > 0 } k ? k : "number";
            if (!Regex.IsMatch(code, "^[0-9]{1,2}$")) throw Fail("Dial code must contain 1–2 digits");
            if (kind is not ("number" or "staff" or "branch")) throw Fail("Invalid dial type");
            var dials = await Arr(db, "speed_dials");
            if (dials.OfType<JsonObject>().Any(x => Str(x["code"]) == code)) throw Fail("Code already exists", 409);
            var row = new JsonObject
            {
                ["id"] = NextId(dials), ["created_at"] = Now(), ["code"] = code, ["kind"] = kind, ["phone"] = Phone30(b["phone"]),
                ["label"] = Str30(b["label"] is { } l && Str(l).Length > 0 ? l : "", "label", 90), ["is_active"] = !(K(b["is_active"]) == JsonValueKind.False),
            };
            dials.Add(row); await SetDoc(db, "speed_dials", dials);
            SettingsAudit(db, a, "speed_dial", Str(row["id"]), new { created = true }); await db.SaveChangesAsync();
            return J(row);
        });
        g.MapPut("/settings/config-v30/dials/{id}", async (string id, HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            var dials = await Arr(db, "speed_dials"); var old = ById(dials, id) ?? throw Fail("Code not found", 404);
            var b = body ?? new JsonObject();
            var code = Str(IsNull(b["code"]) ? old["code"] : b["code"]).Trim();
            if (!Regex.IsMatch(code, "^[0-9]{1,2}$")) throw Fail("Invalid dial code");
            if (dials.OfType<JsonObject>().Any(x => Str(x["code"]) == code && Str(x["id"]) != Str(old["id"]))) throw Fail("Code already exists", 409);
            var kind = Str(IsNull(b["kind"]) ? old["kind"] : b["kind"]);
            if (kind is not ("number" or "staff" or "branch")) throw Fail("Invalid dial type");
            old["code"] = code; old["kind"] = kind; old["phone"] = Phone30(IsNull(b["phone"]) ? old["phone"] : b["phone"]);
            old["label"] = Str30((IsNull(b["label"]) ? old["label"] : b["label"]) ?? "", "label", 90);
            if (b.ContainsKey("is_active")) old["is_active"] = Bool(b["is_active"], "active");
            old["updated_at"] = Now();
            await SetDoc(db, "speed_dials", dials);
            SettingsAudit(db, a, "speed_dial", id, new { edited = true }); await db.SaveChangesAsync();
            return J(old.DeepClone());
        });
        g.MapDelete("/settings/config-v30/dials/{id}", async (string id, HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            var dials = await Arr(db, "speed_dials"); var old = ById(dials, id) ?? throw Fail("Code not found", 404);
            dials.Remove(old); await SetDoc(db, "speed_dials", dials);
            SettingsAudit(db, a, "speed_dial", id, new { deleted = true }); await db.SaveChangesAsync();
            return J(new JsonObject { ["deleted"] = true });
        });
        g.MapPost("/settings/config-v30/subscriptions", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            var clean = SubClean(body, null); var subs = await Arr(db, "notification_subscriptions");
            var row = new JsonObject { ["id"] = NextId(subs), ["created_at"] = Now() };
            foreach (var (k, v) in clean) row[k] = v?.DeepClone();
            subs.Add(row); await SetDoc(db, "notification_subscriptions", subs);
            SettingsAudit(db, a, "notification_subscription", Str(row["id"]), new { created = true }); await db.SaveChangesAsync();
            return J(row.DeepClone());
        });
        g.MapPut("/settings/config-v30/subscriptions/{id}", async (string id, HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            var subs = await Arr(db, "notification_subscriptions"); var old = ById(subs, id) ?? throw Fail("Subscription not found", 404);
            var b = body ?? new JsonObject();
            if (b.ContainsKey("enabled") && b.Count == 1) old["enabled"] = Bool(b["enabled"], "enabled");
            else foreach (var (k, v) in SubClean(b, old)) old[k] = v?.DeepClone();
            old["updated_at"] = Now();
            await SetDoc(db, "notification_subscriptions", subs);
            SettingsAudit(db, a, "notification_subscription", id, b.Count == 1 && b.ContainsKey("enabled") ? new { enabled = old["enabled"]!.GetValue<bool>() } : new { updated = true });
            await db.SaveChangesAsync();
            return J(old.DeepClone());
        });
        g.MapDelete("/settings/config-v30/subscriptions/{id}", async (string id, HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            var subs = await Arr(db, "notification_subscriptions"); var old = ById(subs, id) ?? throw Fail("Subscription not found", 404);
            subs.Remove(old); await SetDoc(db, "notification_subscriptions", subs);
            SettingsAudit(db, a, "notification_subscription", id, new { deleted = true }); await db.SaveChangesAsync();
            return J(new JsonObject { ["deleted"] = true });
        });
        g.MapPost("/settings/config-v30/subscriptions/{id}/test", async (string id, HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            if (ById(await Arr(db, "notification_subscriptions"), id) is null) throw Fail("Subscription not found", 404);
            throw Fail("Delivery unavailable: no authorized WhatsApp or push provider is connected. No message was sent.", 424);
        });
        g.MapGet("/settings/config-v30/delivery-log/{pnr}", async (string pnr, HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.view");
            pnr = pnr.Trim();
            if (!Regex.IsMatch(pnr, "^[a-zA-Z0-9-]{4,35}$")) throw Fail("Enter a valid PNR");
            var rows = (await Arr(db, "notification_delivery_log")).OfType<JsonObject>().Where(x => Str(x["pnr"]) == pnr)
                .Select(x => (JsonNode)new JsonObject { ["at"] = x["at"]?.DeepClone(), ["status"] = x["status"]?.DeepClone(), ["channel"] = x["channel"]?.DeepClone(), ["event"] = x["event"]?.DeepClone() }).ToArray();
            return J(new JsonObject { ["pnr"] = pnr, ["rows"] = new JsonArray(rows), ["note"] = "Only real recorded delivery attempts are displayed. No provider delivery is currently connected." });
        });
        g.MapPut("/settings/config-v30/{section}", async (string section, HttpContext h, GdsDbContext db, JsonNode? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            return J(await UpdateSection(db, a, section, body));
        });

        // ---- about
        g.MapGet("/about/build", async (HttpContext h, GdsDbContext db, IHostEnvironment env) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.view");
            h.Response.Headers.CacheControl = "private, no-store, max-age=0"; h.Response.Headers.Pragma = "no-cache"; h.Response.Headers.Vary = "Authorization";
            return J(BuildInfo.Get(env));
        });

        // ---- branding
        g.MapGet("/settings/branding", async (HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.view");
            return J(new JsonObject
            {
                ["operator"] = await Obj(db, "operator"),
                ["branding"] = await Doc(db, "branding") ?? new JsonObject { ["color_scheme"] = "Light", ["pwa_name"] = "", ["pwa_short_name"] = "", ["assets"] = new JsonObject() },
            });
        });
        g.MapPut("/settings/branding", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            var b = body ?? new JsonObject(); var op = await Obj(db, "operator"); var prev = await Obj(db, "branding");
            JsonNode? Or(JsonNode? x, JsonNode? y) => Str(x).Length > 0 && K(x) != JsonValueKind.False ? x : y;   // JS ||
            JsonNode? Nc(JsonNode? x, JsonNode? y) => IsNull(x) ? y : x;                                           // JS ??
            var color = Txt(Or(b["brand_hex"], op["brand_hex"]), 20);
            if (!Regex.IsMatch(color, "^#[0-9a-f]{6}$", RegexOptions.IgnoreCase)) throw Fail("Brand color must be a 6-digit hex value");
            var scheme = Txt(Or(Or(b["color_scheme"], prev["color_scheme"]), "Light"), 20);
            if (scheme is not ("Light" or "Dark" or "System")) throw Fail("Invalid color scheme");
            var family = Txt(Or(Or(b["font_family"], op["font_family"]), "Poppins"), 80);
            if (family is not ("Poppins" or "Inter" or "Manrope" or "Roboto" or "System")) throw Fail("Font family is not supported");
            var updated = (JsonObject)op.DeepClone();
            updated["app_name"] = Txt(Nc(b["app_name"], op["app_name"]), 100); updated["tagline"] = Txt(Nc(b["tagline"], op["tagline"]), 180);
            updated["helpline_number"] = Txt(Nc(b["helpline_number"], op["helpline_number"]), 80); updated["support_email"] = Txt(Nc(b["support_email"], op["support_email"]), 150);
            updated["brand_hex"] = color; updated["font_family"] = family; updated["color_scheme"] = scheme;
            var next = (JsonObject)prev.DeepClone();
            next["color_scheme"] = scheme; next["pwa_name"] = Txt(Nc(b["pwa_name"], prev["pwa_name"]), 100); next["pwa_short_name"] = Txt(Nc(b["pwa_short_name"], prev["pwa_short_name"]), 30);
            next["assets"] = prev["assets"]?.DeepClone() ?? new JsonObject();
            await SetDoc(db, "operator", updated); await SetDoc(db, "branding", next);
            SettingsAudit(db, a, "branding", "branding", new { fields = new[] { "app_name", "tagline", "helpline_number", "support_email", "brand_hex", "font_family", "pwa_name", "pwa_short_name", "color_scheme" } });
            await db.SaveChangesAsync();
            return J(new JsonObject { ["operator"] = updated, ["branding"] = next });
        });
        g.MapPost("/settings/branding/assets/{asset}", async (string asset, HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            if (asset is not ("mobile_logo" or "desktop_logo" or "dark_logo" or "favicon" or "signin_background")) throw Fail("Unknown branding asset");
            var value = Str(body?["data_url"]);
            var m = Regex.Match(value, @"^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$");
            if (!m.Success) throw Fail("Use PNG, JPEG or WebP (SVG uploads are not enabled)");
            byte[] raw; try { raw = Convert.FromBase64String(m.Groups[2].Value); } catch (FormatException) { raw = []; }
            if (raw.Length < 16 || raw.Length > 1024 * 1024) throw Fail("File must be under 1 MB and non-empty");
            var png = raw.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
            var jpg = raw.AsSpan(0, 3).SequenceEqual(new byte[] { 255, 216, 255 });
            var webp = System.Text.Encoding.ASCII.GetString(raw, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(raw, 8, 4) == "WEBP";
            if (!(m.Groups[1].Value switch { "image/png" => png, "image/jpeg" => jpg, _ => webp })) throw Fail("Image content does not match its type");
            var existing = await Obj(db, "branding"); var assets = existing["assets"] as JsonObject ?? new JsonObject();
            assets[asset] = value; existing["assets"] = assets.DeepClone(); await SetDoc(db, "branding", existing);
            if (asset == "mobile_logo") { var op = await Obj(db, "operator"); op["logo_url"] = value; await SetDoc(db, "operator", op); }
            SettingsAudit(db, a, "branding_assets", asset, new { size = raw.Length }); await db.SaveChangesAsync();
            return J(new JsonObject { ["asset"] = asset, ["bytes"] = raw.Length, ["data_url"] = value });
        });
        g.MapDelete("/settings/branding/assets/{asset}", async (string asset, HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            var existing = await Obj(db, "branding"); var assets = existing["assets"] as JsonObject ?? new JsonObject();
            if (!assets.ContainsKey(asset)) return J(new JsonObject { ["success"] = true });
            assets.Remove(asset); existing["assets"] = assets.DeepClone(); await SetDoc(db, "branding", existing);
            if (asset == "mobile_logo") { var op = await Obj(db, "operator"); op["logo_url"] = ""; await SetDoc(db, "operator", op); }
            SettingsAudit(db, a, "branding_assets", asset, new { removed = true }); await db.SaveChangesAsync();
            return J(new JsonObject { ["success"] = true });
        });

        // ---- WhatsApp templates (settings-complete) + Meta onboarding (v33)
        g.MapGet("/settings/whatsapp", async (HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.view");
            return J(await Doc(db, "whatsapp_ui") ?? new JsonObject { ["display_name"] = "", ["business_number"] = "", ["status"] = "not_connected", ["templates"] = new JsonArray() });
        });
        g.MapPut("/settings/whatsapp", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            var b = body ?? new JsonObject(); var old = await Obj(db, "whatsapp_ui");
            var templates = b["templates"] is JsonArray ta
                ? new JsonArray(ta.Select(x => new JsonObject { ["name"] = Txt(x?["name"], 80), ["category"] = Txt(x?["category"], 30), ["message"] = Txt(x?["message"], 1600) })
                    .Where(x => Str(x["name"]).Length > 0 && Str(x["message"]).Length > 0).Take(50).ToArray<JsonNode>())
                : (JsonArray)(old["templates"]?.DeepClone() ?? new JsonArray());
            var next = new JsonObject
            {
                ["display_name"] = Txt(IsNull(b["display_name"]) ? old["display_name"] : b["display_name"], 100),
                ["business_number"] = Txt(IsNull(b["business_number"]) ? old["business_number"] : b["business_number"], 20), ["status"] = "not_connected", ["templates"] = templates,
            };
            await SetDoc(db, "whatsapp_ui", next);
            SettingsAudit(db, a, "whatsapp", "templates", new { count = templates.Count }); await db.SaveChangesAsync();
            var o = (JsonObject)next.DeepClone(); o["notice"] = "Templates saved locally. A verified WhatsApp Business API connection is required to send messages.";
            return J(o);
        });
        g.MapGet("/settings/whatsapp/onboarding", async (HttpContext h, GdsDbContext db, IConfiguration c) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.view");
            h.Response.Headers.CacheControl = "private, no-store"; h.Response.Headers.Vary = "Authorization";
            var cfg = Meta(c);
            return J(new JsonObject
            {
                ["enabled"] = cfg.Ready, ["app_id"] = cfg.Ready ? cfg.AppId : null, ["configuration_id"] = cfg.Ready ? cfg.ConfigId : null, ["graph_version"] = cfg.Graph,
                ["connection"] = await PublicConnection(db), ["setup_required"] = !cfg.Ready,
                ["setup_message"] = cfg.Ready ? null : "Meta Embedded Signup is not configured for this deployment. Ask your administrator to set Meta app, configuration, secret and encryption key.",
                ["provider"] = "meta-embedded-signup-v4",
            });
        });
        g.MapPost("/settings/whatsapp/onboarding/start", async (HttpContext h, GdsDbContext db, IConfiguration c) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            var person = await WaAdmin(db, h, a); var cfg = Meta(c);
            if (!cfg.Ready) throw Fail("Meta WhatsApp onboarding is not configured on this server.", 503);
            foreach (var (k, v) in Pending) if (v.Deadline < DateTime.UtcNow) Pending.TryRemove(k, out _);
            while (Pending.Count >= 100 && Pending.Keys.FirstOrDefault() is { } first) Pending.TryRemove(first, out _);
            var state = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
            Pending[state] = (person.Id, h.User.FindFirstValue("sid") ?? "", DateTime.UtcNow.AddMinutes(10));
            SettingsAudit(db, a, "whatsapp_onboarding", "start", new { flow = "embedded_signup" }); await db.SaveChangesAsync();
            return J(new JsonObject { ["state"] = state, ["app_id"] = cfg.AppId, ["configuration_id"] = cfg.ConfigId, ["graph_version"] = cfg.Graph, ["expires_in_seconds"] = 600 });
        });
        g.MapPost("/settings/whatsapp/onboarding/finish", async (HttpContext h, GdsDbContext db, IConfiguration c, IHttpClientFactory f, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            var person = await WaAdmin(db, h, a);
            var b = body ?? new JsonObject(); var flow = Str(b["state"]);
            var found = Pending.TryRemove(flow, out var attempt);
            if (!found || attempt.Deadline < DateTime.UtcNow || attempt.Uid != person.Id || attempt.Sid != (h.User.FindFirstValue("sid") ?? ""))
                throw Fail("Signup session expired. Start WhatsApp connection again.", 409);
            var code = Str(b["code"]).Trim(); var wabaId = Str(b["waba_id"]).Trim(); var numberId = Str(b["phone_number_id"]).Trim();
            bool IsId(string x) => Regex.IsMatch(x, @"^\d{5,30}$");
            if (code.Length < 8 || code.Length > 2048 || !IsId(wabaId) || !IsId(numberId)) throw Fail("Meta did not return a complete authorization code and business phone.");
            var cfg = Meta(c); if (!cfg.Ready) throw Fail("Meta WhatsApp onboarding is not configured.", 503);
            var tok = await Graph(f, cfg, "oauth/access_token", qs: new() { ["code"] = code, ["grant_type"] = "authorization_code" }, appCredentials: true);
            var token = Str(tok["access_token"]);
            if (token.Length < 20) throw Fail("Meta did not issue a valid business access token.", 409);
            var account = await Graph(f, cfg, wabaId, token, new() { ["fields"] = "id,name" });
            if (Str(account["id"]) != wabaId) throw Fail("Meta business account verification failed.", 409);
            var numbers = await Graph(f, cfg, wabaId + "/phone_numbers", token, new() { ["fields"] = "id,display_phone_number,verified_name", ["limit"] = "100" });
            var selected = (numbers["data"] as JsonArray ?? []).FirstOrDefault(x => Str(x?["id"]) == numberId) ?? throw Fail("The selected phone number is not part of the authorized WhatsApp business account.", 409);
            var previous = await Obj(db, "wa_meta_connection");
            if (Str(previous["status"]) == "connected" && Str(previous["phone_number_id"]) != numberId) throw Fail("Disconnect the existing WhatsApp number before connecting another number.", 409);
            string Cap(string s, int n) => s.Length > n ? s[..n] : s;
            await SetDoc(db, "wa_meta_connection", new JsonObject
            {
                ["status"] = "pending_registration", ["waba_id"] = wabaId, ["phone_number_id"] = numberId, ["business_name"] = Cap(Str(account["name"]), 200),
                ["display_phone_number"] = Cap(Str(selected["display_phone_number"]), 40), ["authorized_at"] = Now(), ["connected_at"] = null, ["token_encrypted"] = Encrypt(token, cfg.Key!),
            });
            SettingsAudit(db, a, "whatsapp_onboarding", "authorized", new { waba_id = wabaId, phone_number_id = numberId }); await db.SaveChangesAsync();
            return J(new JsonObject { ["connection"] = await PublicConnection(db), ["notice"] = "Meta authorization verified. Register the phone using its six-digit two-step verification PIN to finish connection." });
        });
        g.MapPost("/settings/whatsapp/onboarding/register", async (HttpContext h, GdsDbContext db, IConfiguration c, IHttpClientFactory f, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            await WaAdmin(db, h, a);
            var record = await Obj(db, "wa_meta_connection");
            if (Str(record["status"]) != "pending_registration") throw Fail("Authorize WhatsApp with Meta before registering the phone.", 409);
            var pin = Str(body?["pin"]);
            if (!Regex.IsMatch(pin, @"^\d{6}$")) throw Fail("Enter a six-digit WhatsApp registration PIN.");
            var cfg = Meta(c); if (cfg.Key is null) throw Fail("WhatsApp encryption key missing.", 503);
            var token = Decrypt(Str(record["token_encrypted"]), cfg.Key);
            var result = await Graph(f, cfg, Str(record["phone_number_id"]) + "/register", token, body: new JsonObject { ["messaging_product"] = "whatsapp", ["pin"] = pin });
            if (K(result["success"]) != JsonValueKind.True) throw Fail("Meta has not confirmed phone registration.", 409);
            record["status"] = "connected"; record["connected_at"] = Now(); await SetDoc(db, "wa_meta_connection", record);
            SettingsAudit(db, a, "whatsapp_onboarding", "registered", new { waba_id = Str(record["waba_id"]), phone_number_id = Str(record["phone_number_id"]) }); await db.SaveChangesAsync();
            return J(new JsonObject { ["connection"] = await PublicConnection(db), ["notice"] = "Meta confirmed WhatsApp Cloud API phone registration. Configure webhook subscriptions and approved message templates before sending automated messages." });
        });
        g.MapPost("/settings/whatsapp/onboarding/disconnect", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            await WaAdmin(db, h, a);
            var current = await Doc(db, "wa_meta_connection") as JsonObject;
            if (current is null || Str(current["status"]) is "not_connected" or "") return J(new JsonObject { ["connection"] = await PublicConnection(db) });
            if (Str(body?["confirm"]) != "DISCONNECT") throw Fail("Confirm WhatsApp disconnection.");
            await SetDoc(db, "wa_meta_connection", new JsonObject { ["status"] = "not_connected" });
            SettingsAudit(db, a, "whatsapp_onboarding", "disconnected", new { waba_id = Str(current["waba_id"]), phone_number_id = Str(current["phone_number_id"]) }); await db.SaveChangesAsync();
            return J(new JsonObject { ["connection"] = await PublicConnection(db), ["notice"] = "Local authorization deleted. You may also revoke partner access from your Meta Business settings." });
        });

        // ---- loyalty v34
        g.MapGet("/settings/loyalty-v34", async (HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.view");
            h.Response.Headers.CacheControl = "private, no-store";
            return J(await LoyaltyRead(db));
        });
        g.MapPut("/settings/loyalty-v34/{section}", async (string section, HttpContext h, GdsDbContext db, JsonNode? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify");
            var meta = section switch { "general" => "miles", "daily_limits" => "day_rates", "tier_bonus" => "tier_multipliers", "blocked_dates" => "blackout_dates", "seat_upgrades" => "loyalty_upgrade_v34", _ => null }
                ?? throw Fail("Unknown section", 404);
            if (!a.Permissions.Contains("offers.loyalty")) throw Fail("Loyalty management permission required", 403);
            var old = (await LoyaltyRead(db))[section]!.DeepClone();
            await SetDoc(db, meta, LoyaltyValidate(section, body?["value"]));
            var next = await LoyaltyRead(db);
            SettingsAudit(db, a, "loyalty-v34", section, new { before = old, after = next[section] }); await db.SaveChangesAsync();
            return J(new JsonObject { ["success"] = true, ["configuration"] = next });
        });

        // ---- switch user / sessions (self-service; any signed-in user)
        g.MapGet("/auth/switchable-users", async (HttpContext h, GdsDbContext db) =>
        {
            var real = await RealUser(db, h.User);
            if (real is null || RoleOf(real) is not ("owner" or "admin")) return J(new JsonArray());
            var users = await db.Users.AsNoTracking().OrderBy(u => u.Id).ToListAsync();
            return J(new JsonArray(users.Where(x => CanViewAs(real, x)).Select(x => (JsonNode)new JsonObject
            {
                ["id"] = x.Id, ["name"] = x.Name, ["phone"] = x.Phone, ["role"] = RoleOf(x), ["branch_id"] = x.BranchId, ["status"] = x.Status,
            }).ToArray()));
        });
        g.MapPost("/auth/switch-user/v34/resolve", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var real = await RealUser(db, h.User);
            if (real is null || RoleOf(real) is not ("owner" or "admin")) throw Fail("Only owners and administrators can switch users", 403);
            var phone = Regex.Replace(Regex.Replace(Str(body?["phone"]).Trim(), @"^\+91[\s-]?", ""), @"[\s-]", "");
            if (!Regex.IsMatch(phone, @"^\d{10}$")) throw Fail("Enter a valid 10-digit mobile number");
            var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Phone == phone);
            if (!CanViewAs(real, user)) throw Fail("No active eligible user with that number", 404);
            var a = await ActorOf(db, h.User);
            SettingsAudit(db, a, "switch-user", "preview", new { target_id = user!.Id.ToString(), target_role = RoleOf(user) }); await db.SaveChangesAsync();
            return J(new JsonObject { ["id"] = user.Id, ["name"] = user.Name, ["role"] = RoleOf(user), ["phone"] = user.Phone, ["message"] = "Viewing as " + user.Name + ". Changes remain attributed to your own account." });
        });
        g.MapGet("/auth/switch-user/v34/status", async (HttpContext h, GdsDbContext db) =>
        {
            var real = await RealUser(db, h.User) ?? throw Fail("Authentication required", 401);
            return J(new JsonObject { ["is_viewing_as"] = false, ["real"] = new JsonObject { ["id"] = real.Id, ["name"] = real.Name, ["role"] = RoleOf(real) }, ["target"] = null });
        });
        g.MapGet("/auth/sessions", async (HttpContext h, GdsDbContext db) =>
        {
            var real = await RealUser(db, h.User); var sid = long.TryParse(h.User.FindFirstValue("sid"), out var s) ? s : (long?)null;
            var rows = real is null ? [] : await db.UserSessions.AsNoTracking().Where(x => x.UserId == real.Id && x.RevokedAt == null && x.ExpiresAt > DateTime.UtcNow).OrderBy(x => x.Id).ToListAsync();
            return J(new JsonObject
            {
                ["sessions"] = new JsonArray(rows.Select(x => (JsonNode)new JsonObject { ["id"] = x.Id, ["created_at"] = Iso(x.CreatedAt), ["last_seen"] = Iso(x.LastSeenAt), ["user_agent"] = x.UserAgent, ["current"] = x.Id == sid }).ToArray()),
                ["has_legacy_session"] = sid is null,
            });
        });
        g.MapDelete("/auth/sessions/{id:long}", async (long id, HttpContext h, GdsDbContext db) =>
        {
            var real = await RealUser(db, h.User); var sid = long.TryParse(h.User.FindFirstValue("sid"), out var s) ? s : (long?)null;
            var row = await db.UserSessions.FirstOrDefaultAsync(x => x.Id == id);
            if (row is null || real is null || row.UserId != real.Id) throw Fail("Session not found", 404);
            row.RevokedAt ??= DateTime.UtcNow; await db.SaveChangesAsync();
            return J(new JsonObject { ["success"] = true, ["current"] = row.Id == sid });
        });
    }
}

/// <summary>About → build metadata from this running deployment (legacy about-v32-build.js).</summary>
public static class BuildInfo
{
    private static JsonObject? cached;
    public static JsonObject Get(IHostEnvironment env)
    {
        if (cached is not null) return (JsonObject)cached.DeepClone();
        string E(params string[] keys) => keys.Select(Environment.GetEnvironmentVariable).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))?.Trim() ?? "";
        string Git(params string[] args)
        {
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo("git") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = env.ContentRootPath };
                foreach (var a in args) psi.ArgumentList.Add(a);
                using var p = System.Diagnostics.Process.Start(psi)!;
                var o = p.StandardOutput.ReadToEnd(); return p.WaitForExit(1500) && p.ExitCode == 0 ? o.Trim() : "";
            }
            catch { return ""; }
        }
        string? AsIso(string v) => DateTimeOffset.TryParse(v, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var t) && v.Length > 0 ? LegacyIam.Iso(t.UtcDateTime) : null;
        var sha = E("GDS_BUILD_SHA", "GIT_COMMIT_SHA", "GITHUB_SHA", "RENDER_GIT_COMMIT", "RAILWAY_GIT_COMMIT_SHA"); if (sha == "") sha = Git("rev-parse", "HEAD");
        var commit = Regex.IsMatch(sha, "^[a-f0-9]{40}$", RegexOptions.IgnoreCase) ? sha.ToLowerInvariant() : null;
        var envName = E("GDS_ENVIRONMENT", "APP_ENV"); if (envName == "") envName = env.EnvironmentName; envName = envName.ToLowerInvariant();
        var label = envName switch { "production" or "prod" => "PROD", "staging" => "STAGING", "uat" => "UAT", "testing" or "test" => "TEST", "development" or "dev" => "DEV", "local" => "LOCAL", _ => "CUSTOM" };
        var buildId = commit ?? (E("GDS_BUILD_ID") is { Length: > 0 } b ? (b.Length > 100 ? b[..100] : b) : null);
        var version = typeof(BuildInfo).Assembly.GetName().Version is { } ver ? $"{ver.Major}.{ver.Minor}.{ver.Build}" : "0.0.0";
        cached = new JsonObject
        {
            ["product"] = "JourneyOS Operator", ["version"] = version, ["build_id"] = buildId, ["commit"] = commit, ["short_commit"] = commit?[..8],
            ["built_at"] = AsIso(E("GDS_BUILD_TIME", "BUILD_TIMESTAMP")), ["committed_at"] = commit is null ? null : AsIso(Git("show", "-s", "--format=%cI", commit)),
            ["environment"] = label, ["project_url"] = "https://github.com/Prajwal-sajan/GDS", ["commit_url"] = commit is null ? null : "https://github.com/Prajwal-sajan/GDS/commit/" + commit,
            ["description"] = "The multi-tenant operator console for JourneyOS — manage GDS schedules, tripsheets, passenger chats, and bookings for your entire fleet from one place, on any device.",
            ["features"] = new JsonArray("GDS Schedules", "Tripsheets", "Passenger Chats", "Bookings"), ["update_source"] = "deployed-server",
        };
        return (JsonObject)cached.DeepClone();
    }
}
