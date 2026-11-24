using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Settings;

/// <summary>
/// Legacy Team &amp; access data model (server/auth.js roles + permission catalogue, team-access-schema-v27 role matrix,
/// team-access-policy-v28 rule templates). The pure data is generated from the legacy modules into
/// <c>legacy-iam-schema.json</c> (modern/scripts/dump-legacy-iam-schema.cjs) so it stays byte-identical.
/// Operator role customisations live in the tenant document <c>roles</c> exactly like legacy <c>db.meta('roles')</c>.
/// </summary>
public static class LegacyIam
{
    public static readonly JsonObject Schema = Load();
    private static JsonObject Load()
    {
        using var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("JourneyOS.Api.Settings.legacy-iam-schema.json")
            ?? throw new InvalidOperationException("legacy-iam-schema.json resource missing");
        return JsonNode.Parse(s)!.AsObject();
    }

    public static IEnumerable<string> Catalog => Schema["catalog"]!.AsObject().SelectMany(kv => kv.Value!.AsArray().Select(x => x!.GetValue<string>()));
    public static JsonObject DefaultRoles => Schema["default_roles"]!.AsObject();
    /// <summary>All matrix rows (v27), flattened, with key/label/code/kind/roleImpossible/limit/choices.</summary>
    public static readonly JsonObject[] Rows = Schema["matrix"]!.AsArray().SelectMany(s => s!["rows"]!.AsArray()).Select(r => r!.AsObject()).ToArray();
    public static JsonObject? RowByKey(string? key) => Rows.FirstOrDefault(r => (string?)r["key"] == key);
    public static JsonObject? RowByLabel(string? label) => Rows.FirstOrDefault(r => (string?)r["label"] == label);
    public static string? LegacyFor(string label) => (string?)Schema["legacy_for"]![label];
    public static bool Available(JsonObject row, string role) => !row["roleImpossible"]!.AsArray().Any(x => (string?)x == role);

    /// <summary>Legacy role key of a user: imported users keep their legacy role; modern-created users map back.</summary>
    public static string RoleOf(AppUser u) => u.LegacyRole ?? u.Role switch
    {
        "ops" => "booking_executive", "accounts" => "accountant", var r => r,
    };
    /// <summary>Modern authorization role derived from a legacy role (same mapping as the importer).</summary>
    public static string ModernRole(string legacy) => legacy switch
    {
        "owner" => "owner",
        "admin" or "manager" => "admin",
        "accountant" => "accounts",
        "booking_executive" or "pickup_manager" or "branch_admin" or "service_agent" or "service_associate" => "ops",
        "agent" => "agent",
        _ => "viewer",
    };

    // ---------------- documents ----------------
    public static async Task<JsonNode?> Doc(GdsDbContext db, string key) =>
        await db.TenantDocuments.AsNoTracking().Where(d => d.Key == key).Select(d => d.Json).FirstOrDefaultAsync() is { } j ? JsonNode.Parse(j) : null;

    public static async Task SetDoc(GdsDbContext db, string key, JsonNode? value)
    {
        var row = await db.TenantDocuments.FirstOrDefaultAsync(d => d.Key == key);
        if (row is null) db.TenantDocuments.Add(row = new TenantDocument { TenantId = db.CurrentTenantId, Key = key });
        row.Json = value?.ToJsonString() ?? "null";
        row.UpdatedAt = DateTime.UtcNow;
    }

    public static async Task<long> Revision(GdsDbContext db, string key) => (await Doc(db, key))?.GetValue<long>() ?? 0;

    /// <summary>Legacy <c>roles()</c>: built-ins overridden/extended by the tenant's saved roles (object-spread order).</summary>
    public static async Task<JsonObject> Roles(GdsDbContext db)
    {
        var all = (JsonObject)DefaultRoles.DeepClone();
        if (await Doc(db, "roles") is JsonObject custom)
            foreach (var (k, v) in custom) all[k] = v?.DeepClone();
        return all;
    }

    public static string[] PermsFor(JsonObject roles, string role, Profile p)
    {
        var baseP = roles[role]?["permissions"]?.AsArray().Select(x => x!.GetValue<string>()) ?? [];
        return baseP.Concat(p.ExtraPermissions).Distinct().Where(x => !p.DeniedPermissions.Contains(x)).ToArray();
    }

    // ---------------- user profile (legacy user fields not modelled as columns) ----------------
    public sealed class Profile
    {
        public string Language { get; set; } = "English";
        public string Mode { get; set; } = "Online";
        public string AgentCategory { get; set; } = "agent";
        public string AgentType { get; set; } = "postpaid";
        public long? MasterAgentId { get; set; }
        public bool LimitRoutes { get; set; }
        public long[] RouteIds { get; set; } = [];
        public string[] ExtraPermissions { get; set; } = [];
        public string[] DeniedPermissions { get; set; } = [];
        public string[] CorridorTags { get; set; } = [];
    }
    private static readonly JsonSerializerOptions Snake = new(JsonSerializerDefaults.Web) { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
    public static Profile ProfileOf(AppUser u) => u.ProfileJson is { Length: > 0 } j ? JsonSerializer.Deserialize<Profile>(j, Snake) ?? new() : new();
    public static string ProfileJson(Profile p) => JsonSerializer.Serialize(p, Snake);

    /// <summary>Number as legacy JS would serialise it (5 not 5.00).</summary>
    public static JsonNode N(decimal? d) { var v = d ?? 0; return v == decimal.Truncate(v) ? JsonValue.Create((long)v) : JsonValue.Create((double)v); }
    public static string? Iso(DateTime? t) => t?.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");

    /// <summary>Legacy <c>exposeUser</c> (team-access-v26) incl. <c>publicUser</c> permissions.</summary>
    public static JsonObject Expose(AppUser u, JsonObject roles)
    {
        var p = ProfileOf(u); var role = RoleOf(u);
        return new JsonObject
        {
            ["id"] = u.Id, ["phone"] = u.Phone, ["name"] = u.Name, ["role"] = role, ["branch_id"] = u.BranchId,
            ["permissions"] = new JsonArray(PermsFor(roles, role, p).Select(x => (JsonNode)x).ToArray()),
            ["email"] = u.Email ?? "", ["language"] = p.Language, ["status"] = u.Status, ["mode"] = p.Mode,
            ["agent_category"] = p.AgentCategory, ["agent_type"] = p.AgentType, ["master_agent_id"] = p.MasterAgentId,
            ["limit_routes"] = p.LimitRoutes, ["route_ids"] = new JsonArray(p.RouteIds.Select(x => (JsonNode)x).ToArray()),
            ["extra_permissions"] = new JsonArray(p.ExtraPermissions.Select(x => (JsonNode)x).ToArray()),
            ["denied_permissions"] = new JsonArray(p.DeniedPermissions.Select(x => (JsonNode)x).ToArray()),
            ["corridor_tags"] = new JsonArray(p.CorridorTags.Select(x => (JsonNode)x).ToArray()),
            ["created_at"] = Iso(u.CreatedAt), ["last_login"] = Iso(u.LastLoginAt), ["login_count"] = u.LoginCount,
            ["commission_pct"] = N(u.CommissionPct), ["credit_limit"] = N(u.CreditLimit), ["deleted_at"] = Iso(u.DeletedAt),
        };
    }

    // ---------------- acting user ----------------
    /// <summary>The caller as a legacy user. Service keys (no user row) act as a synthetic organisation owner.</summary>
    public sealed record Actor(long Id, string Role, long? BranchId, string[] Permissions, string Name, string Phone);

    public static async Task<Actor> ActorOf(GdsDbContext db, ClaimsPrincipal user)
    {
        var roles = await Roles(db);
        if (long.TryParse(user.FindFirstValue("uid"), out var uid) && await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid) is { } u)
            return new Actor(u.Id, RoleOf(u), u.BranchId, PermsFor(roles, RoleOf(u), ProfileOf(u)), u.Name, u.Phone);
        var role = user.FindFirstValue(ClaimTypes.Role) ?? "viewer";
        var legacy = role switch { "ops" => "booking_executive", "accounts" => "accountant", _ => role };
        return new Actor(0, legacy, null, PermsFor(roles, legacy, new Profile()), user.Identity?.Name ?? "service", "");
    }

    public static void Require(Actor a, string perm)
    {
        if (!a.Permissions.Contains(perm)) throw new GdsException("FORBIDDEN", "Forbidden", 403);
    }

    public static async Task<int> RevokeSessions(GdsDbContext db, IEnumerable<long> userIds)
    {
        var ids = userIds.Distinct().ToArray();
        var now = DateTime.UtcNow; var n = 0;
        foreach (var s in await db.UserSessions.Where(s => ids.Contains(s.UserId) && s.RevokedAt == null).ToListAsync()) { s.RevokedAt = now; n++; }
        return n;
    }

    public static void Audit(GdsDbContext db, string actor, string action, string entityId, object? data) =>
        db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = actor, Action = action, Entity = "iam", EntityId = entityId, DataJson = data is null ? null : JsonSerializer.Serialize(data), At = DateTime.UtcNow });
}
