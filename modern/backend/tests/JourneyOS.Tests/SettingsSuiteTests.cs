using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace JourneyOS.Tests;

/// <summary>Settings suite: Team &amp; access (v26/v28 + policy test), configuration v30/v31, branding, loyalty v34, About, WhatsApp, sessions.</summary>
[Collection("gds")]
public sealed class SettingsSuiteTests(GdsFixture fx)
{
    private HttpClient Admin => fx.Factory.Admin();

    private async Task<(HttpStatusCode, JsonNode?)> Send(HttpMethod m, string url, object? body = null)
    {
        var req = new HttpRequestMessage(m, url) { Content = body is null ? null : JsonContent.Create(body) };
        var r = await Admin.SendAsync(req);
        var text = await r.Content.ReadAsStringAsync();
        return (r.StatusCode, string.IsNullOrWhiteSpace(text) ? null : JsonNode.Parse(text));
    }
    private static string Msg(JsonNode? n) => (string?)n?["message"] ?? "";

    [Fact]
    public async Task Team_access_directory_exposes_legacy_matrix_and_policy_test_validates_inputs()
    {
        var dir = await Admin.GetJson("/api/admin/team-access/v26");
        Assert.Equal(27, (int)dir["matrix_version"]!);
        Assert.NotEmpty(dir["matrix"]!.AsArray());
        Assert.Contains(dir["roles"]!.AsArray(), r => (string)r!["key"]! == "owner" && (bool)r["builtin"]!);

        var catalog = await Admin.GetJson("/api/admin/team-access/v28/catalog");
        var key = (string)catalog["actions"]![0]!["key"]!;
        var (s1, e1) = await Send(HttpMethod.Post, "/api/admin/team-access/v28/test", new { phone = "12", action_key = key });
        Assert.Equal(HttpStatusCode.BadRequest, s1); Assert.Equal("Enter a 10-digit mobile number", Msg(e1));
        var (s2, e2) = await Send(HttpMethod.Post, "/api/admin/team-access/v28/test", new { phone = "9999999999", action_key = "nope" });
        Assert.Equal(HttpStatusCode.BadRequest, s2); Assert.Equal("Choose a permission to check", Msg(e2));
        var (s3, e3) = await Send(HttpMethod.Post, "/api/admin/team-access/v28/test", new { phone = "9999999999", action_key = key, situation = new { bogus = 1 } });
        Assert.Equal(HttpStatusCode.BadRequest, s3); Assert.StartsWith("Unknown situation field", Msg(e3));
        var (s4, ok) = await Send(HttpMethod.Post, "/api/admin/team-access/v28/test", new { phone = "9999999999", action_key = key, situation = new { seat_count = 2 } });
        Assert.Equal(HttpStatusCode.OK, s4);
        Assert.Equal("allow", (string)ok!["decision"]!);
        Assert.Equal(["seat_count"], ok["situation_evidence"]!["provided"]!.AsArray().Select(x => (string)x!));
    }

    [Fact]
    public async Task Configuration_v30_validates_sections_persists_and_syncs_operator()
    {
        var cfg = await Admin.GetJson("/api/admin/settings/config-v30");
        Assert.False((bool)cfg["delivery_connected"]!);
        Assert.Equal("gender", (string)cfg["sections"]!["seats"]!["fill_seats_by"]!);

        Assert.Equal("Unknown setting field", Msg((await Send(HttpMethod.Put, "/api/admin/settings/config-v30/business", new { nope = 1 })).Item2));
        Assert.Equal("Invalid GSTIN", Msg((await Send(HttpMethod.Put, "/api/admin/settings/config-v30/business", new { gst_number = "BAD" })).Item2));
        Assert.Equal("Default hold cannot exceed maximum hold", Msg((await Send(HttpMethod.Put, "/api/admin/settings/config-v30/office", new { default_hold = 60, max_hold = 30 })).Item2));
        Assert.Equal("Overspeed threshold must be a number between 0 and 250", Msg((await Send(HttpMethod.Put, "/api/admin/settings/config-v30/vehicle", new { overspeed_speed_limit_kmh = 300 })).Item2));
        Assert.Equal("Managed calling line is configured by the connected provider", Msg((await Send(HttpMethod.Put, "/api/admin/settings/config-v30/communications", new { savetrip_line = "1" })).Item2));

        var tagline = "Tagline " + Guid.NewGuid().ToString("N")[..6];
        var (s, saved) = await Send(HttpMethod.Put, "/api/admin/settings/config-v30/website", new { tagline, carry_on_kg = "9" });
        Assert.Equal(HttpStatusCode.OK, s);
        Assert.Equal(9, (int)saved!["value"]!["carry_on_kg"]!);
        Assert.Equal(tagline, (string)(await Admin.GetJson("/api/admin/settings/branding"))["operator"]!["tagline"]!);

        var (sd, dial) = await Send(HttpMethod.Post, "/api/admin/settings/config-v30/dials", new { code = "9" + Random.Shared.Next(0, 9), phone = "9000000099", label = "Test" });
        Assert.Equal(HttpStatusCode.OK, sd);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(HttpMethod.Post, "/api/admin/settings/config-v30/dials", new { code = (string)dial!["code"]!, phone = "9000000099" })).Item1);
        Assert.Equal(HttpStatusCode.OK, (await Send(HttpMethod.Delete, $"/api/admin/settings/config-v30/dials/{dial["id"]}")).Item1);

        var (ss, sub) = await Send(HttpMethod.Post, "/api/admin/settings/config-v30/subscriptions", new { event_types = new[] { "Cancellation" }, channel = "push", endpoint = "office" });
        Assert.Equal(HttpStatusCode.OK, ss);
        Assert.Equal("not_connected", (string)sub!["delivery_status"]!);
        Assert.Equal((HttpStatusCode)424, (await Send(HttpMethod.Post, $"/api/admin/settings/config-v30/subscriptions/{sub["id"]}/test")).Item1);
        Assert.Equal(HttpStatusCode.OK, (await Send(HttpMethod.Delete, $"/api/admin/settings/config-v30/subscriptions/{sub["id"]}")).Item1);
    }

    [Fact]
    public async Task Loyalty_v34_reads_imported_programme_and_validates_sections()
    {
        var l = await Admin.GetJson("/api/admin/settings/loyalty-v34");
        Assert.Equal(7, l["daily_limits"]!.AsArray().Count);
        Assert.Equal(["Bronze", "Gold", "Platinum", "Silver"], l["tier_bonus"]!.AsArray().Select(x => (string)x!["tier_name"]!));
        Assert.Equal("Provide exactly seven daily limits", Msg((await Send(HttpMethod.Put, "/api/admin/settings/loyalty-v34/daily_limits", new { value = new object[0] })).Item2));
        Assert.Equal("Invalid calendar date", Msg((await Send(HttpMethod.Put, "/api/admin/settings/loyalty-v34/blocked_dates", new { value = new[] { new { date = "2026-02-30", rate = 0 } } })).Item2));
        Assert.Equal(HttpStatusCode.NotFound, (await Send(HttpMethod.Put, "/api/admin/settings/loyalty-v34/bogus", new { value = 1 })).Item1);
        var (s, r) = await Send(HttpMethod.Put, "/api/admin/settings/loyalty-v34/seat_upgrades", new { value = new { enabled = true } });
        Assert.Equal(HttpStatusCode.OK, s);
        Assert.True((bool)r!["configuration"]!["seat_upgrades"]!["enabled"]!);
    }

    [Fact]
    public async Task Branding_about_and_whatsapp_report_real_state_only()
    {
        Assert.Equal("Brand color must be a 6-digit hex value", Msg((await Send(HttpMethod.Put, "/api/admin/settings/branding", new { brand_hex = "blue" })).Item2));
        Assert.Equal("Image content does not match its type", Msg((await Send(HttpMethod.Post, "/api/admin/settings/branding/assets/favicon", new { data_url = "data:image/png;base64," + Convert.ToBase64String(new byte[32]) })).Item2));
        var about = await Admin.GetJson("/api/admin/about/build");
        Assert.Equal("JourneyOS Operator", (string)about["product"]!);
        Assert.Equal("deployed-server", (string)about["update_source"]!);
        var wa = await Admin.GetJson("/api/admin/settings/whatsapp/onboarding");
        Assert.False((bool)wa["enabled"]!);
        Assert.Equal("not_connected", (string)wa["connection"]!["status"]!);
        Assert.Equal((HttpStatusCode)403, (await Send(HttpMethod.Post, "/api/admin/settings/whatsapp/onboarding/start")).Item1); // service key is not a person
    }

    private async Task<(long Id, string Phone)> User(string role)
    {
        var phone = "8" + Random.Shared.NextInt64(100_000_000, 999_999_999);
        var (s, u) = await Admin.Post("/api/admin/iam/users", new { phone, name = $"Settings {role}", role, status = "ACTIVE" });
        Assert.True(s == HttpStatusCode.OK, u?.ToJsonString());
        var id = (long)u!["id"]!;
        Assert.Equal(HttpStatusCode.NoContent, (await Admin.PostAsJsonAsync($"/api/admin/iam/users/{id}/password", new { password = "correct-horse-1" })).StatusCode);
        return (id, phone);
    }
    private async Task<HttpClient> Login(string phone, string ua = "TestAgent/1")
    {
        var c = fx.Factory.CreateClient();
        c.DefaultRequestHeaders.UserAgent.ParseAdd(ua);
        var (s, b) = await c.Post("/api/auth/login", new { tenant = "demo", phone, password = "correct-horse-1" });
        Assert.True(s == HttpStatusCode.OK, b?.ToJsonString());
        c.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", (string)b!["token"]!);
        return c;
    }

    [Fact]
    public async Task View_as_switches_identity_only_for_eligible_targets_and_keeps_real_user()
    {
        var (adminId, adminPhone) = await User("admin");
        var (viewerId, _) = await User("viewer");
        var (otherAdminId, _) = await User("admin");
        var admin = await Login(adminPhone);

        var list = (await admin.GetJson("/api/admin/auth/switchable-users")).AsArray().Select(x => (long)x!["id"]!).ToList();
        Assert.Contains(viewerId, list);
        Assert.DoesNotContain(adminId, list);
        Assert.DoesNotContain(otherAdminId, list); // peers are not switchable

        var self = await admin.GetJson("/api/admin/auth/permissions");
        Assert.Equal(adminId, (long)self["id"]!);

        admin.DefaultRequestHeaders.Add("X-View-As", viewerId.ToString());
        var viewed = await admin.GetJson("/api/admin/auth/permissions");
        Assert.Equal(viewerId, (long)viewed["id"]!);
        Assert.Equal("viewer", (string)viewed["role"]!);
        Assert.DoesNotContain("settings.modify", viewed["permissions"]!.AsArray().Select(x => (string)x!));
        var status = await admin.GetJson("/api/admin/auth/switch-user/v34/status");
        Assert.True((bool)status["is_viewing_as"]!);
        Assert.Equal(adminId, (long)status["real"]!["id"]!);
        Assert.Equal(viewerId, (long)status["target"]!["id"]!);
        // while viewing as someone, switching again is refused
        var (rs, _) = await admin.Post("/api/admin/auth/switch-user/v34/resolve", new { phone = "9999999999" });
        Assert.Equal(HttpStatusCode.Forbidden, rs);

        // ineligible target (peer admin) is ignored: identity stays the signed-in admin
        admin.DefaultRequestHeaders.Remove("X-View-As");
        admin.DefaultRequestHeaders.Add("X-View-As", otherAdminId.ToString());
        Assert.Equal(adminId, (long)(await admin.GetJson("/api/admin/auth/permissions"))["id"]!);

        // a non-admin cannot list or use view-as
        var (_, viewerPhone) = await User("viewer");
        var viewer = await Login(viewerPhone);
        Assert.Empty((await viewer.GetJson("/api/admin/auth/switchable-users")).AsArray());
        viewer.DefaultRequestHeaders.Add("X-View-As", adminId.ToString());
        Assert.Equal("viewer", (string)(await viewer.GetJson("/api/admin/auth/permissions"))["role"]!);
    }

    [Fact]
    public async Task Sessions_list_own_devices_and_revoke_only_own()
    {
        var (_, phone) = await User("ops");
        var a = await Login(phone, "DeviceA/1");
        var b = await Login(phone, "DeviceB/1");
        var rows = (await a.GetJson("/api/admin/auth/sessions"))["sessions"]!.AsArray();
        Assert.Equal(2, rows.Count);
        Assert.Single(rows, r => (bool)r!["current"]!);
        Assert.Contains(rows, r => (string?)r!["user_agent"] == "DeviceA/1");
        var other = rows.First(r => !(bool)r!["current"]!)!;

        var (_, strangerPhone) = await User("ops");
        var stranger = await Login(strangerPhone);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync($"/api/admin/auth/sessions/{other["id"]}")).StatusCode);

        var del = await a.DeleteAsync($"/api/admin/auth/sessions/{other["id"]}");
        Assert.Equal(HttpStatusCode.OK, del.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await b.GetAsync("/api/admin/auth/sessions")).StatusCode);
        Assert.Single((await a.GetJson("/api/admin/auth/sessions"))["sessions"]!.AsArray());
    }
}
