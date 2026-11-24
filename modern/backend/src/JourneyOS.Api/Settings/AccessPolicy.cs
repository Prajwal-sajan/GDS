using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using static JourneyOS.Api.Settings.LegacyIam;
using static JourneyOS.Api.Settings.TeamAccessEndpoints;

namespace JourneyOS.Api.Settings;

/// <summary>
/// Settings → Team &amp; access → Test access. Port of legacy team-access-policy-v28.js (<c>evaluate</c>: role matrix
/// grant + restrictive rules + Own/Branch scope) and team-access-situation-v29.js (validated "Situation" inputs).
/// A simulation only: it never executes a transaction or impersonates the caller.
/// </summary>
public static class AccessPolicy
{
    private static readonly HashSet<string> ReadOnly = Schema["read_only"]!.AsArray().Select(x => (string)x!).ToHashSet();
    private static readonly Dictionary<string, string> Labels = Schema["situation_fields"]!.AsArray().ToDictionary(x => (string)x![0]!, x => (string)x![1]!);
    private static readonly HashSet<string> LegacyKeys = ["branch_id", "owner_user_id"];
    private static readonly HashSet<string> Used = ["route_id", "seat_count", "block_duration_hours", "hours_before_departure", "days_before_departure", "sold_branch_id", "booked_by_mobile", "branch_id", "owner_user_id"];
    private static readonly Dictionary<string, (double Min, double Max, bool Whole)> Numbers = new()
    {
        ["caller_branch_id"] = (0, 1e9, true), ["sold_branch_id"] = (1, 1e9, true), ["route_id"] = (1, 1e9, true), ["operator_hour"] = (0, 23, true),
        ["request_amount_inr"] = (0, 1e9, false), ["discount_percent"] = (0, 100, false), ["fare_change_percent"] = (-100, 1000, false),
        ["seat_count"] = (0, 500, true), ["already_blocked_seats"] = (0, 500, true), ["block_duration_hours"] = (0, 8760, false),
        ["days_before_departure"] = (0, 365, false), ["hours_before_departure"] = (0, 8760, false), ["branch_id"] = (1, 1e9, true), ["owner_user_id"] = (1, 1e9, true),
    };
    private static readonly HashSet<string> Enforced =
    [
        "Cancel tickets", "Block seats", "Unblock seats / book a blocked seat", "View bookings", "Edit passengers & points", "Shift seat / date", "Book on behalf of agents",
        "Add comments to a PNR", "See passenger phone numbers", "Assign bus", "Assign crew (driver, conductor, helper)", "Edit expenses", "Change fares", "Add vehicles",
        "Edit vehicles & documents", "Delete vehicles", "Create routes", "Delete routes", "View staff", "Add / edit staff", "Export / download",
    ];
    private static string Digits10(string? p) { var d = Regex.Replace(p ?? "", @"\D", ""); return d.Length > 10 ? d[^10..] : d; }
    private static string Raw(JsonNode? v) => v is JsonValue jv && jv.GetValueKind() == JsonValueKind.String ? jv.GetValue<string>() : v?.ToJsonString() ?? "";

    public static async Task<JsonObject> Test(GdsDbContext db, Actor a, JsonObject b)
    {
        var phone = Text(b["phone"], 40);
        if (!Regex.IsMatch(phone, "^[0-9]{10}$")) throw Fail("Enter a 10-digit mobile number");
        var users = await db.Users.AsNoTracking().ToListAsync();
        var user = users.FirstOrDefault(x => x.Phone == phone && x.DeletedAt == null);
        if (user is null || !Visible(a, user)) throw Fail("Person not found in your allowed directory", 404);
        var action = RowByKey(Text(b["action_key"], 200)) ?? throw Fail("Choose a permission to check");
        var raw = b["situation"] as JsonObject ?? new JsonObject();
        var ctx = new Dictionary<string, double>();
        if (raw.ContainsKey("route_id") && Raw(raw["route_id"]) != "")
        {
            var id = Number(raw["route_id"]);
            if (id is null || double.IsNaN(id.Value) || id % 1 != 0 || !await db.Routes.AnyAsync(r => r.Id == (long)id.Value)) throw Fail("Choose a valid route");
            ctx["route_id"] = id.Value;
        }
        foreach (var (key, max) in new[] { ("seat_count", 500d), ("block_duration_hours", 8760d), ("hours_before_departure", 8760d) })
            if (raw.ContainsKey(key) && Raw(raw[key]) != "")
            {
                var n = Number(raw[key]);
                if (n is null || !double.IsFinite(n.Value) || n < 0 || n > max) throw Fail("Invalid " + key);
                ctx[key] = n.Value;
            }
        if (raw.ContainsKey("branch_id") && Raw(raw["branch_id"]) != "")
        {
            var id = Number(raw["branch_id"]);
            if (id is null || double.IsNaN(id.Value) || id % 1 != 0 || !await db.Branches.AnyAsync(x => x.Id == (long)id.Value)) throw Fail("Unknown branch");
            ctx["branch_id"] = id.Value;
        }
        if (raw.ContainsKey("owner_user_id") && Raw(raw["owner_user_id"]) != "")
        {
            var id = Number(raw["owner_user_id"]);
            if (id is null || double.IsNaN(id.Value) || id % 1 != 0 || users.All(x => x.Id != (long)id.Value)) throw Fail("Unknown owner");
            ctx["owner_user_id"] = id.Value;
        }
        var (supplied, policyKeys, contextOnly) = await Normalize(db, a, raw, user, users, ctx);
        var decision = await Evaluate(db, user, (string)action["key"]!, ctx);
        var enforced = Enforced.Contains((string)action["label"]!);
        var o = new JsonObject { ["person"] = new JsonObject { ["id"] = user.Id, ["name"] = user.Name, ["role"] = RoleOf(user), ["branch_id"] = user.BranchId } };
        foreach (var (k, v) in decision) o[k] = v?.DeepClone();
        o["situation_evidence"] = new JsonObject
        {
            ["provided"] = new JsonArray(supplied.Select(x => (JsonNode)x).ToArray()), ["policy_fields"] = new JsonArray(policyKeys.Select(x => (JsonNode)x).ToArray()),
            ["context_only_fields"] = new JsonArray(contextOnly.Select(x => (JsonNode)x).ToArray()),
        };
        o["runtime_enforced"] = enforced;
        o["note"] = enforced ? "Policy evaluator and some live API paths use this action; scenario-based tests do not execute a real transaction."
            : "This is a policy simulation, not proof that every GDS endpoint currently enforces this control.";
        return o;
    }

    private static async Task<(List<string>, List<string>, List<string>)> Normalize(GdsDbContext db, Actor a, JsonObject raw, AppUser user, List<AppUser> users, Dictionary<string, double> ctx)
    {
        if (raw.Count > 27) throw Fail("Too many situation fields");
        var supplied = new List<string>(); var data = new Dictionary<string, object>();
        foreach (var (key, value) in raw)
        {
            if (!Labels.ContainsKey(key) && !LegacyKeys.Contains(key)) throw Fail("Unknown situation field: " + (key.Length > 40 ? key[..40] : key));
            if (IsNull(value) || Raw(value) == "") continue;
            if (value is JsonObject) throw Fail("Invalid value for " + key);
            string L() => Labels.GetValueOrDefault(key, key);
            if (Numbers.TryGetValue(key, out var spec))
            {
                var s = Raw(value).Trim(); var n = Number(value);
                if (s == "" || n is null || !double.IsFinite(n.Value) || n < spec.Min || n > spec.Max || (spec.Whole && n % 1 != 0)) throw Fail("Invalid " + L());
                data[key] = n.Value;
            }
            else if (key is "caller_id" or "booked_by_mobile")
            {
                var s = Regex.Replace(Raw(value).Trim(), @"[ +()-]", "");
                var digits = s.StartsWith("91") && s.Length == 12 ? s[2..] : s;
                if (!Regex.IsMatch(digits, "^[6-9][0-9]{9}$")) throw Fail("Invalid " + L());
                data[key] = digits;
            }
            else if (key is "caller_role_names" or "stop_city_ids")
            {
                var items = value is JsonArray arr ? arr.Select(x => x is JsonValue v && v.GetValueKind() == JsonValueKind.String ? v.GetValue<string>() : null).ToList() : Raw(value).Split(',').Select(x => (string?)x).ToList();
                if (items.Count > 30 || items.Count == 0 || items.Any(x => x is null || x.Trim().Length == 0 || x.Trim().Length > 100)) throw Fail("Invalid " + L());
                data[key] = items.Select(x => x!.Trim()).ToArray();
            }
            else if (key is "inside_branch_operations_area" or "on_trip_roster")
            {
                var s = Raw(value);
                data[key] = s is "true" or "1" ? true : s is "false" or "0" ? false : throw Fail("Invalid " + L());
            }
            else if (key == "calling_app")
            {
                var s = Raw(value);
                if (s is not ("app" or "hub" or "website" or "gds" or "partner")) throw Fail("Invalid calling app");
                data[key] = s;
            }
            else if (key == "client_ip")
            {
                var s = Raw(value);
                if (!IPAddress.TryParse(s, out var ip) || (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && s.Count(c => c == '.') != 3)) throw Fail("Invalid client IP address");
                data[key] = s;
            }
            else if (key == "request_time_utc")
            {
                var s = Raw(value);
                if (!Regex.IsMatch(s, @"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$") || !DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out _))
                    throw Fail("Request time must be ISO 8601 UTC ending in Z");
                data[key] = s;
            }
            else
            {
                var s = Raw(value).Trim();
                if (s.Length == 0 || s.Length > 120) throw Fail("Invalid " + L());
                data[key] = s;
            }
            supplied.Add(key);
        }
        if (data.TryGetValue("caller_id", out var cid) && (string)cid != Digits10(user.Phone)) throw Fail("Caller's id must match the person being tested");
        if (data.TryGetValue("caller_branch_id", out var cb) && (double)cb != (user.BranchId ?? 0)) throw Fail("Caller's branch must match the person being tested");
        if (data.TryGetValue("sold_branch_id", out var sb))
        {
            var id = (double)sb;
            if (!await db.Branches.AnyAsync(x => x.Id == (long)id)) throw Fail("Unknown selling branch");
            if (ctx.TryGetValue("branch_id", out var bb) && bb != id) throw Fail("Conflicting selling branch and branch scope");
            ctx["branch_id"] = id;
        }
        if (data.TryGetValue("booked_by_mobile", out var bm))
        {
            var assigned = users.FirstOrDefault(x => Digits10(x.Phone) == (string)bm && x.DeletedAt == null);
            if (assigned is not null && Visible(a, assigned))
            {
                if (ctx.TryGetValue("owner_user_id", out var ou) && ou != assigned.Id) throw Fail("Conflicting booking owner");
                ctx["owner_user_id"] = assigned.Id;
            }
        }
        foreach (var key in new[] { "route_id", "seat_count", "block_duration_hours", "hours_before_departure", "branch_id", "owner_user_id" })
        {
            if (!data.TryGetValue(key, out var v)) continue;
            if (ctx.TryGetValue(key, out var cur) && cur != (double)v) throw Fail("Conflicting " + key);
            ctx[key] = (double)v;
        }
        if (data.TryGetValue("days_before_departure", out var dd))
        {
            var hours = (double)dd * 24;
            if (ctx.TryGetValue("hours_before_departure", out var hb) && Math.Abs(hb - hours) > 0.01) throw Fail("Conflicting departure days and hours");
            ctx.TryAdd("hours_before_departure", hours);
        }
        var policyKeys = supplied.Where(x => Used.Contains(x) && (x != "booked_by_mobile" || ctx.ContainsKey("owner_user_id"))).ToList();
        var contextOnly = supplied.Where(x => !policyKeys.Contains(x)).ToList();
        return (supplied, policyKeys, contextOnly);
    }

    private static string ScopeOf(JsonObject role, JsonObject row)
    {
        var key = (string)row["key"]!; var label = (string)row["label"]!; var scope = (string?)row["kind"] == "scope";
        if (role["matrix_v27"] is JsonObject m && m.ContainsKey(key)) return (string)m[key]!;
        var previous = LegacyFor(label) ?? label;
        if (role["scopes"] is JsonObject s && ((string?)s[label] ?? (string?)s[previous]) is { Length: > 0 } sv) return sv;
        if (role["ui_permissions"] is JsonObject ui && ui.ContainsKey(label)) return ui[label]!.GetValue<bool>() ? (scope ? "Company" : "On") : "Off";
        return (role["permissions"] as JsonArray ?? []).Any(x => (string?)x == (string?)row["code"]) ? (scope ? "Company" : "On") : "Off";
    }

    public static async Task<JsonObject> Evaluate(GdsDbContext db, AppUser user, string actionKey, Dictionary<string, double> ctx)
    {
        var row = RowByKey(actionKey) ?? RowByLabel(actionKey) ?? throw Fail("Unknown permission");
        var roles = await Roles(db); var roleKey = RoleOf(user);
        var role = roles[roleKey] as JsonObject ?? new JsonObject();
        var selected = ScopeOf(role, row);
        var groups = (await Doc(db, "iam_groups") as JsonArray ?? []).OfType<JsonObject>().Where(gr => Ids(gr).Contains(user.Id)).ToList();
        var permissions = PermsFor(roles, roleKey, ProfileOf(user));
        var code = (string)row["code"]!;
        var impossible = !Available(row, roleKey);
        var granted = permissions.Contains(code) || (code is "bookings.comments" or "bookings.see_phone" && permissions.Contains("bookings.view_all"));
        var baseAllowed = !impossible && selected != "Off" && granted;
        var reasons = new List<string>();
        if (impossible) reasons.Add("Unavailable for this role");
        else if (selected == "Off") reasons.Add("Disabled in role matrix");
        else if (!granted) reasons.Add("Missing API permission: " + code);

        // ruleEffect
        var groupIds = groups.Select(gr => ((long?)gr["id"])?.ToString()).ToHashSet();
        var applied = new JsonArray(); var unknown = new List<(JsonNode? Id, string? Name, string Needs)>(); var limits = new Dictionary<string, double>(); var denied = new List<string>();
        foreach (var rule in (await Doc(db, "iam_access_rules_v28") as JsonArray ?? []).OfType<JsonObject>())
        {
            if (rule["enabled"] is JsonValue en && en.GetValueKind() == JsonValueKind.False) continue;
            var st = (string?)rule["subject_type"]; var sid = SubjectId(rule);
            if (roleKey == "owner" && st == "all") continue;
            var applies = st switch { "all" => true, "role" => sid == roleKey, "person" => sid == user.Id.ToString(), "group" => groupIds.Contains(sid), _ => false };
            if (!applies) continue;
            var ak = (string?)rule["action_key"];
            if (ak != "*" && ak != actionKey) continue;
            var kind = (string?)rule["condition"]?["kind"] ?? "always";
            bool match; string? needs = null;
            switch (kind)
            {
                case "always": match = true; break;
                case "write_action": match = !ReadOnly.Contains((string)row["label"]!); break;
                case "departure_within_hours":
                    if (!ctx.TryGetValue("hours_before_departure", out var hb)) { match = false; needs = "hours before departure"; }
                    else match = hb < (double)(rule["condition"]!["hours"]?.GetValue<double>() ?? 0);
                    break;
                case "corridor_mismatch":
                    if (!ctx.TryGetValue("route_id", out var rid) || rid == 0) { match = false; needs = "route"; }
                    else if (!await db.Routes.AnyAsync(r => r.Id == (long)rid)) { match = false; needs = "valid route"; }
                    else match = true; // routes carry no corridor tags in this data set; missing tags deny, never silently allow
                    break;
                default: match = false; needs = "supported rule condition"; break;
            }
            if (needs is not null) { unknown.Add((rule["id"]?.DeepClone(), (string?)rule["name"], needs)); continue; }
            if (!match) continue;
            applied.Add(new JsonObject { ["id"] = rule["id"]?.DeepClone(), ["name"] = rule["name"]?.DeepClone(), ["effect"] = rule["effect"]?.DeepClone(), ["subject"] = st });
            if ((string?)rule["effect"] == "deny") denied.Add((string?)rule["name"] ?? "");
            if ((string?)rule["effect"] == "limit" && rule["limits"] is JsonObject lim)
                foreach (var (k, v) in lim)
                    if (k is "max_seats" or "max_hours" && v is JsonValue nv && nv.GetValueKind() == JsonValueKind.Number && nv.GetValue<double>() > 0)
                        limits[k] = Math.Min(limits.GetValueOrDefault(k, double.PositiveInfinity), nv.GetValue<double>());
        }
        if (limits.TryGetValue("max_seats", out var ms) && ctx.TryGetValue("seat_count", out var sc) && sc > ms) denied.Add("Seat limit " + ms);
        if (limits.TryGetValue("max_hours", out var mh) && ctx.TryGetValue("block_duration_hours", out var bd) && bd > mh) denied.Add("Duration limit " + mh + " h");

        if (denied.Count > 0) reasons.AddRange(denied.Select(d => "Blocked by rule: " + d));
        var decision = !baseAllowed || denied.Count > 0 ? "deny" : "allow";
        if (decision == "allow" && selected is "Own" or "Branch")
        {
            if (selected == "Own" && ctx.TryGetValue("owner_user_id", out var ou) && ou != user.Id) { decision = "deny"; reasons.Add("Resource not owned by this user"); }
            else if (selected == "Branch" && ctx.TryGetValue("branch_id", out var br) && br != (user.BranchId ?? -1)) { decision = "deny"; reasons.Add("Resource outside assigned branch"); }
            else if ((selected == "Own" && !ctx.ContainsKey("owner_user_id")) || (selected == "Branch" && !ctx.ContainsKey("branch_id"))) { decision = "conditional"; reasons.Add("Resource ownership or branch context required"); }
        }
        if (decision == "allow" && unknown.Count > 0) { decision = "conditional"; reasons.Add("Rule needs " + string.Join(", ", unknown.Select(x => x.Needs))); }
        if (decision == "allow") reasons.Add("Permitted by role with no matching restrictive rule");
        var limitsObj = new JsonObject(); foreach (var (k, v) in limits) limitsObj[k] = v % 1 == 0 ? JsonValue.Create((long)v) : JsonValue.Create(v);
        return new JsonObject
        {
            ["decision"] = decision, ["action_key"] = row["key"]!.DeepClone(), ["action"] = row["label"]!.DeepClone(), ["role"] = roleKey,
            ["role_name"] = (string?)role["name"] ?? roleKey, ["selected"] = selected, ["base_grant"] = baseAllowed,
            ["groups"] = new JsonArray(groups.Select(gr => gr["name"]?.DeepClone()).ToArray()), ["applied_rules"] = applied,
            ["pending_rules"] = new JsonArray(unknown.Select(x => (JsonNode)new JsonObject { ["id"] = x.Id, ["name"] = x.Name, ["needs"] = x.Needs }).ToArray()),
            ["limits"] = limitsObj, ["reasons"] = new JsonArray(reasons.Select(x => (JsonNode)x).ToArray()),
        };
    }
}
