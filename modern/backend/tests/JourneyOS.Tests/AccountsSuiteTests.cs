using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace JourneyOS.Tests;

/// <summary>Accounts suite: loyalty coupons, agent terms, OTA settlement config, operator invoice payments, OTA verifier v43.</summary>
[Collection("gds")]
public sealed class AccountsSuiteTests(GdsFixture fx)
{
    private HttpClient Admin => fx.Factory.Admin();
    private static string Code() => "T" + Random.Shared.NextInt64(10_000_000, 99_999_999);

    private async Task<(HttpStatusCode, JsonNode?)> Put(string url, object body)
    {
        var r = await Admin.PutAsJsonAsync(url, body);
        var text = await r.Content.ReadAsStringAsync();
        return (r.StatusCode, string.IsNullOrWhiteSpace(text) ? null : JsonNode.Parse(text));
    }

    [Fact]
    public async Task Coupons_list_imported_catalogue_and_enforce_validation_uniqueness_and_immutable_code()
    {
        var list = (await Admin.GetJson("/api/admin/coupons"))["coupons"]!.AsArray();
        var off100 = list.Single(c => (string)c!["code"]! == "OFF100")!;
        Assert.Equal("flat", (string)off100["discount_type"]!);
        Assert.Equal(100m, (decimal)off100["discount_value"]!);
        Assert.Equal("percent", (string)list.Single(c => (string)c!["code"]! == "SAVE10")!["discount_type"]!);
        Assert.False((bool)list.Single(c => (string)c!["code"]! == "WELCOME15")!["is_active"]!);

        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.Post("/api/admin/coupons", new { code = "x!", discount_type = "flat", discount_value = 10 })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.Post("/api/admin/coupons", new { code = Code(), discount_type = "percent", discount_value = 150 })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.Post("/api/admin/coupons", new { code = Code(), discount_type = "flat", discount_value = 0 })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.Post("/api/admin/coupons", new { code = Code(), discount_type = "flat", discount_value = 5, valid_from = "2026-12-10", valid_until = "2026-12-01" })).Status);

        var code = Code();
        var (s, c) = await Admin.Post("/api/admin/coupons", new { code = code.ToLowerInvariant(), description = "Test", discount_type = "percent", discount_value = "12.5", min_fare = "300", channels = new[] { "website", "bogus" }, is_active = true });
        Assert.True(s == HttpStatusCode.OK, c?.ToJsonString());
        Assert.Equal(code, (string)c!["code"]!);
        Assert.Equal(12.5m, (decimal)c["discount_value"]!);
        Assert.Equal(["website"], c["channels"]!.AsArray().Select(x => (string)x!));
        Assert.Equal(HttpStatusCode.Conflict, (await Admin.Post("/api/admin/coupons", new { code, discount_type = "flat", discount_value = 10 })).Status);

        var id = (long)c["id"]!;
        var (s2, u) = await Put($"/api/admin/coupons/{id}", new { code = "CHANGED", is_active = false });
        Assert.Equal(HttpStatusCode.OK, s2);
        Assert.Equal(code, (string)u!["code"]!);
        Assert.False((bool)u["is_active"]!);
        Assert.Equal(HttpStatusCode.NotFound, (await Put("/api/admin/coupons/99999999", new { is_active = true })).Item1);
    }

    [Fact]
    public async Task Agent_terms_create_update_and_refuse_non_agent_phone()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await Put("/api/admin/accounts/channels/agents", new { name = "X", phone = "123" })).Item1);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put("/api/admin/accounts/channels/agents", new { name = "X", phone = "7000000001", commission_pct = 120 })).Item1);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put("/api/admin/accounts/channels/agents", new { name = "X", phone = "7000000001", credit_limit = -1 })).Item1);
        Assert.Equal(HttpStatusCode.Conflict, (await Put("/api/admin/accounts/channels/agents", new { name = "Owner", phone = "9999999999" })).Item1);

        var phone = "7" + Random.Shared.NextInt64(100_000_000, 999_999_999);
        var (s, a) = await Put("/api/admin/accounts/channels/agents", new { name = "Suite Agent", phone, commission_pct = "6.5", credit_limit = "1000", settlement_mode = "weekly", is_active = true, independent_commission = true });
        Assert.True(s == HttpStatusCode.OK, a?.ToJsonString());
        Assert.Equal("agent:" + phone, (string)a!["channel_key"]!);
        Assert.Equal("weekly", (string)a["settlement_mode"]!);
        var (s2, b) = await Put("/api/admin/accounts/channels/agents", new { name = "Suite Agent 2", phone, commission_pct = 7, is_active = false });
        Assert.Equal(HttpStatusCode.OK, s2);
        Assert.Equal((long)a["id"]!, (long)b!["id"]!);
        Assert.False((bool)b["is_active"]!);
        Assert.Equal("DOJ", (string)b["settlement_mode"]!);
        var agents = (await Admin.GetJson("/api/admin/accounts/agent-settings"))["agents"]!.AsArray();
        Assert.Equal(7m, (decimal)agents.Single(x => (string)x!["phone"]! == phone)!["commission_pct"]!);
        Assert.Equal("Sri Sai Travels", (string)agents[0]!["name"]!); // legacy user order
    }

    [Fact]
    public async Task Ota_config_round_trips_and_rejects_invalid_lists()
    {
        var before = (await Admin.GetJson("/api/admin/reconciliation/config")).AsArray();
        Assert.Equal(["redbus", "abhibus", "paytm"], before.Select(x => (string)x!["ota_slug"]!));
        Assert.Equal(13m, (decimal)before[0]!["commission_percent"]!);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put("/api/admin/reconciliation/config", new[] { new { ota_slug = "redbus" }, new { ota_slug = "redbus" } })).Item1);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put("/api/admin/reconciliation/config", new[] { new { ota_slug = "redbus", commission_percent = -1 } })).Item1);
        try
        {
            var edited = before.Select(x => x!.DeepClone()).ToList();
            edited[0]!["commission_percent"] = 14;
            edited[1]!["is_active"] = false;
            var (s, after) = await Put("/api/admin/reconciliation/config", edited);
            Assert.True(s == HttpStatusCode.OK, after?.ToJsonString());
            var now = (await Admin.GetJson("/api/admin/reconciliation/config")).AsArray();
            Assert.Equal(14m, (decimal)now[0]!["commission_percent"]!);
            Assert.False((bool)now[1]!["is_active"]!);
            Assert.Equal(3, now.Count);
        }
        finally { Assert.Equal(HttpStatusCode.OK, (await Put("/api/admin/reconciliation/config", before)).Item1); }
    }

    [Fact]
    public async Task Invoices_show_only_issued_documents_and_refuse_payment_without_balance()
    {
        var d = await Admin.GetJson("/api/admin/accounts/invoices");
        Assert.Empty(d["documents"]!.AsArray()); // imported legacy catalogue entries are not platform-issued
        Assert.False((bool)d["balance"]!["has_evidence"]!);
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.Post("/api/admin/accounts/invoices/payments", new { amount = 100, reference = "UTR123456" })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.GetAsync("/api/admin/accounts/invoices/bundle/2026-13")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Admin.GetAsync("/api/admin/accounts/invoices/documents/issued-1/pdf")).StatusCode);
    }

    [Fact]
    public async Task Ota_verifier_v43_rejects_non_pdf_and_unknown_ota()
    {
        Assert.Equal(HttpStatusCode.OK, (await Admin.GetAsync("/api/admin/reconciliation/v43/invoices")).StatusCode);
        var pdf = Convert.ToBase64String("%PDF-1.4 not really"u8.ToArray());
        var (s1, _) = await Admin.Post("/api/admin/reconciliation/v43/invoices", new { ota_slug = "abhibus", file_name = "a.pdf", base64 = pdf });
        var (s2, _) = await Admin.Post("/api/admin/reconciliation/v43/invoices", new { ota_slug = "redbus", file_name = "a.csv", base64 = pdf });
        Assert.Equal(HttpStatusCode.BadRequest, s1);
        Assert.Equal(HttpStatusCode.BadRequest, s2);
        Assert.Equal(HttpStatusCode.NotFound, (await Admin.GetAsync("/api/admin/reconciliation/v43/invoices/99999999")).StatusCode);
    }
}
