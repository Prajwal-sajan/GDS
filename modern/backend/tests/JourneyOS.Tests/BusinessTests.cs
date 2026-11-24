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
    public async Task Schedule_detail_returns_route_stops_stages_and_trip_booking_history()
    {
        var trip = await fx.Sql(db => db.Trips.Where(t => db.Bookings.Any(b => b.TripId == t.Id)).FirstAsync());
        var d = await Admin.GetJson($"/api/admin/schedule-detail/{trip.Id}");
        Assert.Equal(trip.Id, (long)d["id"]!);
        Assert.Equal(trip.RouteId, (long)d["routeId"]!);
        Assert.Equal(await fx.Sql(db => db.RouteStops.CountAsync(s => s.RouteId == trip.RouteId)), d["stops"]!.AsArray().Count);
        Assert.Equal(await fx.Sql(db => db.RouteStages.CountAsync(s => s.RouteId == trip.RouteId)), d["stages"]!.AsArray().Count);
        var history = d["history"]!.AsArray();
        Assert.Equal(await fx.Sql(db => db.Bookings.CountAsync(b => b.TripId == trip.Id)), history.Count);
        Assert.All(history, h => Assert.Contains((string)h!["status"]!, new[] { "confirmed", "cancelled" }));
        var dates = history.Select(h => (DateTimeOffset)h!["bookedAt"]!).ToList();
        Assert.Equal(dates.OrderByDescending(x => x), dates);
        Assert.Equal(HttpStatusCode.NotFound, (await Admin.GetAsync("/api/admin/schedule-detail/999")).StatusCode);
        var (_, phone) = await CreateUser("viewer");
        Assert.Equal(HttpStatusCode.OK, (await (await Login(phone)).GetAsync($"/api/admin/schedule-detail/{trip.Id}")).StatusCode);
    }

    [Fact]
    public async Task Trip_sheets_list_services_for_a_date_and_return_crew_stops_and_passengers()
    {
        var trip = await fx.Sql(db => db.Trips.Where(t => db.Bookings.Any(b => b.TripId == t.Id)).FirstAsync());
        var list = (await Admin.GetJson($"/api/admin/trip-sheets?date={trip.TravelDate:yyyy-MM-dd}"))["trips"]!.AsArray();
        Assert.Equal(await fx.Sql(db => db.Trips.CountAsync(t => t.TravelDate == trip.TravelDate)), list.Count);
        Assert.Contains(list, x => (long)x!["id"]! == trip.Id);
        var d = await Admin.GetJson($"/api/admin/trip-sheets/{trip.Id}");
        Assert.Equal(trip.Id, (long)d["id"]!);
        Assert.Equal(await fx.Sql(db => db.RouteStages.CountAsync(s => s.RouteId == trip.RouteId)), d["stops"]!.AsArray().Count);
        var pax = d["passengers"]!.AsArray();
        Assert.Equal(await fx.Sql(db => db.Bookings.Where(b => b.TripId == trip.Id).SelectMany(b => b.Passengers).CountAsync()), pax.Count);
        Assert.All(pax, p => Assert.NotNull(p!["pnr"]));
        Assert.Equal(HttpStatusCode.NotFound, (await Admin.GetAsync("/api/admin/trip-sheets/999")).StatusCode);
        var (_, phone) = await CreateUser("viewer");
        Assert.Equal(HttpStatusCode.OK, (await (await Login(phone)).GetAsync($"/api/admin/trip-sheets/{trip.Id}")).StatusCode);
    }

    [Fact]
    public async Task Crm_booking_detail_returns_passengers_fare_and_seat_map_and_masks_phone_for_viewers()
    {
        var b = await fx.Sql(db => db.Bookings.Include(x => x.Passengers).Where(x => x.Passengers.Any()).FirstAsync());
        var d = await Admin.GetJson($"/api/admin/crm/booking/{b.Pnr}");
        var bk = d["booking"]!;
        Assert.Equal(b.Pnr, (string)bk["pnr"]!);
        Assert.Equal(b.Passengers.Count, bk["passengers"]!.AsArray().Count);
        Assert.Contains((string)bk["status"]!, new[] { "confirmed", "cancelled" });
        var seats = d["map"]!["decks"]!.AsArray().SelectMany(x => x!["seats"]!.AsArray()).ToList();
        Assert.All(b.Passengers, p => Assert.Contains(seats, s => (string)s!["code"]! == p.SeatCode));
        Assert.Contains(seats, s => s!["booking"] is { } x && (bool)x["isCurrent"]!);
        Assert.Equal(d.ToJsonString(), (await Admin.GetJson($"/api/admin/crm/booking/{b.Pnr[^6..]}")).ToJsonString());
        Assert.Equal(HttpStatusCode.NotFound, (await Admin.GetAsync("/api/admin/crm/booking/NOPE000000")).StatusCode);
        var (_, phone) = await CreateUser("viewer");
        var v = await (await Login(phone)).GetAsync($"/api/admin/crm/booking/{b.Pnr}");
        Assert.Equal(HttpStatusCode.OK, v.StatusCode);
        var shown = (string?)System.Text.Json.Nodes.JsonNode.Parse(await v.Content.ReadAsStringAsync())!["booking"]!["contact"]!["phone"];
        Assert.True(shown is null || shown.Contains("xxxxxx"), $"phone should be masked for viewer: {shown}");
    }

    [Fact]
    public async Task Fleet_lists_reflect_postgres_and_status_switches_are_audited()
    {
        var vehicles = (await Admin.GetJson("/api/admin/vehicle-list"))["vehicles"]!.AsArray();
        Assert.Equal(await fx.Sql(db => db.Vehicles.CountAsync()), vehicles.Count);
        var coaches = (await Admin.GetJson("/api/admin/coach-list"))["coaches"]!.AsArray();
        Assert.Equal(await fx.Sql(db => db.CoachTemplates.CountAsync()), coaches.Count);
        var coach = await fx.Sql(db => db.CoachTemplates.Include(c => c.Seats).OrderBy(c => c.Id).FirstAsync());
        var crow = coaches.First(x => (long)x!["id"]! == coach.Id)!;
        Assert.Equal(coach.Seats.Count, (int)crow["capacity"]!);
        Assert.Equal(coach.Seats.Count, (int)crow["seater"]! + (int)crow["sleeper"]!);

        var (_, phone) = await CreateUser("viewer");
        var viewer = await Login(phone);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync("/api/admin/vehicle-list")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PutAsJsonAsync($"/api/admin/coaches/{coach.Id}/status", new { status = "deleted" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Admin.PutAsJsonAsync("/api/admin/vehicles/999999/status", new { status = "inactive" })).StatusCode);

        var vid = (long)vehicles[0]!["id"]!; var before = (string)vehicles[0]!["status"]!;
        var flip = before == "active" ? "inactive" : "active";
        try
        {
            Assert.Equal(HttpStatusCode.OK, (await Admin.PutAsJsonAsync($"/api/admin/vehicles/{vid}/status", new { status = flip })).StatusCode);
            Assert.Equal(flip, await fx.Sql(db => db.Vehicles.Where(v => v.Id == vid).Select(v => v.Status).FirstAsync()));
            Assert.True(await fx.Sql(db => db.AuditLogs.AnyAsync(a => a.Action == "VEHICLE_STATUS" && a.EntityId == vid.ToString())));
            Assert.Equal(HttpStatusCode.OK, (await Admin.PutAsJsonAsync($"/api/admin/coaches/{coach.Id}/status", new { status = "inactive" })).StatusCode);
            Assert.Equal("inactive", await fx.Sql(db => db.CoachTemplates.Where(c => c.Id == coach.Id).Select(c => c.Status).FirstAsync()));
        }
        finally
        {
            await Admin.PutAsJsonAsync($"/api/admin/vehicles/{vid}/status", new { status = before });
            await Admin.PutAsJsonAsync($"/api/admin/coaches/{coach.Id}/status", new { status = coach.Status });
        }
    }

    [Fact]
    public async Task Payroll_imports_legacy_and_payout_deducts_advances_and_rolls_in_reimbursements()
    {
        Assert.Equal(516, await fx.Sql(db => db.StaffAttendance.CountAsync(a => a.Source == "auto")));
        Assert.True(await fx.Sql(db => db.StaffPayouts.CountAsync(p => p.PayoutNo.StartsWith("PAY-2026-11"))) >= 18);

        var (_, phone) = await CreateUser("viewer");
        Assert.Equal(HttpStatusCode.Forbidden, (await (await Login(phone)).GetAsync("/api/admin/payroll/advances")).StatusCode);

        // per-trip staff with no attendance in a far-future window: one manual day, approved, then payout
        var staff = await fx.Sql(db => db.Staff.Where(s => s.Status == "active" && s.SalaryType != "monthly"
            && !db.StaffAdvances.Any(a => a.StaffId == s.Id && a.Status == "disbursed") && !db.StaffReimbursements.Any(r => r.StaffId == s.Id && (r.Status == "approved" || r.Status == "in_payout")))
            .OrderBy(s => s.Id).FirstAsync());
        var day = new DateOnly(2030, 1, 15);
        var (sa, att) = await Admin.Post("/api/admin/payroll/attendance", new { staffId = staff.Id, date = day, status = "present", amount = 1200 });
        Assert.True(sa == HttpStatusCode.OK, att?.ToJsonString());
        var attId = (long)att!["id"]!;
        Assert.Equal(HttpStatusCode.Conflict, (await Admin.PostAsJsonAsync("/api/admin/payroll/attendance", new { staffId = staff.Id, date = day, amount = 1 })).StatusCode);
        var (_, ap) = await Admin.Post("/api/admin/payroll/attendance/approve", new { ids = new[] { attId } });
        Assert.Equal(1, (int)ap!["approved"]!);

        var (_, adv) = await Admin.Post("/api/admin/payroll/advances", new { staffId = staff.Id, amount = 500 });
        var advId = (long)adv!["id"]!;
        var (_, rb) = await Admin.Post("/api/admin/payroll/reimbursements", new { staffId = staff.Id, amount = 300, category = "Tolls" });
        var rbId = (long)rb!["id"]!;
        await Admin.Post($"/api/admin/payroll/reimbursements/{rbId}/approve", new { });

        var (sg, gen) = await Admin.Post("/api/admin/payroll/payouts/generate", new { from = day, to = day, staffIds = new[] { staff.Id }, deductAdvances = true });
        Assert.True(sg == HttpStatusCode.OK, gen?.ToJsonString());
        var p = gen!["payouts"]![0]!;
        var pid = (long)p["id"]!;
        try
        {
            Assert.Equal(1200m, (decimal)p["gross"]!);
            Assert.Equal(500m, (decimal)p["advances_recovered"]!);
            Assert.Equal(300m, (decimal)p["reimbursements"]!);
            Assert.Equal(1000m, (decimal)p["net"]!);
            Assert.Equal("recovered", await fx.Sql(db => db.StaffAdvances.Where(a => a.Id == advId).Select(a => a.Status).FirstAsync()));
            Assert.Equal("in_payout", await fx.Sql(db => db.StaffReimbursements.Where(r => r.Id == rbId).Select(r => r.Status).FirstAsync()));
            Assert.Equal(HttpStatusCode.OK, (await Admin.PostAsJsonAsync($"/api/admin/payroll/payouts/{pid}/pay", new { paymentMode = "upi" })).StatusCode);
            Assert.Equal("paid", await fx.Sql(db => db.StaffReimbursements.Where(r => r.Id == rbId).Select(r => r.Status).FirstAsync()));
            Assert.Equal(HttpStatusCode.Conflict, (await Admin.DeleteAsync($"/api/admin/payroll/payouts/{pid}")).StatusCode);
            Assert.True(await fx.Sql(db => db.AuditLogs.AnyAsync(a => a.Action == "PAYOUT_PAY" && a.EntityId == pid.ToString())));
            var ledger = await Admin.GetJson($"/api/admin/payroll/staff/{staff.Id}/ledger");
            Assert.Equal((decimal)ledger["total_credits"]! - (decimal)ledger["total_debits"]!, (decimal)ledger["balance"]!);
        }
        finally
        {
            await fx.Sql(async db =>
            {
                await db.StaffPayouts.Where(x => x.Id == pid).ExecuteDeleteAsync();
                await db.StaffAttendance.Where(x => x.Id == attId).ExecuteDeleteAsync();
                await db.StaffReimbursements.Where(x => x.Id == rbId).ExecuteDeleteAsync();
                return await db.StaffAdvances.Where(x => x.Id == advId).ExecuteDeleteAsync();
            });
        }
    }

    [Fact]
    public async Task Route_list_reflects_postgres_and_status_switch_gates_sales()
    {
        var list = (await Admin.GetJson("/api/admin/route-list"))["routes"]!.AsArray();
        Assert.Equal(await fx.Sql(db => db.Routes.CountAsync()), list.Count);
        var route = await fx.Sql(db => db.Routes.Where(r => r.Status == "active").OrderByDescending(r => r.Id).FirstAsync());
        var row = list.First(x => (long)x!["id"]! == route.Id)!;
        Assert.Equal(route.ServiceNumber, (string)row["serviceNumber"]!);
        Assert.NotNull(row["origin"]); Assert.NotNull(row["destination"]); Assert.NotNull(row["coach"]);
        Assert.True((int)row["durationMinutes"]! > 0);
        Assert.True((int)row["coach"]!["capacity"]! > 0);

        var (_, phone) = await CreateUser("viewer");
        var viewer = await Login(phone);
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync("/api/admin/route-list")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PutAsJsonAsync($"/api/admin/routes/{route.Id}/status", new { status = "inactive" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.PutAsJsonAsync($"/api/admin/routes/{route.Id}/status", new { status = "deleted" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Admin.PutAsJsonAsync("/api/admin/routes/999999/status", new { status = "inactive" })).StatusCode);
        try
        {
            Assert.Equal(HttpStatusCode.OK, (await Admin.PutAsJsonAsync($"/api/admin/routes/{route.Id}/status", new { status = "inactive" })).StatusCode);
            Assert.Equal("inactive", await fx.Sql(db => db.Routes.Where(r => r.Id == route.Id).Select(r => r.Status).FirstAsync()));
            Assert.True(await fx.Sql(db => db.AuditLogs.AnyAsync(a => a.Action == "ROUTE_DEACTIVATED" && a.EntityId == route.Id.ToString())));
            var after = (await Admin.GetJson("/api/admin/route-list"))["routes"]!.AsArray().First(x => (long)x!["id"]! == route.Id)!;
            Assert.Equal("inactive", (string)after["status"]!);
        }
        finally
        {
            Assert.Equal(HttpStatusCode.OK, (await Admin.PutAsJsonAsync($"/api/admin/routes/{route.Id}/status", new { status = "active" })).StatusCode);
        }
        Assert.Equal("active", await fx.Sql(db => db.Routes.Where(r => r.Id == route.Id).Select(r => r.Status).FirstAsync()));
    }

    [Fact]
    public async Task Route_detail_returns_persisted_editor_data()
    {
        var route = await fx.Sql(db => db.Routes.OrderBy(r => r.Id).FirstAsync());
        var d = await Admin.GetJson($"/api/admin/route-detail/{route.Id}");
        Assert.Equal(route.ServiceNumber, (string)d["serviceNumber"]!);
        Assert.Equal(await fx.Sql(db => db.RouteStages.CountAsync(s => s.RouteId == route.Id)), d["stages"]!.AsArray().Count);
        Assert.Equal(await fx.Sql(db => db.RouteFares.CountAsync(s => s.RouteId == route.Id)), d["fares"]!.AsArray().Count);
        Assert.All(d["fares"]!.AsArray(), f => { Assert.NotNull(f!["from"]); Assert.NotNull(f["to"]); });
        Assert.Equal(HttpStatusCode.NotFound, (await Admin.GetAsync("/api/admin/route-detail/999999")).StatusCode);
        var (_, phone) = await CreateUser("viewer");
        Assert.Equal(HttpStatusCode.OK, (await (await Login(phone)).GetAsync($"/api/admin/route-detail/{route.Id}")).StatusCode);
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
        // Board at the found segment's own stages: on overnight routes the route origin may already have departed today.
        var (bp, dp) = (f.Bp, f.Dp);
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

    [Fact]
    public async Task Accounts_sales_totals_match_bookings_and_filters_narrow()
    {
        const string from = "2026-11-20", to = "2026-11-26";
        var (s, sales) = await Admin.Get($"/api/admin/accounts/sales?from={from}&to={to}");
        Assert.True(s == HttpStatusCode.OK, sales?.ToJsonString());
        Assert.Equal(7, sales!["rows"]!.AsArray().Count);
        var (f, t) = (DateOnly.Parse(from), DateOnly.Parse(to));
        var live = await fx.Sql(db => (from b in db.Bookings join tr in db.Trips on b.TripId equals tr.Id
                                       where tr.TravelDate >= f && tr.TravelDate <= t && b.Status != "CANCELLED" select b.Id).CountAsync());
        Assert.Equal(live, (int)sales["totals"]!["bookings"]!);
        Assert.Equal(0m, (decimal)sales["totals"]!["offers"]!);
        Assert.True((int)sales["totals"]!["cancelledPnrs"]! > 0, "legacy cancellations are backfilled");

        var facets = await Admin.GetJson("/api/admin/accounts/sales-facets");
        var sector = (string)facets["sectors"]!.AsArray()[0]!["value"]!;
        var (s2, scoped) = await Admin.Get($"/api/admin/accounts/sales?from={from}&to={to}&sector={Uri.EscapeDataString(sector)}");
        Assert.Equal(HttpStatusCode.OK, s2);
        Assert.True((int)scoped!["totals"]!["bookings"]! <= live);
        Assert.All(scoped["sectorBreakdown"]!.AsArray(), x => Assert.Equal(sector, (string)x!["value"]!));

        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.GetAsync($"/api/admin/accounts/sales?from={from}&to={to}&basis=nope")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Admin.GetAsync($"/api/admin/accounts/sales?from={from}&to={to}&basis=booking_date")).StatusCode);
    }

    [Fact]
    public async Task Accounts_transactions_list_credits_and_debits_with_csv_and_role_guard()
    {
        const string from = "2026-11-18", to = "2026-11-24";
        var (s, tx) = await Admin.Get($"/api/admin/accounts/transactions?from={from}&to={to}");
        Assert.True(s == HttpStatusCode.OK, tx?.ToJsonString());
        var rows = tx!["rows"]!.AsArray();
        var (f, t) = (DateOnly.Parse(from), DateOnly.Parse(to));
        var bookings = await fx.Sql(db => (from b in db.Bookings join tr in db.Trips on b.TripId equals tr.Id where tr.TravelDate >= f && tr.TravelDate <= t select b.Id).CountAsync());
        Assert.Equal(bookings, rows.Count(r => (string)r!["type"]! == "booking"));
        Assert.Equal(bookings, (int)tx["totals"]!["bookings"]!);
        Assert.All(rows.Where(r => (string)r!["type"]! == "cancellation"), r => Assert.Equal(-(decimal)r!["refund"]!, (decimal)r["total"]!));
        var dates = rows.Select(r => (DateTime)r!["date"]!).ToList();
        Assert.Equal(dates.OrderByDescending(d => d), dates);
        Assert.NotEmpty(tx["services"]!.AsArray());

        var pnr = (string)rows[0]!["pnr"]!;
        var (_, one) = await Admin.Get($"/api/admin/accounts/transactions?from={from}&to={to}&q={pnr}");
        Assert.All(one!["rows"]!.AsArray(), r => Assert.Equal(pnr, (string)r!["pnr"]!));
        var (_, red) = await Admin.Get($"/api/admin/accounts/transactions?from={from}&to={to}&source=redbus");
        Assert.All(red!["rows"]!.AsArray(), r => Assert.Equal("redbus", (string)r!["source"]!));

        var csv = await Admin.GetAsync($"/api/admin/accounts/transactions?from={from}&to={to}&format=csv");
        Assert.Equal("text/csv", csv.Content.Headers.ContentType!.MediaType);
        Assert.StartsWith("Pnr,Ticket,TravelDate", (await csv.Content.ReadAsStringAsync()).TrimStart('\uFEFF'));
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.GetAsync($"/api/admin/accounts/transactions?from={from}&to={to}&basis=nope")).StatusCode);
        var viewer = await Login((await CreateUser("viewer")).Phone);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync($"/api/admin/accounts/transactions?from={from}&to={to}")).StatusCode);
    }

    [Fact]
    public async Task Accounts_receivables_split_by_channel_and_ledger_credit_reduces_receivable()
    {
        const string from = "2026-11-18", to = "2026-11-24";
        var (s, rec) = await Admin.Get($"/api/admin/accounts/receivables?from={from}&to={to}");
        Assert.True(s == HttpStatusCode.OK, rec?.ToJsonString());
        var rows = rec!["rows"]!.AsArray();
        var (f, t) = (DateOnly.Parse(from), DateOnly.Parse(to));
        var live = await fx.Sql(db => (from b in db.Bookings join tr in db.Trips on b.TripId equals tr.Id where tr.TravelDate >= f && tr.TravelDate <= t && b.Status == "CONFIRMED" select b.Id).CountAsync());
        Assert.Equal(live, rows.Sum(r => (int)r!["bookings"]!));
        foreach (var r in rows)
        {
            // each figure is rounded on its own (as legacy), so sums may differ by a paisa or two
            Assert.InRange((decimal)r!["commission"]! + (decimal)r["gstOnCommission"]! + (decimal)r["tds"]! - (decimal)r["deductions"]!, -0.02m, 0.02m);
            Assert.InRange((decimal)r["total"]! - (decimal)r["deductions"]! - (decimal)r["paid"]! - (decimal)r["receivable"]!, -0.02m, 0.02m);
            Assert.Contains((string)r["channelType"]!, new[] { "ota", "agent", "branch", "operator" });
        }
        var redbus = rows.Single(r => (string)r!["channelKey"]! == "ota:redbus")!;
        Assert.Equal(0m, (decimal)redbus["paid"]!); // OTA money is never counted as paid at booking

        // a manual credit dated inside the range is counted as paid for that channel (note is optional, like legacy)
        var (sl, entry) = await Admin.Post("/api/admin/accounts/ledger", new { channelKey = "ota:redbus", type = "credit", amount = 10m, date = to });
        Assert.True(sl == HttpStatusCode.OK, entry?.ToJsonString());
        var after = (await Admin.GetJson($"/api/admin/accounts/receivables?from={from}&to={to}"))["rows"]!.AsArray().Single(r => (string)r!["channelKey"]! == "ota:redbus")!;
        Assert.Equal((decimal)redbus["receivable"]! - 10m, (decimal)after["receivable"]!);
        await Admin.Post($"/api/admin/accounts/ledger/{(long)entry!["id"]!}/void", new { });

        var website = await Admin.GetJson("/api/admin/accounts/ledger?channelKey=website");
        Assert.All(website["entries"]!.AsArray(), e => Assert.Equal("manual", (string)e!["kind"]!));
        var ota = await Admin.GetJson("/api/admin/accounts/ledger?channelKey=ota:redbus");
        Assert.Contains(ota["entries"]!.AsArray(), e => (string)e!["kind"]! == "cancellation" && ((string)e["note"]!).StartsWith("Refund "));
        var csv = await Admin.GetAsync($"/api/admin/accounts/receivables?from={from}&to={to}&format=csv");
        Assert.Equal("text/csv", csv.Content.Headers.ContentType!.MediaType);
        var viewer = await Login((await CreateUser("viewer")).Phone);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync($"/api/admin/accounts/receivables?from={from}&to={to}")).StatusCode);
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
