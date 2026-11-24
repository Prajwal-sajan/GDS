using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using static JourneyOS.Tests.RedBusClient;

namespace JourneyOS.Tests;

[Collection("gds")]
public sealed class BusinessTests(GdsFixture fx)
{
    private HttpClient Rb => fx.Factory.CreateClient();
    private HttpClient Admin => fx.Factory.Admin();
    private static string Phone() => "8" + Random.Shared.NextInt64(100_000_000, 999_999_999);

    private async Task<(long Id, string Phone)> CreateUser(string role, string password = "correct-horse-1", decimal? commission = null)
    {
        var phone = Phone();
        var (s, u) = await Admin.Post("/api/admin/iam/users", new { phone, name = $"Test {role}", role, status = "ACTIVE", commissionPct = commission });
        Assert.True(s == HttpStatusCode.OK, u?.ToJsonString());
        var id = (long)u!["id"]!;
        var r = await Admin.PostAsJsonAsync($"/api/admin/iam/users/{id}/password", new { password });
        Assert.Equal(HttpStatusCode.NoContent, r.StatusCode);
        return (id, phone);
    }

    private async Task<HttpClient> Login(string phone, string password = "correct-horse-1")
    {
        var c = fx.Factory.CreateClient();
        var (s, b) = await c.Post("/api/auth/login", new { tenant = "demo", phone, password });
        Assert.True(s == HttpStatusCode.OK, b?.ToJsonString());
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", (string)b!["token"]!);
        return c;
    }

    [Fact]
    public async Task Legacy_business_collections_are_imported_with_mapped_roles()
    {
        var (customers, users, msgs, calls, ratings, ledger, docs) = await fx.Sql(async db => (await db.Customers.CountAsync(), await db.Users.Where(u => u.LegacyRole != null).ToListAsync(),
            await db.ChatMessages.CountAsync(), await db.CallLogs.CountAsync(), await db.OtaRatings.CountAsync(), await db.LedgerEntries.CountAsync(), await db.ComplianceDocuments.CountAsync()));
        Assert.Equal(895, customers);
        // other tests in the collection append messages/calls/ledger rows; legacy rows are a lower bound
        Assert.InRange(msgs, 60, 1000);
        Assert.InRange(calls, 40, 1000);
        Assert.Equal(80, ratings);
        Assert.InRange(ledger, 3, 1000);
        Assert.Equal(35, docs);
        Assert.Equal(8, users.Count);
        Assert.Equal("admin", users.Single(u => u.LegacyRole == "manager").Role);
        Assert.Equal("accounts", users.Single(u => u.LegacyRole == "accountant").Role);
        Assert.All(users.Where(u => u.Phone != "9666666666"), u => Assert.Null(u.PasswordHash)); // OTP users cannot sign in until activated (9666666666 is activated by another test)
    }

    [Fact]
    public async Task Login_issues_session_with_role_enforcement_lockout_and_revocation()
    {
        var (opsId, opsPhone) = await CreateUser("ops");
        var ops = await Login(opsPhone);
        var me = await ops.GetJson("/api/admin/me");
        Assert.Equal("ops", (string)me["role"]!);
        Assert.Equal("session", (string)me["auth"]!);
        Assert.Equal(HttpStatusCode.OK, (await ops.GetAsync("/api/admin/vehicles")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ops.GetAsync("/api/admin/accounts/channels")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ops.GetAsync("/api/admin/iam/users")).StatusCode);

        // Wrong password and unknown phone are indistinguishable.
        var anon = fx.Factory.CreateClient();
        var (s1, e1) = await anon.Post("/api/auth/login", new { tenant = "demo", phone = opsPhone, password = "wrong-password" });
        var (s2, e2) = await anon.Post("/api/auth/login", new { tenant = "demo", phone = "8000000000", password = "wrong-password" });
        Assert.Equal(HttpStatusCode.Unauthorized, s1);
        Assert.Equal(HttpStatusCode.Unauthorized, s2);
        Assert.Equal((string)e1!["errorCode"]!, (string)e2!["errorCode"]!);
        // Imported legacy users have no password ⇒ cannot sign in.
        var (s3, _) = await anon.Post("/api/auth/login", new { tenant = "demo", phone = "9999999999", password = "anything-at-all" });
        Assert.Equal(HttpStatusCode.Unauthorized, s3);

        // Deactivation revokes the live session immediately.
        var put = await Admin.PutAsJsonAsync($"/api/admin/iam/users/{opsId}", new { phone = opsPhone, name = "Test ops", role = "ops", status = "INACTIVE" });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await ops.GetAsync("/api/admin/me")).StatusCode);

        // Lockout after 5 failures.
        var (_, lockPhone) = await CreateUser("viewer");
        for (var i = 0; i < 5; i++) await anon.Post("/api/auth/login", new { tenant = "demo", phone = lockPhone, password = "bad-password-x" });
        var (s4, e4) = await anon.Post("/api/auth/login", new { tenant = "demo", phone = lockPhone, password = "correct-horse-1" });
        Assert.Equal((HttpStatusCode)423, s4);
        Assert.Equal("ACCOUNT_LOCKED", (string)e4!["errorCode"]!);
    }

    [Fact]
    public async Task Imported_user_activates_with_one_time_invite_and_chooses_own_password()
    {
        // Imported accountant (legacy OTP user, no password).
        var id = await fx.Sql(db => db.Users.Where(u => u.Phone == "9666666666").Select(u => u.Id).FirstAsync());
        var anon = fx.Factory.CreateClient();
        var (s0, i0) = await Admin.Post($"/api/admin/iam/users/{id}/invite", new { });
        Assert.True(s0 == HttpStatusCode.OK, i0?.ToJsonString());
        var oldCode = (string)i0!["code"]!;
        var (_, i1) = await Admin.Post($"/api/admin/iam/users/{id}/invite", new { });
        var code = (string)i1!["code"]!;
        Assert.Matches("^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$", code);
        Assert.Null(await fx.Sql(db => db.Users.Where(u => u.Id == id).Select(u => u.PasswordHash).FirstAsync()));
        Assert.DoesNotContain(code, await fx.Sql(db => db.Users.Where(u => u.Id == id).Select(u => u.InviteCodeSha256).FirstAsync()) ?? "");

        // Re-issue invalidates the old code; weak password rejected before the code is consumed.
        var (sa, ea) = await anon.Post("/api/auth/activate", new { tenant = "demo", phone = "9666666666", code = oldCode, password = "accounts-pass-1" });
        Assert.Equal(HttpStatusCode.Unauthorized, sa);
        Assert.Equal("INVALID_INVITE", (string)ea!["errorCode"]!);
        var (sw, _) = await anon.Post("/api/auth/activate", new { tenant = "demo", phone = "9666666666", code, password = "short" });
        Assert.Equal(HttpStatusCode.BadRequest, sw);

        // Lower-case / no dashes accepted; activation signs the user in.
        var (sb, tb) = await anon.Post("/api/auth/activate", new { tenant = "demo", phone = "9666666666", code = code.Replace("-", "").ToLowerInvariant(), password = "accounts-pass-1" });
        Assert.True(sb == HttpStatusCode.OK, tb?.ToJsonString());
        Assert.Equal("accounts", (string)tb!["user"]!["role"]!);
        // Single use.
        var (sc, _) = await anon.Post("/api/auth/activate", new { tenant = "demo", phone = "9666666666", code, password = "another-pass-2" });
        Assert.Equal(HttpStatusCode.Unauthorized, sc);
        var c = await Login("9666666666", "accounts-pass-1");
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/api/admin/accounts/channels")).StatusCode);
        Assert.True(await fx.Sql(db => db.AuditLogs.AnyAsync(a => a.Action == "INVITE_REDEEMED" && a.EntityId == id.ToString())));

        // Admins cannot invite owners.
        var (_, adminPhone) = await CreateUser("admin");
        var admin = await Login(adminPhone);
        var ownerId = await fx.Sql(db => db.Users.Where(u => u.Phone == "9999999999").Select(u => u.Id).FirstAsync());
        var (sf, _) = await admin.Post($"/api/admin/iam/users/{ownerId}/invite", new { });
        Assert.Equal(HttpStatusCode.Forbidden, sf);
    }

    [Fact]
    public async Task Schedule_list_reports_real_inventory_and_toggle_is_persisted_audited_and_role_checked()
    {
        var trip = await fx.Sql(db => db.Trips.Where(t => t.Status == "active" && t.Bookable).OrderByDescending(t => t.TravelDate).FirstAsync());
        var d = trip.TravelDate.ToString("yyyy-MM-dd");
        async Task<JsonNode> Row() => (await Admin.GetJson($"/api/admin/schedules?from={d}&to={d}"))["schedules"]!.AsArray().First(x => (long)x!["id"]! == trip.Id)!;

        var row = await Row();
        var booked = await fx.Sql(db => db.SeatAllocations.Where(a => a.TripId == trip.Id && a.IsActive && a.Kind == AllocationKind.Booked).Select(a => a.CoachSeatId).Distinct().CountAsync());
        Assert.Equal(booked, (int)row["booked"]!);
        Assert.True((int)row["capacity"]! > 0);
        Assert.Equal((int)row["capacity"]! - (int)row["booked"]! - (int)row["held"]! - (int)row["blocked"]!, (int)row["free"]!);
        Assert.NotNull(row["origin"]); Assert.NotNull(row["destination"]); Assert.NotNull(row["mainFare"]);

        // a range that is too wide is rejected, not silently truncated
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.GetAsync("/api/admin/schedules?from=2026-01-01&to=2026-06-01")).StatusCode);

        // viewers may read the list but not switch a schedule off
        var (_, phone) = await CreateUser("viewer");
        var viewer = await Login(phone);
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync($"/api/admin/schedules?from={d}&to={d}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PostAsJsonAsync($"/api/admin/schedules/{trip.Id}/toggle", new { active = false })).StatusCode);

        var (s, off) = await Admin.Post($"/api/admin/schedules/{trip.Id}/toggle", new { active = false });
        Assert.Equal(HttpStatusCode.OK, s);
        Assert.False((bool)off!["bookable"]!);
        Assert.False(await fx.Sql(db => db.Trips.Where(t => t.Id == trip.Id).Select(t => t.Bookable).FirstAsync()));
        Assert.False((bool)(await Row())["bookable"]!);
        Assert.Equal(booked, (int)(await Row())["booked"]!); // existing bookings are untouched
        Assert.True(await fx.Sql(db => db.AuditLogs.AnyAsync(a => a.Action == "SCHEDULE_DISABLED" && a.EntityId == trip.Id.ToString())));

        var (_, on) = await Admin.Post($"/api/admin/schedules/{trip.Id}/toggle", new { active = true });
        Assert.True((bool)on!["bookable"]!);
        Assert.True(await fx.Sql(db => db.Trips.Where(t => t.Id == trip.Id).Select(t => t.Bookable).FirstAsync()));
        Assert.Equal(HttpStatusCode.NotFound, (await Admin.PostAsJsonAsync("/api/admin/schedules/999/toggle", new { active = true })).StatusCode);
    }

    [Fact]
    public async Task Legacy_route_expense_templates_are_imported_and_editable()
    {
        var routeId = await fx.Sql(db => db.Routes.OrderBy(r => r.Id).Select(r => r.Id).FirstAsync());
        var items = await Admin.GetJson($"/api/admin/routes/{routeId}/expense-template");
        Assert.Equal(15, items.AsArray().Count);
        Assert.Equal(14800m, (decimal)items.AsArray().First(x => (string)x!["key"]! == "diesel")!["perTrip"]!);
        var (sb, _) = await Admin.Post($"/api/admin/routes/{routeId}/expense-template", new { });
        Assert.Equal(HttpStatusCode.MethodNotAllowed, sb);
        var bad = await Admin.PutAsJsonAsync($"/api/admin/routes/{routeId}/expense-template", new[] { new { type = "weekly", label = "X", perTrip = 1m } });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }

    [Fact]
    public void Cost_model_supersedes_estimates_and_keeps_fixed_costs_for_cancelled_trips()
    {
        RouteExpenseItem I(string type, string key, decimal v) => new() { Type = type, Key = key, Label = key, PerTrip = v };
        TripExpense E(string cat, decimal v) => new() { Category = cat, Amount = v };
        var tmpl = new[] { I("fixed", "emi_loan", 3500), I("running", "diesel", 14800), I("running", "driver_bata", 2500) };
        var est = JourneyOS.Api.Reports.ReportsService.Cost(true, tmpl, []);
        Assert.Equal(("estimate", 20800m, 0m), (est.Basis, est.Total, est.Actual));
        var mixed = JourneyOS.Api.Reports.ReportsService.Cost(true, tmpl, [E("Diesel", 9000), E("Diesel", 1000), E("Toll plaza", 700)]);
        Assert.Equal("mixed", mixed.Basis);
        Assert.Equal(3500m + 10000m + 2500m + 700m, mixed.Total);
        Assert.Equal(10700m, mixed.Actual);
        var cancelled = JourneyOS.Api.Reports.ReportsService.Cost(false, tmpl, []);
        Assert.Equal(3500m, cancelled.Total); // EMI accrues even when the bus does not run
        Assert.Equal("none", JourneyOS.Api.Reports.ReportsService.Cost(true, [], []).Basis);
        Assert.Equal("actual", JourneyOS.Api.Reports.ReportsService.Cost(true, [], [E("Diesel", 1)]).Basis);
        Assert.Equal("driver_bata", JourneyOS.Api.Reports.ReportsService.ExpenseKey(" Driver  Bata "));
    }

    [Fact]
    public async Task Admin_cannot_escalate_to_owner_and_weak_passwords_are_rejected()
    {
        var (_, adminPhone) = await CreateUser("admin");
        var admin = await Login(adminPhone);
        var (s1, e1) = await admin.Post("/api/admin/iam/users", new { phone = Phone(), name = "Sneaky", role = "owner" });
        Assert.Equal(HttpStatusCode.Forbidden, s1);
        Assert.Equal("FORBIDDEN", (string)e1!["errorCode"]!);
        var (s2, u) = await admin.Post("/api/admin/iam/users", new { phone = Phone(), name = "Clerk", role = "ops" });
        Assert.Equal(HttpStatusCode.OK, s2);
        var r = await admin.PostAsJsonAsync($"/api/admin/iam/users/{(long)u!["id"]!}/password", new { password = "short" });
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }

    [Fact]
    public async Task Crm_search_is_exact_validated_and_masks_phones_for_read_only_roles()
    {
        var f = await FindTrip(Rb, 1);
        var pnr = await Book(Rb, f, f.Seats[0]!);
        var (s0, e0) = await Admin.Get("/api/admin/crm/passenger-search?mode=pnr&q=AB");
        Assert.Equal(HttpStatusCode.BadRequest, s0);
        var empty = await Admin.GetJson("/api/admin/crm/passenger-search?mode=phone&q=");
        Assert.Equal(0, (int)empty["total"]!);

        var hit = await Admin.GetJson($"/api/admin/crm/passenger-search?mode=pnr&q={pnr.ToLowerInvariant()}");
        Assert.Equal(1, (int)hit["total"]!);
        Assert.Equal("9000000000", (string)hit["customers"]![0]!["phone"]!);

        var (_, viewerPhone) = await CreateUser("viewer");
        var viewer = await Login(viewerPhone);
        var masked = await viewer.GetJson($"/api/admin/crm/passenger-search?mode=pnr&q={pnr}");
        Assert.EndsWith("0000", (string)masked["customers"]![0]!["phone"]!);
        Assert.StartsWith("•", (string)masked["customers"]![0]!["phone"]!);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync("/api/admin/crm/customers/9000000000")).StatusCode);

        var (sn, _) = await Admin.Post("/api/admin/crm/customers/9000000000/notes", new { text = "Prefers window seats" });
        Assert.Equal(HttpStatusCode.OK, sn);
        var detail = await Admin.GetJson("/api/admin/crm/customers/9000000000");
        Assert.Contains(detail["notes"]!.AsArray(), n => (string)n!["text"]! == "Prefers window seats");
    }

    [Fact]
    public async Task Calls_chats_and_rating_replies_are_records_not_deliveries()
    {
        var (sc, c) = await Admin.Post("/api/admin/calls", new { phone = "+91 98765 43210", status = "answered", durationS = 42, notes = "asked about pickup" });
        Assert.True(sc == HttpStatusCode.OK, c?.ToJsonString());
        Assert.Equal("9876543210", (string)c!["call"]!["phone"]!);
        Assert.Contains("no telephony provider", (string)c["notice"]!);
        var (sb, _) = await Admin.Post("/api/admin/calls", new { phone = "9876543210", status = "teleported" });
        Assert.Equal(HttpStatusCode.BadRequest, sb);

        var conv = (string)(await Admin.GetJson("/api/admin/chats"))["conversations"]![0]!["conversationId"]!;
        var (sm, m) = await Admin.Post($"/api/admin/chats/{Uri.EscapeDataString(conv)}", new { text = "We are looking into it" });
        Assert.True(sm == HttpStatusCode.OK, m?.ToJsonString());
        Assert.Equal("recorded", (string)m!["delivery"]!);

        var rid = await fx.Sql(db => db.OtaRatings.Select(r => r.Id).FirstAsync());
        var (sr, r) = await Admin.Post($"/api/admin/ratings/{rid}/reply", new { reply = "Thank you" });
        Assert.Equal(HttpStatusCode.OK, sr);
        Assert.Contains("not published", (string)r!["notice"]!);
    }

    [Fact]
    public async Task Reports_reflect_new_bookings_and_recorded_expenses()
    {
        var f = await FindTrip(Rb, 1);
        var tripId = await fx.Sql(db => db.OtaInventories.Where(i => i.Id == f.InventoryId).Select(i => i.TripId).FirstAsync());
        // RedBus doj is the boarding date at the source city; reports use the trip's travel date.
        var d = (await fx.Sql(db => db.Trips.Where(t => t.Id == tripId).Select(t => t.TravelDate).FirstAsync())).ToString("yyyy-MM-dd");
        var before = await Admin.GetJson($"/api/admin/reports/analytics?from={d}&to={d}");
        await Book(Rb, f, f.Seats[0]!);
        var after = await Admin.GetJson($"/api/admin/reports/analytics?from={d}&to={d}");
        Assert.Equal((int)before["totals"]!["seats"]! + 1, (int)after["totals"]!["seats"]!);
        Assert.True((decimal)after["totals"]!["netSales"]! > (decimal)before["totals"]!["netSales"]!);

        var (se, _) = await Admin.Post($"/api/admin/trips/{tripId}/expenses", new { category = "Diesel", amount = 12000m, note = "test" });
        Assert.Equal(HttpStatusCode.OK, se);
        var pnl = await Admin.GetJson($"/api/admin/reports/trip-pnl?from={d}&to={d}");
        var row = pnl["rows"]!.AsArray().First(r => (long)r!["tripId"]! == tripId)!;
        Assert.NotEqual("none", (string)row["expenseBasis"]!);
        // Imported template has a "diesel" item: the recorded Diesel actual supersedes that estimate instead of adding to it.
        var diesel = row["expenses"]!.AsArray().Where(l => (string)l!["key"]! == "diesel").ToList();
        Assert.Single(diesel);
        Assert.Equal("actual", (string)diesel[0]!["basis"]!);
        Assert.Equal(12000m, (decimal)diesel[0]!["amount"]!);
        Assert.Equal((decimal)row["expense"]!, (decimal)row["expenseActual"]! + (decimal)row["expenseEstimated"]!);
        Assert.InRange((decimal)row["netSales"]! + (decimal)row["cancellationCharges"]! - (decimal)row["expense"]! - (decimal)row["profit"]!, -0.011m, 0.011m);

        var (sr, _) = await Admin.Get("/api/admin/reports/analytics?from=2026-01-01&to=2026-12-31");
        Assert.Equal(HttpStatusCode.BadRequest, sr); // range cap
        var (sd, _) = await Admin.Get("/api/admin/reports/analytics?from=not-a-date");
        Assert.Equal(HttpStatusCode.BadRequest, sd);
        var ops = await Admin.GetJson($"/api/admin/reports/daily-ops?date={d}");
        Assert.NotNull(ops["fleet"]!["summary"]);
    }

    [Fact]
    public async Task Agent_ledger_tracks_tickets_payments_and_is_visible_only_to_that_agent()
    {
        var (_, agentPhone) = await CreateUser("agent", commission: 10m);
        var f = await FindTrip(Rb, 1);
        var tripId = await fx.Sql(db => db.OtaInventories.Where(i => i.Id == f.InventoryId).Select(i => i.TripId).FirstAsync());
        var (bp, dp) = await fx.Sql(async db =>
        {
            var st = await db.Trips.Where(t => t.Id == tripId).SelectMany(t => t.Route!.Stages).ToListAsync();
            return (st.Where(s => s.Kind == "pickup").OrderBy(s => s.StopSequence).First().Id, st.Where(s => s.Kind == "drop").OrderBy(s => s.StopSequence).Last().Id);
        });
        var (sc, cb) = await Admin.Post("/api/admin/bookings/counter", new
        {
            tripId, boardingPointId = bp, droppingPointId = dp, paymentMethod = "agent_credit", paymentReference = (string?)null, channel = "agent", agentPhone,
            passengers = new[] { new { seat = (string)f.Seats[0]!["name"]!, name = "Agent Pax", age = 33, gender = "M", mobile = "9000000002", email = (string?)null, primary = true } },
        });
        Assert.True(sc == HttpStatusCode.OK, cb?.ToJsonString());
        var total = (decimal)cb!["totalFare"]!;

        var key = $"agent:{agentPhone}";
        var l1 = await Admin.GetJson($"/api/admin/accounts/ledger?channelKey={key}");
        var ticket = Assert.Single(l1["entries"]!.AsArray());
        Assert.True((decimal)ticket!["debit"]! < total); // commission deducted
        Assert.Equal(0m, (decimal)ticket["credit"]!);    // agent_credit is a receivable, not cash

        var (sl, entry) = await Admin.Post("/api/admin/accounts/ledger", new { channelKey = key, type = "credit", amount = 100m, note = "UTR 1234" });
        Assert.Equal(HttpStatusCode.OK, sl);
        var l2 = await Admin.GetJson($"/api/admin/accounts/ledger?channelKey={key}");
        Assert.Equal((decimal)l1["balance"]! - 100m, (decimal)l2["balance"]!);
        await Admin.Post($"/api/admin/accounts/ledger/{(long)entry!["id"]!}/void", new { });
        Assert.Equal((decimal)l1["balance"]!, (decimal)(await Admin.GetJson($"/api/admin/accounts/ledger?channelKey={key}"))["balance"]!);

        var agent = await Login(agentPhone);
        Assert.Equal((decimal)l1["balance"]!, (decimal)(await agent.GetJson("/api/admin/me/ledger"))["balance"]!);
        Assert.Equal(HttpStatusCode.Forbidden, (await agent.GetAsync($"/api/admin/accounts/ledger?channelKey=agent:9444444441")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await agent.GetAsync("/api/admin/vehicles")).StatusCode);

        var (sbad, _) = await Admin.Post("/api/admin/bookings/counter", new
        {
            tripId, boardingPointId = bp, droppingPointId = dp, paymentMethod = "agent_credit", channel = "agent", agentPhone = "8000000001",
            passengers = new[] { new { seat = (string)f.Seats[1]!["name"]!, name = "X", age = 33, gender = "M", mobile = "9000000002", email = (string?)null, primary = true } },
        });
        Assert.Equal(HttpStatusCode.BadRequest, sbad);
    }

    [Fact]
    public async Task Sarathi_answers_from_report_data_and_persists_conversations_per_user()
    {
        var (s1, a1) = await Admin.Post("/api/admin/sarathi/ask", new { question = "How many passengers travelled this week?" });
        Assert.True(s1 == HttpStatusCode.OK, a1?.ToJsonString());
        Assert.Equal("passengers", (string)a1!["answer"]!["intent"]!);
        Assert.Equal(7, a1["answer"]!["table"]!.AsArray().Count);
        var cid = (long)a1["conversationId"]!;

        var (_, a2) = await Admin.Post("/api/admin/sarathi/ask", new { question = "what's the weather", conversationId = cid });
        Assert.Equal("help", (string)a2!["answer"]!["intent"]!);
        Assert.Equal(cid, (long)a2["conversationId"]!);
        var convs = await Admin.GetJson("/api/admin/sarathi/conversations");
        Assert.Equal(4, convs.AsArray().First(c => (long)c!["id"]! == cid)!["messages"]!.AsArray().Count);

        // Another user cannot append to (or see) this conversation.
        var (_, vp) = await CreateUser("viewer");
        var viewer = await Login(vp);
        var (s3, _) = await viewer.Post("/api/admin/sarathi/ask", new { question = "revenue yesterday", conversationId = cid });
        Assert.Equal(HttpStatusCode.NotFound, s3);
        Assert.DoesNotContain((await viewer.GetJson("/api/admin/sarathi/conversations")).AsArray(), c => (long)c!["id"]! == cid);

        var docs = await Admin.Post("/api/admin/sarathi/ask", new { question = "Which documents are expiring soon?" });
        Assert.Equal("documents", (string)docs.Body!["answer"]!["intent"]!);
    }
}

internal static class HttpGetExt
{
    public static async Task<(HttpStatusCode, JsonNode?)> Get(this HttpClient c, string url)
    {
        var r = await c.GetAsync(url);
        var t = await r.Content.ReadAsStringAsync();
        return (r.StatusCode, string.IsNullOrWhiteSpace(t) ? null : JsonNode.Parse(t));
    }
}
