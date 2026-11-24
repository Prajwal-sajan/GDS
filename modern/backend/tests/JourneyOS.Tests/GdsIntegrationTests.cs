using System.Net;
using System.Text.Json.Nodes;
using JourneyOS.Api.Caching;
using JourneyOS.Api.Outbox;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static JourneyOS.Tests.RedBusClient;

namespace JourneyOS.Tests;

[Collection("gds")]
public sealed class InventoryTests(GdsFixture fx)
{
    private HttpClient Rb => fx.Factory.CreateClient();

    [Fact]
    public async Task Concurrent_blocks_on_same_seat_allow_exactly_one_winner()
    {
        var c = Rb;
        var f = await FindTrip(c, 1);
        var seat = f.Seats[0]!;
        var body = BlockBody(f, seat);
        var results = await Task.WhenAll(Enumerable.Range(0, 12).Select(_ => fx.Factory.CreateClient().Post("/redbus/blockticket", body)));
        Assert.Equal(1, results.Count(r => r.Status == HttpStatusCode.OK));
        Assert.All(results.Where(r => r.Status != HttpStatusCode.OK), r =>
            Assert.Contains((string)r.Body!["errorCode"]!, new[] { "SEAT_UNAVAILABLE" }));
        var active = await fx.Sql(db => db.SeatAllocations.CountAsync(a => a.IsActive && a.SeatCode == (string)seat["name"]! &&
            db.OtaInventories.Any(i => i.Id == f.InventoryId && i.TripId == a.TripId)));
        Assert.True(active >= 1);
    }

    [Fact]
    public async Task Confirm_is_idempotent_and_checkpnr_never_creates_bookings()
    {
        var c = Rb;
        var f = await FindTrip(c, 1);
        var (key, total) = await Block(c, f, f.Seats[0]!);

        var (st0, nb) = await c.Post("/redbus/blockticket", BlockBody(f, f.Seats[0]!));
        Assert.Equal(HttpStatusCode.Conflict, st0);

        var before = await c.GetAsync($"/redbus/checkpnr?blockkey={key}");
        Assert.Equal(HttpStatusCode.NotFound, before.StatusCode);
        Assert.Contains("NOT_BOOKED", await before.Content.ReadAsStringAsync());
        Assert.Equal(0, await fx.Sql(db => db.Bookings.CountAsync(b => db.SeatHolds.Any(h => h.Id == b.HoldId && h.BlockKey == key))));

        var (s1, b1) = await c.Post("/redbus/confirmticket", new { Blockkey = key, Fare = total });
        var (s2, b2) = await c.Post("/redbus/confirmticket", new { Blockkey = key, Fare = total });
        Assert.Equal(HttpStatusCode.OK, s1); Assert.Equal(HttpStatusCode.OK, s2);
        Assert.Equal((string)b1!["pnr"]!, (string)b2!["pnr"]!);
        Assert.Equal(1, await fx.Sql(db => db.Bookings.CountAsync(b => db.SeatHolds.Any(h => h.Id == b.HoldId && h.BlockKey == key))));

        var (s3, b3) = await c.Post("/redbus/confirmticket", new { Blockkey = key, Fare = total + 1 });
        Assert.Equal(HttpStatusCode.Conflict, s3);
        Assert.Equal("FARE_MISMATCH", (string)b3!["errorCode"]!);

        var after = await c.GetJson($"/redbus/checkpnr?blockkey={key}");
        Assert.Equal((string)b1["pnr"]!, (string)after["pnr"]!);
    }

    [Fact]
    public async Task Confirm_rejects_fare_mismatch_before_booking()
    {
        var c = Rb;
        var f = await FindTrip(c, 1);
        var (key, total) = await Block(c, f, f.Seats[0]!);
        var (st, b) = await c.Post("/redbus/confirmticket", new { Blockkey = key, Fare = total - 1 });
        Assert.Equal(HttpStatusCode.Conflict, st);
        Assert.Equal("FARE_MISMATCH", (string)b!["errorCode"]!);
        Assert.False(await fx.Sql(db => db.Bookings.AnyAsync(x => db.SeatHolds.Any(h => h.Id == x.HoldId && h.BlockKey == key))));
    }

    [Fact]
    public async Task Expired_hold_frees_seat_and_cannot_be_confirmed()
    {
        var c = Rb;
        var f = await FindTrip(c, 1);
        var seat = f.Seats[0]!;
        var (key, total) = await Block(c, f, seat);
        await fx.Sql(db => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE seat_holds SET expires_at = now() - interval '1 minute' WHERE block_key = {key}"));

        var (st, b) = await c.Post("/redbus/confirmticket", new { Blockkey = key, Fare = total });
        Assert.Equal(HttpStatusCode.Gone, st);
        Assert.Equal("HOLD_EXPIRED", (string)b!["errorCode"]!);

        // Seat is bookable again by somebody else.
        var pnr = await Book(c, f, seat);
        Assert.StartsWith("JOS", pnr);
    }

    [Fact]
    public async Task Same_seat_is_sold_on_non_overlapping_segments_only()
    {
        var c = Rb;
        // Find a route with at least 3 stops: A->B and B->C share a seat; A->C must then be unavailable.
        var routes = await fx.Sql(db => db.Routes.Include(r => r.Stops).Include(r => r.Fares).Where(r => r.Stops.Count >= 3).ToListAsync());
        Found? ab = null, bc = null; long a = 0, cc = 0, routeId = 0;
        foreach (var r in routes)
        {
            var st = r.Stops.OrderBy(s => s.Sequence).ToList();
            for (var i = 0; i + 2 < st.Count && ab is null; i++)
            {
                if (!r.Fares.Any(x => x.FromSequence == st[i].Sequence && x.ToSequence == st[i + 1].Sequence) ||
                    !r.Fares.Any(x => x.FromSequence == st[i + 1].Sequence && x.ToSequence == st[i + 2].Sequence) ||
                    !r.Fares.Any(x => x.FromSequence == st[i].Sequence && x.ToSequence == st[i + 2].Sequence)) continue;
                if (st[i + 1].Day != st[i].Day) continue;
                try
                {
                    var routeFilter = (JsonNode t) => (long)t["routeId"]! == r.Id;
                    var x = await FindTrip(c, 1, routeFilter, st[i].CityId, st[i + 1].CityId);
                    var y = await FindTrip(c, 1, t => routeFilter(t) && (string)t["doj"]! == x.Doj, st[i + 1].CityId, st[i + 2].CityId);
                    ab = x; bc = y; a = st[i].CityId; cc = st[i + 2].CityId; routeId = r.Id;
                }
                catch (InvalidOperationException) { }
            }
            if (ab is not null) break;
        }
        Assert.True(ab is not null, "legacy data has no 3-stop route with all segment fares on one day");

        var common = ab!.Seats.Select(s => (string)s!["name"]!).Intersect(bc!.Seats.Select(s => (string)s!["name"]!)).First();
        await Book(c, ab, ab.Seats.First(s => (string)s!["name"]! == common)!);
        await Book(c, bc, bc.Seats.First(s => (string)s!["name"]! == common)!);

        var acSearch = (await c.GetJson($"/redbus/search?source={a}&destination={cc}&doj={ab.Doj}"))["availableTrips"]!.AsArray()
            .First(t => (long)t!["routeId"]! == routeId)!;
        var acLayout = await c.GetJson($"/redbus/seatlayout?id={acSearch["id"]}&doj={ab.Doj}");
        var seat = acLayout["seats"]!.AsArray().First(s => (string)s!["name"]! == common)!;
        Assert.False((bool)seat["available"]!);
    }

    [Fact]
    public async Task Partial_then_full_cancellation_releases_seats_and_records_refunds()
    {
        var c = Rb;
        var f = await FindTrip(c, 2);
        var pnr = await Book(c, f, f.Seats[0]!, f.Seats[1]!);
        var s2 = (string)f.Seats[1]!["name"]!;

        var (st, r) = await c.Post("/redbus/cancelticket", new { pnr, seatsToCancel = new[] { s2 }, notes = "test" });
        Assert.Equal(HttpStatusCode.OK, st);
        Assert.Equal(pnr, (string)r!["pnr"]!);
        Assert.NotNull(r["Dateofcancel"]);
        var refund = (decimal)r["refundAmount"]!; var charge = (decimal)r["cancellationCharge"]!;
        Assert.Equal((decimal)f.Seats[1]!["fare"]!, refund + charge);

        var ticket = await c.GetJson($"/redbus/ticket?pnr={pnr}");
        Assert.Equal("PARTIALLY_CANCELLED", (string)ticket["status"]!);

        // Seat is free again for the same segment.
        var layout = await c.GetJson($"/redbus/seatlayout?id={f.InventoryId}&doj={f.Doj}");
        Assert.True((bool)layout["seats"]!.AsArray().First(s => (string)s!["name"]! == s2)!["available"]!);

        // Cancelling the same seat twice is rejected; then cancel the rest.
        var (again, _) = await c.Post("/redbus/cancelticket", new { pnr, seatsToCancel = new[] { s2 } });
        Assert.Equal(HttpStatusCode.Conflict, again);
        var (st3, _) = await c.Post("/redbus/cancelticket", new { pnr, seatsToCancel = new[] { (string)f.Seats[0]!["name"]! } });
        Assert.Equal(HttpStatusCode.OK, st3);
        Assert.Equal("CANCELLED", (string)(await c.GetJson($"/redbus/ticket?pnr={pnr}"))["status"]!);
        Assert.Equal(2, await fx.Sql(db => db.Refunds.CountAsync(x => db.Cancellations.Any(cn => cn.Id == x.CancellationId && db.Bookings.Any(b => b.Id == cn.BookingId && b.Pnr == pnr)))));
    }

    [Fact]
    public async Task Bus_cancellation_refunds_all_and_enqueues_documented_callbacks()
    {
        var c = Rb;
        var f = await FindTrip(c, 1);
        var pnr = await Book(c, f, f.Seats[0]!);
        var tripId = await fx.Sql(db => db.OtaInventories.Where(i => i.Id == f.InventoryId).Select(i => i.TripId).FirstAsync());

        var admin = fx.Factory.Admin();
        var (st, body) = await admin.Post($"/api/admin/trips/{tripId}/cancel", new { });
        Assert.Equal(HttpStatusCode.OK, st);
        Assert.True((int)body!["cancelledBookings"]! >= 1);

        var ticket = await c.GetJson($"/redbus/ticket?pnr={pnr}");
        Assert.Equal("CANCELLED", (string)ticket["status"]!);
        Assert.Equal(0m, (decimal)ticket["cancellationCharges"]!);

        var msgs = await fx.Sql(db => db.Outbox.Where(m => m.DedupKey == $"MANUAL_BUS_CANCELLATION:{pnr}" || m.ActionType == RedBusActions.RemoveService).ToListAsync());
        var mbc = Assert.Single(msgs, m => m.ActionType == RedBusActions.ManualBusCancellation);
        var payload = JsonNode.Parse(mbc.PayloadJson)!;
        foreach (var k in new[] { "email", "mobileNo", "PNR", "operator_pnr_number", "operatorId", "doj", "origin", "destination", "cancel_percent", "seats", "flag" })
            Assert.True(payload.AsObject().ContainsKey(k), $"missing {k}");
        Assert.Equal(pnr, (string)payload["operator_pnr_number"]!);
        Assert.Equal("refund", (string)payload["flag"]!);
        Assert.Contains(msgs, m => m.ActionType == RedBusActions.RemoveService);

        // Search no longer offers the cancelled service.
        var search = (await c.GetJson($"/redbus/search?source={f.Source}&destination={f.Destination}&doj={f.Doj}"))["availableTrips"]!.AsArray();
        Assert.DoesNotContain(search, t => (long)t!["id"]! == f.InventoryId && (bool)t["bookable"]!);
    }

    [Fact]
    public async Task Update_ticket_changes_mobile_and_rejects_segment_change()
    {
        var c = Rb;
        var f = await FindTrip(c, 1);
        var pnr = await Book(c, f, f.Seats[0]!);
        var (st, _) = await c.Post("/redbus/updateticket", new { pnr, mobile_number = "9123456789" });
        Assert.Equal(HttpStatusCode.OK, st);
        Assert.Equal("9123456789", await fx.Sql(db => db.Bookings.Where(b => b.Pnr == pnr).Select(b => b.ContactMobile).FirstAsync()));

        var (bad, b) = await c.Post("/redbus/updateticket", new { pnr, boarding_at = f.Dp });
        Assert.NotEqual(HttpStatusCode.OK, bad);
        Assert.NotNull(b!["errorCode"]);
    }

    [Fact]
    public async Task Redis_outage_degrades_to_postgres_without_errors()
    {
        await using var factory = new GdsFactory(fx.Pg.GetConnectionString(), "127.0.0.1:1,connectTimeout=200,abortConnect=false");
        var c = factory.CreateClient();
        var ready = await c.GetJson("/health/ready");
        Assert.False((bool)ready["redis"]!);
        Assert.True((bool)ready["postgres"]!);
        var f = await FindTrip(c, 1);
        var pnr = await Book(c, f, f.Seats[0]!);
        Assert.False(string.IsNullOrEmpty(pnr));
    }

    [Fact]
    public async Task Cache_is_invalidated_after_booking()
    {
        var c = Rb;
        var f = await FindTrip(c, 1);
        var before = await c.GetJson($"/redbus/seatlayout?id={f.InventoryId}&doj={f.Doj}"); // warms cache
        var name = (string)f.Seats[0]!["name"]!;
        Assert.True((bool)before["seats"]!.AsArray().First(s => (string)s!["name"]! == name)!["available"]!);
        await Book(c, f, f.Seats[0]!);
        var after = await c.GetJson($"/redbus/seatlayout?id={f.InventoryId}&doj={f.Doj}");
        Assert.False((bool)after["seats"]!.AsArray().First(s => (string)s!["name"]! == name)!["available"]!);
        Assert.True(fx.Factory.Services.GetRequiredService<IGdsCache>().IsConnected);
    }
}

[Collection("gds")]
public sealed class SecurityAndTenancyTests(GdsFixture fx)
{
    [Fact]
    public async Task Admin_requires_key_and_is_tenant_scoped()
    {
        var anon = fx.Factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/admin/integrations/redbus/status")).StatusCode);

        var bad = fx.Factory.Admin("wrong");
        Assert.Equal(HttpStatusCode.Unauthorized, (await bad.GetAsync("/api/admin/integrations/redbus/status")).StatusCode);

        var demo = await fx.Factory.Admin().GetJson($"/api/admin/trips?date={GdsFixture.Today.AddDays(1):yyyy-MM-dd}");
        Assert.NotEmpty(demo.AsArray());
        var other = await fx.Factory.Admin(GdsFactory.OtherTenantKey).GetJson($"/api/admin/trips?date={GdsFixture.Today.AddDays(1):yyyy-MM-dd}");
        Assert.Empty(other.AsArray());
        var otherStatus = await fx.Factory.Admin(GdsFactory.OtherTenantKey).GetJson("/api/admin/integrations/redbus/status");
        Assert.False((bool)otherStatus["configured"]!);
    }

    [Fact]
    public async Task Status_never_exposes_callback_url()
    {
        var admin = fx.Factory.Admin();
        var put = await admin.PutAsync("/api/admin/integrations/redbus/config",
            System.Net.Http.Json.JsonContent.Create(new { operatorCode = "TESTOP", callbackUrl = "https://user:secret@mock.redbus.test/hook?token=abc", outboundEnabled = false }));
        Assert.True(put.IsSuccessStatusCode);
        var text = (await admin.GetJson("/api/admin/integrations/redbus/status")).ToJsonString();
        Assert.DoesNotContain("secret", text);
        Assert.DoesNotContain("token", text);
        Assert.Contains("mock.redbus.test", text);
    }

    [Fact]
    public async Task Inbound_requires_secret_when_configured_and_fails_closed_in_production()
    {
        await using var withSecret = new GdsFactory(fx.Pg.GetConnectionString(), fx.Redis.GetConnectionString(), new() { ["RedBus:InboundSecret"] = "s3cret" });
        var c = withSecret.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/redbus/cities")).StatusCode);
        c.DefaultRequestHeaders.Add("X-GDS-Key", "s3cret");
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/redbus/cities")).StatusCode);

        await using var prod = new GdsFactory(fx.Pg.GetConnectionString(), fx.Redis.GetConnectionString(), new() { ["Database:MigrateOnStartup"] = "false" }, "Production");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await prod.CreateClient().GetAsync("/redbus/cities")).StatusCode);
    }

    [Fact]
    public async Task Tentative_release_is_disabled_until_contract_confirmed()
    {
        var r = await fx.Factory.CreateClient().GetAsync("/redbus/tentativerelease?blockKey=x");
        Assert.Equal((HttpStatusCode)501, r.StatusCode);
    }
}

[Collection("gds")]
public sealed class OutboxTests(GdsFixture fx)
{
    private async Task<OutboxMessage> Seed(string action, string key)
    {
        return await fx.Sql(async db =>
        {
            var tenant = await db.Tenants.FirstAsync(t => t.Code == "demo");
            var m = new OutboxMessage { TenantId = tenant.Id, Provider = "REDBUS", ActionType = action, DedupKey = key, PayloadJson = "{\"action_type\":\"" + action + "\"}", Status = OutboxStatus.Pending, NextAttemptAt = DateTime.UtcNow.AddYears(-1), CreatedAt = DateTime.UtcNow };
            db.Outbox.Add(m);
            await db.SaveChangesAsync();
            return m;
        });
    }

    private async Task Configure(bool enabled, string url = "https://mock.redbus.test/callback")
    {
        var put = await fx.Factory.Admin().PutAsync("/api/admin/integrations/redbus/config",
            System.Net.Http.Json.JsonContent.Create(new { operatorCode = "TESTOP", callbackUrl = url, outboundEnabled = enabled }));
        Assert.True(put.IsSuccessStatusCode);
    }

    private async Task<OutboxMessage> Reload(long id) => await fx.Sql(db => db.Outbox.IgnoreQueryFilters().AsNoTracking().FirstAsync(m => m.Id == id));

    private async Task Drain()
    {
        // Park everything else so each test observes only its own message.
        var d = fx.Factory.Services.GetRequiredService<OutboxDispatcher>();
        await d.RunOnceAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Disabled_provider_never_sends_and_never_marks_success()
    {
        await fx.Sql(db => db.Database.ExecuteSqlRawAsync("UPDATE outbox_messages SET next_attempt_at = now() + interval '1 day' WHERE status = 1"));
        await Configure(false);
        var m = await Seed(RedBusActions.Search, $"SEARCH:test:{Guid.NewGuid()}");
        var sent = fx.Factory.RedBus.Received.Count;
        await Drain();
        var r = await Reload(m.Id);
        Assert.Equal(OutboxStatus.Pending, r.Status);
        Assert.Equal(0, r.Attempts);
        Assert.Equal(sent, fx.Factory.RedBus.Received.Count);
    }

    [Fact]
    public async Task Ack_body_marks_acknowledged_and_non_ack_2xx_is_not_success()
    {
        await fx.Sql(db => db.Database.ExecuteSqlRawAsync("UPDATE outbox_messages SET next_attempt_at = now() + interval '1 day' WHERE status = 1"));
        await Configure(true);
        var m = await Seed(RedBusActions.UpdateService, $"UPDATE_SERVICE:test:{Guid.NewGuid()}");
        fx.Factory.RedBus.Respond = (_, _) => MockRedBusHandler.Ok("{\"status\":\"ok\"}");
        await Drain();
        Assert.Equal(OutboxStatus.Acknowledged, (await Reload(m.Id)).Status);
        Assert.Contains(fx.Factory.RedBus.Received, x => x.Url.Contains("action_type=UPDATE_SERVICE"));

        var m2 = await Seed(RedBusActions.UpdateService, $"UPDATE_SERVICE:test:{Guid.NewGuid()}");
        fx.Factory.RedBus.Respond = (_, _) => MockRedBusHandler.Ok("{\"status\":\"accepted?\"}");
        await Drain();
        var r2 = await Reload(m2.Id);
        Assert.NotEqual(OutboxStatus.Acknowledged, r2.Status);
        Assert.Equal(1, r2.Attempts);

        var m3 = await Seed(RedBusActions.ManualBusCancellation, $"MANUAL_BUS_CANCELLATION:test:{Guid.NewGuid()}");
        fx.Factory.RedBus.Respond = (_, _) => MockRedBusHandler.Ok("SUCCESS");
        await Drain();
        Assert.Equal(OutboxStatus.Acknowledged, (await Reload(m3.Id)).Status);
        await Configure(false);
    }

    [Fact]
    public async Task Ambiguous_bus_cancellation_is_blocked_and_5xx_is_retried()
    {
        await fx.Sql(db => db.Database.ExecuteSqlRawAsync("UPDATE outbox_messages SET next_attempt_at = now() + interval '1 day' WHERE status = 1"));
        await Configure(true);
        var m = await Seed(RedBusActions.ManualBusCancellation, $"MANUAL_BUS_CANCELLATION:test:{Guid.NewGuid()}");
        fx.Factory.RedBus.Respond = (_, _) => MockRedBusHandler.Ok("<html>maybe</html>");
        await Drain();
        Assert.Equal(OutboxStatus.Blocked, (await Reload(m.Id)).Status);

        var m2 = await Seed(RedBusActions.Search, $"SEARCH:test:{Guid.NewGuid()}");
        fx.Factory.RedBus.Respond = (_, _) => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
        await Drain();
        var r2 = await Reload(m2.Id);
        Assert.Equal(OutboxStatus.Pending, r2.Status);
        Assert.True(r2.NextAttemptAt > DateTime.UtcNow);
        Assert.Equal(503, r2.LastHttpStatus);

        // Operator retry of a blocked message requires write role and resets to pending.
        var (st, _) = await fx.Factory.Admin().Post($"/api/admin/integrations/redbus/outbox/{m.Id}/retry", new { });
        Assert.Equal(HttpStatusCode.OK, st);
        Assert.Equal(OutboxStatus.Pending, (await Reload(m.Id)).Status);
        await fx.Sql(db => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE outbox_messages SET status = 4 WHERE id = {m.Id}"));
        await Configure(false);
    }

    [Fact]
    public async Task Http_callback_is_refused_unless_explicitly_allowed()
    {
        await fx.Sql(db => db.Database.ExecuteSqlRawAsync("UPDATE outbox_messages SET next_attempt_at = now() + interval '1 day' WHERE status = 1"));
        await Configure(true, "http://insecure.test/cb");
        var m = await Seed(RedBusActions.Search, $"SEARCH:test:{Guid.NewGuid()}");
        var sent = fx.Factory.RedBus.Received.Count;
        await Drain();
        Assert.Equal(sent, fx.Factory.RedBus.Received.Count);
        Assert.Equal(0, (await Reload(m.Id)).Attempts);
        await Configure(false);
    }

    [Fact]
    public async Task Pending_duplicates_are_coalesced()
    {
        var key = $"UPDATE_SERVICE:coalesce:{Guid.NewGuid()}";
        using var scope = fx.Factory.Services.CreateScope();
        var tc = (TenantContext)scope.ServiceProvider.GetRequiredService<ITenantContext>();
        tc.TenantId = await fx.Sql(db => db.Tenants.Where(t => t.Code == "demo").Select(t => t.Id).FirstAsync());
        var w = scope.ServiceProvider.GetRequiredService<OutboxWriter>();
        Assert.True(await w.EnqueueAsync(RedBusActions.UpdateService, key, new { a = 1 }));
        Assert.False(await w.EnqueueAsync(RedBusActions.UpdateService, key, new { a = 2 }));
        Assert.Equal(1, await fx.Sql(db => db.Outbox.IgnoreQueryFilters().CountAsync(m => m.DedupKey == key)));
    }
}
