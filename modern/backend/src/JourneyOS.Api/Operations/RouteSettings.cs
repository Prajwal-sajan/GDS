using System.Text.Json;
using System.Text.Json.Nodes;

namespace JourneyOS.Api.Operations;

/// <summary>
/// Route General-tab settings stored as jsonb in the legacy shape (routes-screenshot-v5 general()). Only these keys are accepted,
/// each validated against the legacy option lists, so the column can never hold arbitrary client data.
/// </summary>
public static class RouteSettings
{
    public static readonly string[] Keys = ["hub", "business_rules", "call_settings", "escalation_contacts", "cabs", "assignments", "tags", "run_pattern"];
    private static readonly Dictionary<string, string[]> RuleValues = new()
    {
        ["gents_next_to_ladies"] = ["No", "Yes"],
        ["ladies_next_to_gents"] = ["No", "Yes"],
        ["ladies_fill_doubles_first"] = ["Yes", "No"],
        ["seat_sharing"] = ["City Based", "Disabled", "Full Journey"],
        ["boarding_check"] = ["Passenger OTP", "Manual Check"],
        ["allow_cancellation"] = ["Yes", "No"],
    };

    /// <summary>business_rules.allow_cancellation (legacy: false or "No" closes passenger cancellation); default allowed.</summary>
    public static bool CancellationAllowed(string? json)
    {
        if (json is null) return true;
        var v = JsonNode.Parse(json)?["business_rules"]?["allow_cancellation"];
        if (v is JsonValue jv && jv.TryGetValue<bool>(out var b)) return b;
        return v?.GetValue<string>() != "No";
    }
    private static readonly string[] CallKeys = ["cloud_calling", "number_masking", "direct_to_vehicle", "driver_gps"];
    private static readonly string[] Cabs = ["Off", "Pickups", "Drops", "Both"];
    private static readonly string[] CrewRoles = ["Driver", "Helper", "Conductor", "Attendant"];

    /// <summary>Copies the legacy route's settings keys verbatim (importer).</summary>
    public static string? FromLegacy(JsonElement r)
    {
        var o = new JsonObject();
        foreach (var k in Keys)
            if (r.TryGetProperty(k, out var v) && v.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined)) o[k] = JsonNode.Parse(v.GetRawText());
        return o.Count == 0 ? null : o.ToJsonString();
    }

    /// <summary>Validates <paramref name="patch"/> and merges it over <paramref name="current"/>; a null value removes the key.</summary>
    public static string? Merge(string? current, JsonObject patch, out List<string> errors)
    {
        errors = [];
        var o = current is null ? new JsonObject() : JsonNode.Parse(current)!.AsObject();
        foreach (var (k, v) in patch)
        {
            if (!Keys.Contains(k)) { errors.Add($"Unknown route setting '{k}'"); continue; }
            if (v is null) { o.Remove(k); continue; }
            var err = Validate(k, v);
            if (err is not null) { errors.Add(err); continue; }
            o[k] = v.DeepClone();
        }
        return o.Count == 0 ? null : o.ToJsonString();
    }

    private static string? Validate(string k, JsonNode v)
    {
        switch (k)
        {
            case "hub":
            case "escalation_contacts":
                return v is JsonValue s && s.TryGetValue<string>(out var str) && str.Length <= 300 ? null : $"{k} must be text (max 300 characters)";
            case "cabs":
                return v is JsonValue c && c.TryGetValue<string>(out var cab) && Cabs.Contains(cab) ? null : "Autos & Cabs must be Off, Pickups, Drops or Both";
            case "business_rules":
                if (v is not JsonObject br) return "business_rules must be an object";
                foreach (var (rk, rv) in br)
                {
                    if (!RuleValues.TryGetValue(rk, out var allowed)) return $"Unknown booking rule '{rk}'";
                    var text = rv is JsonValue jv && jv.TryGetValue<bool>(out var b) ? (b ? "Yes" : "No") : rv?.GetValue<string>();
                    if (text is null || !allowed.Contains(text)) return $"{rk} must be one of {string.Join(", ", allowed)}";
                }
                return null;
            case "call_settings":
                if (v is not JsonObject cs) return "call_settings must be an object";
                foreach (var (ck, cv) in cs)
                {
                    if (ck == "automated_calls") { if (cv is not JsonObject) return "automated_calls must be an object"; continue; }
                    if (!CallKeys.Contains(ck)) return $"Unknown call setting '{ck}'";
                    if (cv is not JsonValue bv || !bv.TryGetValue<bool>(out _)) return $"{ck} must be on or off";
                }
                return null;
            case "tags":
                if (v is not JsonObject tags) return "tags must be an object";
                foreach (var (tk, tv) in tags)
                    if (tk.Trim().Length is 0 or > 40 || tv is not JsonValue t || !t.TryGetValue<string>(out var tval) || tval.Length > 80) return "Tags need a name (max 40) and a text value (max 80)";
                return tags.Count > 30 ? "At most 30 tags" : null;
            case "assignments":
                if (v is not JsonArray arr || arr.Count > 2) return "assignments must be a list of at most 2 rotations";
                foreach (var a in arr)
                {
                    if (a is not JsonObject ao) return "Each assignment must be an object";
                    if (ao["vehicle_id"] is { } vid && (vid is not JsonValue vv || !vv.TryGetValue<long>(out _))) return "vehicle_id must be a number";
                    if (ao["crew"] is { } crew)
                    {
                        if (crew is not JsonArray ca || ca.Count > 8) return "crew must be a list of at most 8 people";
                        foreach (var m in ca)
                            if (m is not JsonObject mo || mo["role"]?.GetValue<string>() is not { } role || !CrewRoles.Contains(role)) return $"Crew role must be one of {string.Join(", ", CrewRoles)}";
                    }
                    if (ao["pickup_vans"] is { } vans && (vans is not JsonArray va || va.Count > 10)) return "pickup_vans must be a list of at most 10";
                }
                return null;
            case "run_pattern":
                return v is JsonObject ? null : "run_pattern must be an object";
        }
        return null;
    }
}
