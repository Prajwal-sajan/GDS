using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using static JourneyOS.Api.Settings.LegacyIam;

namespace JourneyOS.Api.Settings;

/// <summary>
/// Settings → Team &amp; access. Port of legacy server/api/team-access-v26.js (directory, users, branches, role matrix,
/// custom roles, evaluate) and team-access-v28.js (catalogue, groups, restrictive access rules, policy test). Same paths,
/// validation messages and JSON shapes as legacy; every mutation is audited and revokes the affected users' sessions.
/// </summary>
public static class TeamAccessEndpoints
{
    private const string V26 = "/team-access/v26", V28 = "/team-access/v28";
    private static readonly string[] CrewRoles = ["driver", "helper", "conductor", "pickup_manager"];
    private static readonly string[] Languages = ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Odia", "Assamese", "Urdu"];
    private static readonly Dictionary<string, int> Rank = new()
    {
        ["owner"] = 100, ["admin"] = 90, ["manager"] = 70, ["branch_admin"] = 60, ["accountant"] = 50, ["service_agent"] = 45,
        ["service_associate"] = 40, ["pickup_manager"] = 40, ["booking_executive"] = 40, ["agent"] = 20, ["driver"] = 20, ["helper"] = 20, ["conductor"] = 20, ["viewer"] = 10,
    };
    private static int R(string role, int dflt = 0) => Rank.TryGetValue(role, out var r) ? r : dflt;
    internal static GdsException Fail(string m, int status = 400) => new("VALIDATION", m, status);
    internal static string Text(JsonNode? x, int max = 160) { var s = (x is JsonValue v && v.TryGetValue<string>(out var str) ? str : x?.ToJsonString() ?? "").Trim(); return s.Length > max ? s[..max] : s; }
    private static string NormPhone(string? x) { var p = Regex.Replace(x ?? "", @"[\s\-()]", ""); return p.StartsWith("+91") ? p[3..] : p; }
    internal static bool Has(JsonObject b, string k) => b.ContainsKey(k);
    internal static bool IsNull(JsonNode? n) => n is null || (n is JsonValue v && v.GetValueKind() == JsonValueKind.Null);
    internal static double? Number(JsonNode? n) => n switch
    {
        null => null,
        JsonValue v when v.GetValueKind() == JsonValueKind.Number => v.GetValue<double>(),
        JsonValue v when v.GetValueKind() == JsonValueKind.String => double.TryParse(v.GetValue<string>(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : (v.GetValue<string>().Trim() == "" ? 0 : double.NaN),
        JsonValue v when v.GetValueKind() is JsonValueKind.True => 1, JsonValue v when v.GetValueKind() is JsonValueKind.False => 0,
        _ => double.NaN,
    };
    private static bool Truthy(JsonNode? n) => n switch
    {
        null => false, JsonValue v => v.GetValueKind() switch
        {
            JsonValueKind.True => true, JsonValueKind.String => v.GetValue<string>().Length > 0, JsonValueKind.Number => v.GetValue<double>() != 0, _ => false,
        },
        _ => true,
    };

    private static bool SeesAll(Actor a) => a.Role is "owner" or "admin" or "manager";
    internal static bool Visible(Actor a, AppUser u) => SeesAll(a) || u.Id == a.Id || (a.BranchId is not null && u.BranchId == a.BranchId);

    private static JsonObject BranchJson(Branch b)
    {
        var o = new JsonObject { ["id"] = b.Id, ["name"] = b.Name, ["city_id"] = b.CityId, ["address"] = b.Address, ["phone"] = b.Phone };
        if (b.Code is not null) o["code"] = b.Code;
        if (b.ExtraJson is { Length: > 0 } j && JsonNode.Parse(j) is JsonObject x) foreach (var (k, v) in x) o[k] = v?.DeepClone();
        return o;
    }

    public static void Map(RouteGroupBuilder g)
    {
        // ---------------- directory ----------------
        g.MapGet(V26, async (HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.view");
            var roles = await Roles(db);
            var all = await db.Users.AsNoTracking().Where(u => u.DeletedAt == null).OrderBy(u => u.Id).ToListAsync();
            var users = all.Where(u => Visible(a, u)).ToList();
            var staff = a.Permissions.Contains("staff.view")
                ? (await db.Staff.AsNoTracking().Where(s => s.Role == "driver" || s.Role == "helper" || s.Role == "conductor").OrderBy(s => s.Id).ToListAsync())
                    .Select(s => (JsonNode)new JsonObject { ["id"] = s.Id, ["name"] = s.Name, ["phone"] = s.Phone, ["role"] = s.Role, ["status"] = string.IsNullOrEmpty(s.Status) ? "ACTIVE" : s.Status, ["created_at"] = null, ["staff_only"] = true }).ToArray()
                : [];
            var branches = (await db.Branches.AsNoTracking().OrderBy(b => b.Id).ToListAsync()).Where(b => SeesAll(a) || b.Id == a.BranchId).Select(b => (JsonNode)BranchJson(b)).ToArray();
            var roleRows = roles.Select(kv =>
            {
                var o = new JsonObject { ["key"] = kv.Key };
                foreach (var (k, v) in kv.Value!.AsObject()) o[k] = v?.DeepClone();
                o["builtin"] = DefaultRoles.ContainsKey(kv.Key);
                o["users"] = users.Count(u => RoleOf(u) == kv.Key);
                return (JsonNode)o;
            }).ToArray();
            var routes = await db.Routes.AsNoTracking().OrderBy(r => r.Id).Select(r => new { r.Id, r.Name, r.ServiceNumber }).ToListAsync();
            var cities = await db.Cities.AsNoTracking().OrderBy(c => c.Id).Select(c => new { c.Id, c.Name }).ToListAsync();
            var manageBranches = a.Role is "owner" or "admin";
            return Results.Text(new JsonObject
            {
                ["users"] = new JsonArray(users.Select(u => (JsonNode)Expose(u, roles)).ToArray()),
                ["staff"] = new JsonArray(staff),
                ["branches"] = new JsonArray(branches),
                ["roles"] = new JsonArray(roleRows),
                ["catalog"] = Schema["catalog"]!.DeepClone(),
                ["routes"] = new JsonArray(routes.Select(r => (JsonNode)new JsonObject { ["id"] = r.Id, ["name"] = r.Name.Length > 0 ? r.Name : r.ServiceNumber.Length > 0 ? r.ServiceNumber : "Route " + r.Id }).ToArray()),
                ["cities"] = new JsonArray(cities.Select(c => (JsonNode)new JsonObject { ["id"] = c.Id, ["name"] = c.Name }).ToArray()),
                ["matrix"] = Schema["matrix"]!.DeepClone(), ["role_columns"] = Schema["role_columns"]!.DeepClone(),
                ["role_descriptions"] = Schema["role_descriptions"]!.DeepClone(), ["role_hues"] = Schema["role_hues"]!.DeepClone(),
                ["matrix_revision"] = await Revision(db, "team_matrix_revision_v27"), ["matrix_version"] = 27,
                ["matrix_limit_fields"] = Schema["limit_fields"]!.DeepClone(),
                ["grants"] = new JsonObject { ["manage_users"] = a.Permissions.Contains("iam.manage_users"), ["manage_roles"] = a.Permissions.Contains("iam.manage_roles"), ["manage_branches"] = manageBranches },
                ["note"] = "Own and Branch scope metadata is displayed for review but not yet enforced uniformly across all domain endpoints.",
            }.ToJsonString(), "application/json");
        });

        // ---------------- users ----------------
        g.MapPost(V26 + "/users", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "iam.manage_users");
            var b = body ?? new JsonObject();
            var phone = NormPhone(Text(b["phone"], 40));
            if (!Regex.IsMatch(phone, "^[6-9][0-9]{9}$")) throw Fail("Enter a valid 10-digit Indian phone");
            if (await db.Users.AnyAsync(x => x.Phone == phone)) throw Fail("Phone is already registered", 409);
            var u = new AppUser { TenantId = db.CurrentTenantId, Phone = phone, CreatedAt = DateTime.UtcNow };
            await Apply(db, a, b, u, isNew: true);
            db.Users.Add(u);
            await db.SaveChangesAsync();
            await SyncStaff(db, u);
            Audit(db, a.Name, "user-create", u.Id.ToString(), new { role = RoleOf(u), branch_id = u.BranchId });
            await db.SaveChangesAsync();
            return Results.Text(Expose(u, await Roles(db)).ToJsonString(), "application/json");
        });
        g.MapPut(V26 + "/users/{id:long}", async (long id, HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "iam.manage_users");
            var b = body ?? new JsonObject();
            var u = await db.Users.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null) ?? throw Fail("User not found", 404);
            CanManage(a, u, b, "PUT");
            if (Has(b, "phone") && NormPhone(Text(b["phone"], 40)) != u.Phone) throw Fail("Phone number cannot be modified. Create a new identity.");
            var before = Snapshot(u);
            var wasMaster = RoleOf(u) == "agent" && ProfileOf(u).AgentCategory == "master_agent";
            await Apply(db, a, b, u, isNew: false);
            if (wasMaster && ProfileOf(u).AgentCategory != "master_agent" && await SubAgents(db, u.Id) > 0)
                throw Fail("Move sub-agents before changing a master agent to a regular agent", 409);
            var after = Snapshot(u);
            var changed = after.Where(kv => before[kv.Key] != kv.Value).Select(kv => kv.Key).ToArray();
            var roles = await Roles(db);
            if (changed.Length == 0) { db.ChangeTracker.Clear(); return Results.Text(Expose(u, roles).ToJsonString(), "application/json"); }
            await SyncStaff(db, u);
            var revoked = await RevokeSessions(db, [u.Id]);
            Audit(db, a.Name, "user-update", u.Id.ToString(), new { changed, revoked_sessions = revoked });
            await db.SaveChangesAsync();
            var o = Expose(u, roles); o["revoked_sessions"] = revoked;
            return Results.Text(o.ToJsonString(), "application/json");
        });
        g.MapDelete(V26 + "/users/{id:long}", async (long id, HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "iam.manage_users");
            var u = await db.Users.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null) ?? throw Fail("User not found", 404);
            CanManage(a, u, new JsonObject(), "DELETE");
            if (RoleOf(u) == "owner") throw Fail("Owner identity cannot be deleted", 403);
            if (await SubAgents(db, u.Id) > 0) throw Fail("Reassign sub-agents before removing this master agent", 409);
            u.Status = "INACTIVE"; u.DeletedAt = DateTime.UtcNow;
            var revoked = await RevokeSessions(db, [u.Id]);
            if (await Doc(db, "iam_groups") is JsonArray groups)
            {
                foreach (var gr in groups.OfType<JsonObject>())
                    if (gr["user_ids"] is JsonArray ids && ids.Any(x => x?.GetValue<long>() == u.Id))
                        gr["user_ids"] = new JsonArray(ids.Where(x => x?.GetValue<long>() != u.Id).Select(x => x!.DeepClone()).ToArray());
                await SetDoc(db, "iam_groups", groups);
            }
            Audit(db, a.Name, "user-deactivate-and-archive", u.Id.ToString(), new { revoked_sessions = revoked });
            await db.SaveChangesAsync();
            return Results.Ok(new { archived = true, id = u.Id, revoked_sessions = revoked });
        });

        // ---------------- branches ----------------
        g.MapPost(V26 + "/branches", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify"); AllowBranchEdit(a);
            var row = new Branch { TenantId = db.CurrentTenantId, Id = (await db.Branches.IgnoreQueryFilters().MaxAsync(x => (long?)x.Id) ?? 0) + 1 };
            await BranchInput(db, body ?? new JsonObject(), row, null);
            db.Branches.Add(row);
            Audit(db, a.Name, "branch-created", row.Id.ToString(), new { created = true, code = row.Code });
            await db.SaveChangesAsync();
            return Results.Text(BranchJson(row).ToJsonString(), "application/json");
        });
        g.MapPut(V26 + "/branches/{id:long}", async (long id, HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify"); AllowBranchEdit(a);
            var row = await db.Branches.FirstOrDefaultAsync(x => x.Id == id) ?? throw Fail("Branch not found", 404);
            await BranchInput(db, body ?? new JsonObject(), row, BranchJson(row));
            Audit(db, a.Name, "branch-updated", row.Id.ToString(), new { updated = true });
            await db.SaveChangesAsync();
            return Results.Text(BranchJson(row).ToJsonString(), "application/json");
        });
        g.MapDelete(V26 + "/branches/{id:long}", async (long id, HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.modify"); AllowBranchEdit(a);
            var row = await db.Branches.FirstOrDefaultAsync(x => x.Id == id) ?? throw Fail("Branch not found", 404);
            if (await db.Users.AnyAsync(x => x.DeletedAt == null && x.BranchId == id)) throw Fail("Move branch users before deleting their branch", 409);
            db.Branches.Remove(row);
            Audit(db, a.Name, "branch-deleted", id.ToString(), new { deleted = true });
            await db.SaveChangesAsync();
            return Results.Ok(new { deleted = true });
        });

        // ---------------- roles ----------------
        g.MapPut(V26 + "/roles/batch", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "iam.manage_roles");
            return Results.Text((await SaveMatrix(db, a, body ?? new JsonObject())).ToJsonString(), "application/json");
        });
        g.MapPost(V26 + "/roles", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "iam.manage_roles");
            var roles = await Roles(db);
            var name = Text(body?["name"], 70);
            var key = Regex.Replace(Regex.Replace(name.ToLowerInvariant(), "[^a-z0-9]+", "_"), "^_|_$", "");
            if (name.Length < 3 || key.Length == 0 || key == "owner" || key.Length > 40 || roles.ContainsKey(key)) throw Fail("Role name is unavailable");
            var sourceKey = Text(body?["starts_from"], 60);
            if (sourceKey.Length > 0 && (!roles.ContainsKey(sourceKey) || sourceKey is "owner" or "admin")) throw Fail("Choose an available starting role");
            var src = sourceKey.Length > 0 ? roles[sourceKey]!.AsObject() : null;
            var next = await Doc(db, "roles") as JsonObject ?? new JsonObject();
            JsonNode C(string k) => src?[k]?.DeepClone() ?? (k == "permissions" ? new JsonArray() : new JsonObject());
            var role = new JsonObject { ["name"] = name, ["permissions"] = C("permissions"), ["scopes"] = C("scopes"), ["ui_permissions"] = C("ui_permissions"), ["matrix_v27"] = C("matrix_v27"), ["limits"] = C("limits") };
            if (src is not null) role["starts_from"] = sourceKey;
            next[key] = role;
            await SetDoc(db, "roles", next);
            Audit(db, a.Name, "role-created", key, new { created = name, starts_from = sourceKey.Length > 0 ? sourceKey : null });
            await db.SaveChangesAsync();
            var o = new JsonObject { ["key"] = key }; foreach (var (k, v) in role) o[k] = v?.DeepClone();
            return Results.Text(o.ToJsonString(), "application/json");
        });
        g.MapDelete(V26 + "/roles/{key}", async (string key, HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "iam.manage_roles");
            if (DefaultRoles.ContainsKey(key)) throw Fail("Built-in roles cannot be deleted", 403);
            if ((await db.Users.AsNoTracking().Where(x => x.DeletedAt == null).ToListAsync()).Any(x => RoleOf(x) == key)) throw Fail("Reassign users before deleting their role", 409);
            var v = await Doc(db, "roles") as JsonObject ?? new JsonObject();
            if (!v.ContainsKey(key)) throw Fail("Role not found", 404);
            v.Remove(key); await SetDoc(db, "roles", v);
            Audit(db, a.Name, "role-deleted", key, new { deleted = true });
            await db.SaveChangesAsync();
            return Results.Ok(new { deleted = true });
        });
        g.MapGet(V26 + "/evaluate/{id:long}", async (long id, HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.view");
            var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null) ?? throw Fail("User not found", 404);
            if (!Visible(a, u)) throw Fail("User outside your branch scope", 403);
            var roles = await Roles(db); var p = ProfileOf(u);
            var branch = u.BranchId is { } bid ? await db.Branches.AsNoTracking().FirstOrDefaultAsync(x => x.Id == bid) : null;
            var routes = await db.Routes.AsNoTracking().Where(r => p.RouteIds.Contains(r.Id)).Select(r => new { r.Id, r.Name, service_number = r.ServiceNumber }).ToListAsync();
            var groups = (await Doc(db, "iam_groups") as JsonArray ?? []).OfType<JsonObject>().Where(gr => gr["user_ids"] is JsonArray ids && ids.Any(x => x?.GetValue<long>() == u.Id))
                .Select(gr => (JsonNode)new JsonObject { ["id"] = gr["id"]?.DeepClone(), ["name"] = gr["name"]?.DeepClone() }).ToArray();
            return Results.Text(new JsonObject
            {
                ["user"] = Expose(u, roles), ["role"] = roles[RoleOf(u)]?.DeepClone(),
                ["branches"] = new JsonArray(branch is null ? [] : [BranchJson(branch)]),
                ["routes"] = JsonSerializer.SerializeToNode(routes), ["groups"] = new JsonArray(groups),
                ["scope_enforcement"] = "API code grants active; Own/Branch filtering is not uniformly enforced by all domain endpoints.",
            }.ToJsonString(), "application/json");
        });

        // ---------------- v28: catalogue, groups, rules, test ----------------
        g.MapGet(V28 + "/catalog", async (HttpContext h, GdsDbContext db) =>
        {
            Require(await ActorOf(db, h.User), "settings.view");
            return Results.Text(new JsonObject
            {
                ["actions"] = new JsonArray(Rows.Select(r => (JsonNode)new JsonObject { ["key"] = r["key"]!.DeepClone(), ["label"] = r["label"]!.DeepClone(), ["group"] = ((string)r["key"]!).Split("__")[0], ["kind"] = r["kind"]!.DeepClone() }).ToArray()),
                ["templates"] = Schema["rule_templates"]!.DeepClone(),
            }.ToJsonString(), "application/json");
        });
        g.MapGet(V28 + "/groups", async (HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.view");
            var ids = (await VisibleUsers(db, a)).Select(u => u.Id).ToHashSet();
            var list = (await Doc(db, "iam_groups") as JsonArray ?? []).OfType<JsonObject>()
                .Where(gr => a.Role is "owner" or "admin" || Ids(gr).Any(ids.Contains))
                .Select(gr => { var o = (JsonObject)gr.DeepClone(); o["user_ids"] = new JsonArray(Ids(gr).Where(ids.Contains).Select(x => (JsonNode)x).ToArray()); return (JsonNode)o; }).ToArray();
            return Results.Text(new JsonObject { ["groups"] = new JsonArray(list) }.ToJsonString(), "application/json");
        });
        g.MapPost(V28 + "/groups", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "iam.manage_roles");
            var name = Text(body?["name"], 90);
            if (name.Length < 2) throw Fail("Enter a group name");
            var groups = await Doc(db, "iam_groups") as JsonArray ?? [];
            if (groups.OfType<JsonObject>().Any(x => string.Equals((string?)x["name"], name, StringComparison.OrdinalIgnoreCase))) throw Fail("Group name already exists", 409);
            var row = new JsonObject { ["id"] = NextId(groups), ["created_at"] = Iso(DateTime.UtcNow), ["name"] = name, ["description"] = "", ["user_ids"] = new JsonArray() };
            groups.Add(row); await SetDoc(db, "iam_groups", groups);
            await Changed(db, a, "group-created", (long)row["id"]!, new { name });
            await db.SaveChangesAsync();
            return Results.Text(row.ToJsonString(), "application/json");
        });
        g.MapPut(V28 + "/groups/{id:long}", async (long id, HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "iam.manage_roles");
            var groups = await Doc(db, "iam_groups") as JsonArray ?? [];
            var group = groups.OfType<JsonObject>().FirstOrDefault(x => (long?)x["id"] == id) ?? throw Fail("Group not found", 404);
            var name = Text(body?["name"] ?? group["name"], 90);
            if (name.Length < 2) throw Fail("Group name required");
            if (groups.OfType<JsonObject>().Any(x => (long?)x["id"] != id && string.Equals((string?)x["name"], name, StringComparison.OrdinalIgnoreCase))) throw Fail("Group name exists", 409);
            if (body?["user_ids"] is not JsonArray raw || raw.Count > 2000) throw Fail("Select members");
            var nums = raw.Select(x => Number(x)).ToArray();
            var allowed = (await VisibleUsers(db, a)).Select(u => u.Id).ToHashSet();
            if (nums.Any(n => n is null || double.IsNaN(n.Value) || n % 1 != 0 || !allowed.Contains((long)n.Value))) throw Fail("Invalid or inaccessible group member", 403);
            var ids = nums.Select(n => (long)n!.Value).Distinct().ToArray();
            var touched = Ids(group).Concat(ids).Distinct().ToArray();
            group["name"] = name; group["description"] = Text(body!["description"] ?? group["description"], 250);
            group["user_ids"] = new JsonArray(ids.Select(x => (JsonNode)x).ToArray());
            await SetDoc(db, "iam_groups", groups);
            var revoked = await RevokeSessions(db, touched);
            await Changed(db, a, "group-updated", id, new { users = ids.Length, revoked_sessions = revoked });
            await db.SaveChangesAsync();
            var o = (JsonObject)group.DeepClone(); o["revoked_sessions"] = revoked;
            return Results.Text(o.ToJsonString(), "application/json");
        });
        g.MapDelete(V28 + "/groups/{id:long}", async (long id, HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "iam.manage_roles");
            var groups = await Doc(db, "iam_groups") as JsonArray ?? [];
            var group = groups.OfType<JsonObject>().FirstOrDefault(x => (long?)x["id"] == id) ?? throw Fail("Group not found", 404);
            if ((await Doc(db, "iam_access_rules_v28") as JsonArray ?? []).OfType<JsonObject>().Any(r => (string?)r["subject_type"] == "group" && SubjectId(r) == id.ToString()))
                throw Fail("Remove the group’s access rules before deleting it", 409);
            var revoked = await RevokeSessions(db, Ids(group));
            groups.Remove(group); await SetDoc(db, "iam_groups", groups);
            await Changed(db, a, "group-deleted", id, new { revoked_sessions = revoked });
            await db.SaveChangesAsync();
            return Results.Ok(new { deleted = true, revoked_sessions = revoked });
        });
        g.MapGet(V28 + "/rules", async (HttpContext h, GdsDbContext db) =>
        {
            Require(await ActorOf(db, h.User), "iam.manage_roles");
            var rules = (await Doc(db, "iam_access_rules_v28") as JsonArray ?? []).OfType<JsonObject>().OrderByDescending(r => (long?)r["id"]).Select(r => (JsonNode)r.DeepClone()).ToArray();
            return Results.Text(new JsonObject { ["revision"] = await Revision(db, "team_rules_revision_v28"), ["rules"] = new JsonArray(rules), ["templates"] = Schema["rule_templates"]!.DeepClone() }.ToJsonString(), "application/json");
        });
        g.MapPost(V28 + "/rules", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "iam.manage_roles");
            var rules = await Doc(db, "iam_access_rules_v28") as JsonArray ?? [];
            if (rules.Count > 500) throw Fail("Rule capacity reached", 409);
            var cfg = await ValidateRule(db, a, body ?? new JsonObject(), null);
            var row = new JsonObject { ["id"] = NextId(rules), ["created_at"] = Iso(DateTime.UtcNow) };
            foreach (var (k, v) in cfg) row[k] = v?.DeepClone();
            row["created_by"] = a.Id;
            rules.Add(row); await SetDoc(db, "iam_access_rules_v28", rules);
            var revoked = await RevokeSessions(db, await Affected(db, cfg));
            await Changed(db, a, "rule-created", (long)row["id"]!, new { action_key = (string?)row["action_key"], subject = (string?)row["subject_type"], revoked });
            await db.SaveChangesAsync();
            var o = (JsonObject)row.DeepClone(); o["revoked_sessions"] = revoked;
            return Results.Text(o.ToJsonString(), "application/json");
        });
        g.MapPut(V28 + "/rules/{id:long}", async (long id, HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "iam.manage_roles");
            var rules = await Doc(db, "iam_access_rules_v28") as JsonArray ?? [];
            var old = rules.OfType<JsonObject>().FirstOrDefault(x => (long?)x["id"] == id) ?? throw Fail("Rule not found", 404);
            var cfg = await ValidateRule(db, a, body ?? new JsonObject(), old);
            var prev = await Affected(db, old);
            foreach (var (k, v) in cfg) old[k] = v?.DeepClone();
            await SetDoc(db, "iam_access_rules_v28", rules);
            var revoked = await RevokeSessions(db, prev.Concat(await Affected(db, cfg)));
            await Changed(db, a, "rule-updated", id, new { revoked_sessions = revoked });
            await db.SaveChangesAsync();
            var o = (JsonObject)old.DeepClone(); o["revoked_sessions"] = revoked;
            return Results.Text(o.ToJsonString(), "application/json");
        });
        g.MapDelete(V28 + "/rules/{id:long}", async (long id, HttpContext h, GdsDbContext db) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "iam.manage_roles");
            var rules = await Doc(db, "iam_access_rules_v28") as JsonArray ?? [];
            var rule = rules.OfType<JsonObject>().FirstOrDefault(x => (long?)x["id"] == id) ?? throw Fail("Rule not found", 404);
            var affected = await Affected(db, rule);
            rules.Remove(rule); await SetDoc(db, "iam_access_rules_v28", rules);
            var revoked = await RevokeSessions(db, affected);
            await Changed(db, a, "rule-deleted", id, new { revoked_sessions = revoked });
            await db.SaveChangesAsync();
            return Results.Ok(new { deleted = true, revoked_sessions = revoked });
        });
        g.MapPost(V28 + "/test", async (HttpContext h, GdsDbContext db, JsonObject? body) =>
        {
            var a = await ActorOf(db, h.User); Require(a, "settings.view");
            return Results.Text((await AccessPolicy.Test(db, a, body ?? new JsonObject())).ToJsonString(), "application/json");
        });
    }

    // ---------------- helpers ----------------
    private static async Task<List<AppUser>> VisibleUsers(GdsDbContext db, Actor a) =>
        (await db.Users.AsNoTracking().Where(u => u.DeletedAt == null).ToListAsync()).Where(u => Visible(a, u)).ToList();
    internal static IEnumerable<long> Ids(JsonObject gr) => (gr["user_ids"] as JsonArray ?? []).Select(x => Number(x)).Where(x => x is { } d && !double.IsNaN(d)).Select(x => (long)x!.Value);
    internal static string? SubjectId(JsonObject r) => r["subject_id"] is JsonValue v ? (v.GetValueKind() == JsonValueKind.String ? v.GetValue<string>() : v.ToJsonString()) : null;
    private static long NextId(JsonArray rows) => rows.OfType<JsonObject>().Select(x => (long?)x["id"] ?? 0).DefaultIfEmpty(0).Max() + 1;
    private static async Task<int> SubAgents(GdsDbContext db, long id) =>
        (await db.Users.AsNoTracking().Where(x => x.DeletedAt == null && x.ProfileJson != null).ToListAsync()).Count(x => ProfileOf(x).MasterAgentId == id);
    private static async Task Changed(GdsDbContext db, Actor a, string kind, long id, object details)
    {
        await SetDoc(db, "team_rules_revision_v28", JsonValue.Create(await Revision(db, "team_rules_revision_v28") + 1));
        Audit(db, a.Name, kind, id.ToString(), details);
    }
    private static async Task<long[]> Affected(GdsDbContext db, JsonObject rule)
    {
        var st = (string?)rule["subject_type"]; var sid = SubjectId(rule);
        var users = await db.Users.AsNoTracking().ToListAsync();
        if (st == "person") return sid is not null && long.TryParse(sid, out var pid) ? [pid] : [];
        if (st == "group")
            return (await Doc(db, "iam_groups") as JsonArray ?? []).OfType<JsonObject>().FirstOrDefault(gr => ((long?)gr["id"])?.ToString() == sid) is { } grp ? Ids(grp).ToArray() : [];
        return users.Where(u => st == "all" || RoleOf(u) == sid).Select(u => u.Id).ToArray();
    }

    private static Dictionary<string, string> Snapshot(AppUser u) => new()
    {
        ["name"] = u.Name, ["email"] = u.Email ?? "", ["role"] = RoleOf(u), ["status"] = u.Status, ["branch_id"] = u.BranchId?.ToString() ?? "",
        ["commission_pct"] = (u.CommissionPct ?? 0).ToString(System.Globalization.CultureInfo.InvariantCulture), ["credit_limit"] = (u.CreditLimit ?? 0).ToString(System.Globalization.CultureInfo.InvariantCulture),
        ["profile"] = ProfileJson(ProfileOf(u)),
    };

    private static void CanManage(Actor a, AppUser target, JsonObject b, string method)
    {
        if (!a.Permissions.Contains("iam.manage_users")) throw Fail("Cannot manage users", 403);
        var role = RoleOf(target);
        if (role == "owner" && a.Role != "owner") throw Fail("Only the owner can manage owners", 403);
        if (target.Id == a.Id && method == "DELETE") throw Fail("Cannot delete your own account", 403);
        if (target.Id == a.Id && Text(b["status"]) == "INACTIVE") throw Fail("Cannot deactivate yourself", 403);
        if (target.Id == a.Id && Truthy(b["role"]) && Text(b["role"]) != a.Role) throw Fail("Cannot change your own role", 403);
        if (a.Role is not ("owner" or "admin") && R(role) >= R(a.Role)) throw Fail("Cannot manage a higher or equal role", 403);
    }

    private static void AllowBranchEdit(Actor a)
    {
        if (a.Role is not ("owner" or "admin")) throw Fail("Only owners and admins can manage branches", 403);
    }

    /// <summary>Legacy <c>userPayload</c>: validates and applies the editable profile onto <paramref name="u"/>.</summary>
    private static async Task Apply(GdsDbContext db, Actor a, JsonObject b, AppUser u, bool isNew)
    {
        var old = isNew ? null : u;
        var p = isNew ? new Profile() : ProfileOf(u);
        var roles = await Roles(db);
        var mode = Has(b, "mode") ? Text(b["mode"]) : (old is null ? "Online" : p.Mode);
        if (mode is not ("Online" or "Offline")) throw Fail("Invalid agent mode");
        var role = !IsNull(b["role"]) ? Text(b["role"], 60) : old is null ? "booking_executive" : RoleOf(old);
        var cat = Truthy(b["category"]) ? Text(b["category"]) : role == "agent" ? "agents" : CrewRoles.Contains(role) ? "bus-staff" : "office-staff";
        if (cat is not ("agents" or "office-staff" or "bus-staff")) throw Fail("Invalid user category");
        if (!roles.ContainsKey(role)) throw Fail("Unknown role");
        if (role == "owner" && a.Role != "owner") throw Fail("Only owner may assign owner", 403);
        if (R(role, 30) > R(a.Role)) throw Fail("Cannot assign role above your own", 403);
        if (cat == "agents" && role != "agent") throw Fail("Agent section requires Agent role");
        if (cat == "bus-staff" && !CrewRoles.Contains(role)) throw Fail("Bus staff must have an appropriate crew role");
        var name = Text(!IsNull(b["name"]) ? b["name"] : old?.Name, 140);
        if (name.Length == 0) name = Text(old?.Phone ?? Text(b["phone"]), 10);
        var email = Text(!IsNull(b["email"]) ? b["email"] : old?.Email, 150);
        if (email.Length > 0 && !Regex.IsMatch(email, @"^[^\s@]+@[^\s@]+\.[^\s@]+$")) throw Fail("Invalid email");
        var status = !IsNull(b["status"]) ? Text(b["status"]) : old?.Status ?? "ACTIVE";
        if (status is not ("ACTIVE" or "INACTIVE")) throw Fail("Invalid account status");
        var commission = Has(b, "commission_pct") ? Number(b["commission_pct"]) ?? 0 : (double)(old?.CommissionPct ?? 0);
        var credit = Has(b, "credit_limit") ? Number(b["credit_limit"]) ?? 0 : (double)(old?.CreditLimit ?? 0);
        var agentType = !IsNull(b["agent_type"]) ? Text(b["agent_type"]) : old is null ? "postpaid" : p.AgentType;
        if (!double.IsFinite(commission) || commission < 0 || commission > 100) throw Fail("Commission must be between 0 and 100%");
        if (!double.IsFinite(credit) || credit < 0) throw Fail("Credit limit cannot be negative");
        if (agentType is not ("prepaid" or "postpaid")) throw Fail("Invalid settlement type");
        var agentCategory = !IsNull(b["agent_category"]) ? Text(b["agent_category"]) : old is null ? "agent" : p.AgentCategory;
        if (role == "agent" && agentCategory is not ("agent" or "master_agent")) throw Fail("Invalid agent type");
        long? branchId = old?.BranchId;
        if (Has(b, "branch_id"))
        {
            var raw = b["branch_id"];
            if (IsNull(raw) || Text(raw) == "") branchId = null;
            else
            {
                var n = Number(raw);
                if (n is null || double.IsNaN(n.Value) || n % 1 != 0 || !await db.Branches.AnyAsync(x => x.Id == (long)n.Value)) throw Fail("Branch not found");
                branchId = (long)n.Value;
            }
        }
        var limit = Has(b, "limit_routes") && !IsNull(b["limit_routes"]) ? Truthy(b["limit_routes"]) : old is not null && p.LimitRoutes;
        var routes = p.RouteIds;
        if (Has(b, "route_ids"))
        {
            if (b["route_ids"] is not JsonArray arr) routes = [];
            else
            {
                var sel = arr.Select(x => Number(x)).Distinct().ToArray();
                var known = await db.Routes.Select(r => r.Id).ToListAsync();
                if (sel.Length > 150 || sel.Any(x => x is null || double.IsNaN(x.Value) || x % 1 != 0 || !known.Contains((long)x.Value))) throw Fail("Unknown route assignment");
                if (limit && sel.Length == 0) throw Fail("Select at least one permitted route");
                routes = sel.Select(x => (long)x!.Value).ToArray();
            }
        }
        if (limit && routes.Length == 0) throw Fail("At least one allowed route is required");
        string[] tags = p.CorridorTags;
        if (Has(b, "corridor_tags") && !IsNull(b["corridor_tags"]))
        {
            if (b["corridor_tags"] is not JsonArray ta || ta.Count > 20) throw Fail("Corridor tags must be a short list");
            tags = ta.Select(x => Text(x, 32).ToLowerInvariant()).Where(x => x.Length > 0).Distinct().ToArray();
            if (tags.Any(t => !Regex.IsMatch(t, "^[a-z0-9][a-z0-9_-]{0,31}$"))) throw Fail("Corridor tags must use letters, numbers, hyphens or underscores");
        }
        var language = Text(!IsNull(b["language"]) ? b["language"] : (JsonNode)p.Language, 40);
        if (language.Length == 0) language = "English";
        if (!Languages.Contains(language)) throw Fail("Unsupported language");
        long? master = p.MasterAgentId;
        if (Has(b, "master_agent_id"))
            master = IsNull(b["master_agent_id"]) || Text(b["master_agent_id"]) is "" or "0" ? null : (long?)(Number(b["master_agent_id"]) is { } m && !double.IsNaN(m) ? (long)m : -1);
        if (master is { } mid)
        {
            if (old is not null && mid == old.Id) throw Fail("An agent cannot be their own master");
            var mu = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == mid);
            if (mu is null || RoleOf(mu) != "agent" || ProfileOf(mu).AgentCategory != "master_agent" || mu.DeletedAt is not null) throw Fail("Master agent not found");
            if (ProfileOf(mu).MasterAgentId is not null) throw Fail("Nested master-agent structures are not supported");
        }
        string[] extra = p.ExtraPermissions, deny = p.DeniedPermissions;
        if (Has(b, "extra_permissions") || Has(b, "denied_permissions"))
        {
            string[] L(string k, string[] dflt) => b[k] is JsonArray x ? x.Select(y => Text(y, 80)).Distinct().ToArray() : Has(b, k) ? [] : dflt;
            extra = L("extra_permissions", p.ExtraPermissions); deny = L("denied_permissions", p.DeniedPermissions);
            var codes = Catalog.ToHashSet();
            if (extra.Any(x => !codes.Contains(x)) || deny.Any(x => !codes.Contains(x))) throw Fail("Unknown permission code");
            if (extra.Any(x => !a.Permissions.Contains(x))) throw Fail("Cannot grant privileges you do not possess", 403);
            if (extra.Any(deny.Contains)) throw Fail("A permission cannot be both allowed and denied");
        }
        u.Name = name; u.Email = email.Length > 0 ? email : null; u.LegacyRole = role; u.Role = ModernRole(role); u.BranchId = branchId;
        u.Status = role == "agent" && mode == "Offline" ? "INACTIVE" : status;
        u.CommissionPct = (decimal)commission; u.CreditLimit = (decimal)credit;
        u.ProfileJson = ProfileJson(new Profile
        {
            Language = language, Mode = role == "agent" ? mode : "Online", AgentCategory = role == "agent" ? agentCategory : "agent", AgentType = agentType,
            MasterAgentId = role == "agent" ? master : null, LimitRoutes = limit, RouteIds = routes, ExtraPermissions = extra, DeniedPermissions = deny, CorridorTags = tags,
        });
    }

    /// <summary>Legacy <c>syncStaff</c>: crew/managers/owners added as users also appear under Staff (matched by phone).</summary>
    private static async Task SyncStaff(GdsDbContext db, AppUser u)
    {
        var role = RoleOf(u);
        if (role is not ("driver" or "helper" or "conductor" or "manager" or "owner")) return;
        var cur = (await db.Staff.ToListAsync()).FirstOrDefault(s => NormPhone(s.Phone) == NormPhone(u.Phone));
        if (cur is null)
            db.Staff.Add(new Staff { Id = (await db.Staff.IgnoreQueryFilters().MaxAsync(x => (long?)x.Id) ?? 0) + 1, TenantId = db.CurrentTenantId, Name = u.Name, Phone = u.Phone, Role = role, Status = "active", SalaryType = "monthly", SalaryAmount = 0 });
        else cur.Name = u.Name;
    }

    /// <summary>Legacy <c>branchInput</c>.</summary>
    private static async Task BranchInput(GdsDbContext db, JsonObject b, Branch row, JsonObject? old)
    {
        var code = Text(b["code"] ?? old?["code"], 16).ToUpperInvariant(); var name = Text(b["name"] ?? old?["name"], 120);
        if (!Regex.IsMatch(code, "^[A-Z0-9][A-Z0-9_-]{1,15}$")) throw Fail("Branch code must be 2–16 uppercase letters, digits, hyphen or underscore");
        if (name.Length == 0) throw Fail("Branch name required");
        if ((await db.Branches.AsNoTracking().ToListAsync()).Any(x => x.Id != row.Id && string.Equals(x.Code, code, StringComparison.OrdinalIgnoreCase))) throw Fail("Branch code already exists", 409);
        var area = Text(b["operations_area"] ?? old?["operations_area"] ?? "sales_only");
        if (area is not ("sales_only" or "cities" or "routes" or "both")) throw Fail("Unknown operations area");
        var cityKnown = (await db.Cities.Select(c => c.Id).ToListAsync()).ToHashSet();
        long? cid = row.CityId;
        if (Has(b, "city_id"))
        {
            if (IsNull(b["city_id"]) || Text(b["city_id"]) == "") cid = null;
            else if (Number(b["city_id"]) is not { } n || double.IsNaN(n) || n % 1 != 0 || !cityKnown.Contains((long)n)) throw Fail("Unknown city");
            else cid = (long)n;
        }
        long[] cityIds = b["operation_city_ids"] is JsonArray ca ? ca.Select(x => (long)(Number(x) ?? -1)).Distinct().ToArray() : (old?["operation_city_ids"] as JsonArray)?.Select(x => (long)(Number(x) ?? -1)).ToArray() ?? [];
        if (cityIds.Any(id => !cityKnown.Contains(id))) throw Fail("Invalid operational city");
        long[] routeIds;
        if (b["operation_route_ids"] is JsonArray ra)
        {
            var known = (await db.Routes.Select(r => r.Id).ToListAsync()).ToHashSet();
            var sel = ra.Select(x => Number(x)).Distinct().ToArray();
            if (sel.Length > 150 || sel.Any(x => x is null || double.IsNaN(x.Value) || x % 1 != 0 || !known.Contains((long)x.Value))) throw Fail("Unknown route assignment");
            routeIds = sel.Select(x => (long)x!.Value).ToArray();
        }
        else routeIds = (old?["operation_route_ids"] as JsonArray)?.Select(x => (long)(Number(x) ?? -1)).ToArray() ?? [];
        if (area is "cities" or "both" && cityIds.Length == 0 && cid is null) throw Fail("Choose at least one operating city");
        if (area is "routes" or "both" && routeIds.Length == 0) throw Fail("Choose at least one operating route");
        var phone = NormPhone(Text(b["phone"] ?? old?["phone"], 40));
        if (phone.Length > 0 && !Regex.IsMatch(phone, "^[6-9][0-9]{9}$")) throw Fail("Enter a valid 10-digit contact phone");
        row.Code = code; row.Name = name; row.CityId = cid; row.Phone = phone; row.Address = Text(b["address"] ?? old?["address"], 300);
        row.ExtraJson = new JsonObject
        {
            ["city"] = Text(b["city"] ?? old?["city"], 100), ["operations_area"] = area,
            ["operation_city_ids"] = new JsonArray(cityIds.Select(x => (JsonNode)x).ToArray()), ["operation_route_ids"] = new JsonArray(routeIds.Select(x => (JsonNode)x).ToArray()),
        }.ToJsonString();
    }

    // ---------------- role matrix (legacy PUT /team-access/v26/roles/batch) ----------------
    private static bool AllowedValue(JsonObject row, string v, bool ignoreChoices = false) =>
        !ignoreChoices && row["choices"] is JsonArray ch ? ch.Any(x => (string?)x == v)
        : (string?)row["kind"] == "scope" ? v is "Off" or "Own" or "Branch" or "Company" : v is "Off" or "On";

    public static string RoleValue(string roleKey, JsonObject role, JsonObject row)
    {
        if (!Available(row, roleKey)) return "—";
        var key = (string)row["key"]!; var label = (string)row["label"]!; var scope = (string?)row["kind"] == "scope";
        if (role["matrix_v27"] is JsonObject m && m.ContainsKey(key)) return (string)m[key]!;
        var legacy = LegacyFor(label) ?? label;
        if (role["scopes"] is JsonObject s) { if (s.ContainsKey(label)) return (string)s[label]!; if (s.ContainsKey(legacy)) return (string)s[legacy]!; }
        if (role["ui_permissions"] is JsonObject ui)
        {
            if (ui.ContainsKey(label)) return ui[label]!.GetValue<bool>() ? (scope ? "Company" : "On") : "Off";
            if (ui.ContainsKey(legacy)) return ui[legacy]!.GetValue<bool>() ? (scope ? "Company" : "On") : "Off";
        }
        return (role["permissions"] as JsonArray ?? []).Any(x => (string?)x == (string?)row["code"]) ? (scope ? "Company" : "On") : "Off";
    }

    private static readonly Dictionary<string, string[]> Implied = new()
    {
        ["bookings.comments"] = ["bookings.view_all"], ["bookings.on_behalf"] = ["bookings.create"], ["bookings.see_phone"] = ["bookings.view_all"],
        ["schedules.assign_bus"] = ["schedules.modify"], ["schedules.assign_crew"] = ["schedules.modify"], ["schedules.edit_expenses"] = ["schedules.financial"],
        ["accounts.export"] = ["accounts.view"],
    };

    private static async Task<JsonObject> SaveMatrix(GdsDbContext db, Actor a, JsonObject body)
    {
        if (body["roles"] is not JsonArray list || list.Count == 0 || list.Count > 30) throw Fail("Invalid role matrix");
        var revision = await Revision(db, "team_matrix_revision_v27");
        if (Has(body, "base_revision") && Number(body["base_revision"]) != revision)
            throw Fail("Permission matrix changed in another session. Reload and review before saving.", 409);
        var saved = await Doc(db, "roles") as JsonObject ?? new JsonObject();
        var existing = await Roles(db);
        var catalog = Catalog.ToHashSet();
        var controlled = Rows.Select(r => (string)r["code"]!).ToHashSet();
        var seen = new HashSet<string>(); var changes = new List<string>();
        foreach (var itemNode in list)
        {
            if (itemNode is not JsonObject item || item["key"] is not JsonValue kv || kv.GetValueKind() != JsonValueKind.String) throw Fail("Unknown, repeated or owner role");
            var key = kv.GetValue<string>();
            if (key == "owner" || !existing.ContainsKey(key) || !seen.Add(key)) throw Fail("Unknown, repeated or owner role");
            if (item["matrix"] is not JsonObject matrixIn) throw Fail("Invalid role matrix data");
            if (matrixIn.Any(x => RowByKey(x.Key) is null && RowByLabel(x.Key) is null)) throw Fail("Unknown matrix permission row");
            if (Has(item, "limits") && (item["limits"] is not JsonObject lim || lim.Any(x => !((JsonObject)Schema["limit_fields"]!).ContainsKey(x.Key)))) throw Fail("Unknown role limit");
            var role = (JsonObject)existing[key]!.DeepClone();
            var matrix = role["matrix_v27"] as JsonObject ?? new JsonObject();
            var ui = role["ui_permissions"] as JsonObject ?? new JsonObject();
            var scopes = role["scopes"] as JsonObject ?? new JsonObject();
            var limits = role["limits"] as JsonObject ?? new JsonObject();
            var origMatrix = matrix.ToJsonString(); var origLimits = limits.ToJsonString();
            var enabled = new HashSet<string>();
            foreach (var row in Rows)
            {
                var rk = (string)row["key"]!; var label = (string)row["label"]!;
                var supplied = matrixIn.ContainsKey(rk) ? matrixIn[rk] : matrixIn.ContainsKey(label) ? matrixIn[label] : null;
                var current = RoleValue(key, role, row);
                var v = supplied is null ? (current == "—" ? "Off" : current) : Text(supplied);
                if (!AllowedValue(row, v) && !(supplied is null && AllowedValue(row, v, ignoreChoices: true))) throw Fail("Invalid access selection for " + label);
                if (!Available(row, key) && v != "Off") throw Fail(label + " is not available to " + (string?)role["name"], 403);
                if (Available(row, key))
                {
                    matrix[rk] = v; ui[label] = v != "Off";
                    if ((string?)row["kind"] == "scope") scopes[label] = v;
                    if (v != "Off") enabled.Add((string)row["code"]!);
                }
                else { matrix.Remove(rk); ui.Remove(label); scopes.Remove(label); }
            }
            if (item["limits"] is JsonObject li)
                foreach (var (lk, lv) in li)
                {
                    if (IsNull(lv) || Text(lv) == "") { limits[lk] = null; continue; }
                    var n = Number(lv); var max = (double)Schema["limit_fields"]![lk]!["max"]!;
                    if (n is null || double.IsNaN(n.Value) || n % 1 != 0 || n < 0 || n > max || (lk == "block_max_seats" && n == 0)) throw Fail("Invalid " + lk + " limit");
                    limits[lk] = (long)n.Value;
                }
            if ((string?)matrix[(string)RowByLabel("Cancel tickets")!["key"]!] == "Off") limits["cancel_cutoff_hours"] = null;
            if ((string?)matrix[(string)RowByLabel("Block seats")!["key"]!] == "Off") { limits["block_max_seats"] = null; limits["block_max_hours"] = null; }
            foreach (var code in enabled.ToArray()) foreach (var parent in Implied.GetValueOrDefault(code, [])) enabled.Add(parent);
            var oldPerms = (role["permissions"] as JsonArray ?? []).Select(x => (string)x!).ToArray();
            var codes = oldPerms.Where(c => !controlled.Contains(c)).Concat(enabled).Distinct().Where(catalog.Contains).ToArray();
            var update = new JsonObject();
            foreach (var (k, v) in role) update[k] = v?.DeepClone();
            update["name"] = role["name"]?.DeepClone();
            update["permissions"] = new JsonArray(codes.Select(c => (JsonNode)c).ToArray());
            update["scopes"] = scopes.DeepClone(); update["ui_permissions"] = ui.DeepClone(); update["matrix_v27"] = matrix.DeepClone(); update["limits"] = limits.DeepClone();
            saved[key] = update;
            if (!oldPerms.SequenceEqual(codes) || origMatrix != matrix.ToJsonString() || origLimits != limits.ToJsonString()) changes.Add(key);
        }
        if (changes.Count == 0) return new JsonObject { ["saved"] = true, ["roles"] = new JsonArray(), ["revoked_sessions"] = 0, ["matrix_revision"] = revision };
        await SetDoc(db, "roles", saved);
        await SetDoc(db, "team_matrix_revision_v27", JsonValue.Create(revision + 1));
        Audit(db, a.Name, "batch-update-v27", "role-matrix", new { updated_roles = changes });
        var affected = (await db.Users.AsNoTracking().ToListAsync()).Where(u => changes.Contains(RoleOf(u))).Select(u => u.Id);
        var revoked = await RevokeSessions(db, affected);
        await db.SaveChangesAsync();
        return new JsonObject { ["saved"] = true, ["roles"] = new JsonArray(changes.Select(c => (JsonNode)c).ToArray()), ["revoked_sessions"] = revoked, ["matrix_revision"] = revision + 1 };
    }

    // ---------------- access rules (legacy validateRule) ----------------
    private static async Task<JsonObject> ValidateRule(GdsDbContext db, Actor a, JsonObject b, JsonObject? old)
    {
        JsonNode? P(string k) => Has(b, k) ? b[k] : old?[k];
        var name = Text(P("name"), 120); var effect = Text(P("effect")); var actionKey = Text(P("action_key")); var subjectType = Text(P("subject_type"));
        var raw = Has(b, "subject_id") ? b["subject_id"] : old?["subject_id"];
        JsonNode? subjectId = subjectType == "all" ? null : raw?.DeepClone();
        var sid = subjectId is JsonValue sv ? (sv.GetValueKind() == JsonValueKind.String ? sv.GetValue<string>() : sv.ToJsonString()) : null;
        if (name.Length < 3) throw Fail("Rule name must contain at least three characters");
        if (effect is not ("deny" or "limit")) throw Fail("Rule must deny or limit; rules cannot grant access");
        if (actionKey != "*" && RowByKey(actionKey) is null) throw Fail("Choose a known action");
        if (actionKey == "*" && effect != "deny") throw Fail("All-action rules must be restrictive");
        if (subjectType is not ("all" or "role" or "group" or "person")) throw Fail("Choose role, group, person or everyone");
        if (subjectType == "role" && (sid is null || !(await Roles(db)).ContainsKey(sid) || (sid == "owner" && a.Role != "owner"))) throw Fail("Invalid role target");
        if (subjectType == "group" && !(await Doc(db, "iam_groups") as JsonArray ?? []).OfType<JsonObject>().Any(gr => ((long?)gr["id"])?.ToString() == sid)) throw Fail("Group not found");
        if (subjectType == "person")
        {
            var u = long.TryParse(sid, out var pid) ? await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == pid) : null;
            if (u is null || u.DeletedAt is not null || !Visible(a, u)) throw Fail("Person not found in accessible directory", 403);
        }
        var c = (Has(b, "condition") ? b["condition"] : old?["condition"]) ?? new JsonObject { ["kind"] = "always" };
        if (c is not JsonObject co) throw Fail("Invalid rule condition");
        var kind = Text(co["kind"]);
        if (kind is not ("always" or "departure_within_hours" or "corridor_mismatch" or "write_action")) throw Fail("Unknown condition");
        if (kind == "write_action" && (actionKey != "*" || effect != "deny")) throw Fail("Read-only rules must deny write actions");
        if (actionKey == "*" && kind != "write_action") throw Fail("All-action rule requires write-action condition");
        var cancelKey = (string)RowByLabel("Cancel tickets")!["key"]!; var blockKey = (string)RowByLabel("Block seats")!["key"]!;
        double hours = 0;
        if (kind == "departure_within_hours")
        {
            if (effect != "deny" || actionKey != cancelKey) throw Fail("Time-based cancellation rule requires Cancel tickets");
            var hn = Number(co["hours"]);
            if (hn is null || double.IsNaN(hn.Value) || hn % 1 != 0 || hn < 0 || hn > 8760) throw Fail("Departure threshold must be between 0 and 8760 hours");
            hours = hn.Value;
        }
        if (kind == "corridor_mismatch" && (effect != "deny" || actionKey != blockKey)) throw Fail("Corridor restriction applies only to Block seats");
        var limits = (Has(b, "limits") ? b["limits"] : old?["limits"]) ?? new JsonObject();
        if (limits is not JsonObject lo || lo.Any(x => x.Key is not ("max_seats" or "max_hours"))) throw Fail("Invalid rule limits");
        if (effect == "limit" && (actionKey != blockKey || kind != "always" || lo.Count == 0)) throw Fail("Limits only apply to Block seats");
        var outLimits = new JsonObject();
        foreach (var (k, v) in lo)
        {
            var n = Number(v);
            if (n is null || double.IsNaN(n.Value) || n % 1 != 0 || n < 1 || n > (k == "max_seats" ? 500 : 8760)) throw Fail("Invalid " + k + " limit");
            outLimits[k] = (long)n.Value;
        }
        if (effect == "deny" && lo.Count > 0) throw Fail("Deny rules cannot carry seat limits");
        var enabled = Has(b, "enabled") ? b["enabled"] is JsonValue ev && ev.GetValueKind() == JsonValueKind.True : !(old?["enabled"] is JsonValue oe && oe.GetValueKind() == JsonValueKind.False);
        return new JsonObject
        {
            ["name"] = name, ["effect"] = effect, ["action_key"] = actionKey, ["subject_type"] = subjectType, ["subject_id"] = subjectId,
            ["condition"] = kind == "departure_within_hours" ? new JsonObject { ["kind"] = kind, ["hours"] = (long)hours } : new JsonObject { ["kind"] = kind },
            ["limits"] = outLimits, ["enabled"] = enabled, ["template_id"] = Text(P("template_id"), 65),
        };
    }
}
