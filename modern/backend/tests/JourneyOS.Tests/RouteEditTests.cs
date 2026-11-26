using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Tests;

/// <summary>Route editor structural writes: coach, via cities, points, standing seat blocks, timetable shift. Each test edits its own clone.</summary>
[Collection("gds")]
public sealed class RouteEditTests(GdsFixture fx)
{
    private HttpClient Admin => fx.Factory.Admin();
    private static DateOnly Day(int offset) => DateOnly.FromDateTime(DateTime.UtcNow.AddDays(offset));

    /// <summary>Copies the first seeded route (stops, points, fares) into a new active route with no departures.</summary>
    private async Task<long> CloneRouteAsync() => await fx.Sql(async db =>
    {
        var src = await db.Routes.AsNoTracking().Include(r => r.Stops).Include(r => r.Stages).Include(r => r.Fares).OrderBy(r => r.Id).FirstAsync();
        var id = await db.Routes.IgnoreQueryFilters().MaxAsync(r => r.Id) + 1;
        Assert.True(id <= 999, "route id scheme");
        var r = new Route
        {
            Id = id, TenantId = src.TenantId, ServiceNumber = "T" + id, Name = src.Name + " (test)", CoachTemplateId = src.CoachTemplateId,
            DepartureTime = src.DepartureTime, Status = "active", ArrivalTime = src.ArrivalTime, ArrivalDay = src.ArrivalDay,
            Stops = src.Stops.Select(s => new RouteStop { Sequence = s.Sequence, CityId = s.CityId, Day = s.Day, Time = s.Time }).ToList(),
            Fares = src.Fares.Select(f => new RouteFare { FromSequence = f.FromSequence, ToSequence = f.ToSequence, Seater = f.Seater, SleeperLower = f.SleeperLower, SleeperUpper = f.SleeperUpper }).ToList(),
        };
        db.Routes.Add(r);
        await db.SaveChangesAsync();
        foreach (var s in src.Stages)
        {
            var sid = await db.Database.SqlQueryRaw<long>("SELECT nextval('master_ids') AS \"Value\"").SingleAsync();
            db.RouteStages.Add(new RouteStage
            {
                Id = sid, RouteId = id, CityId = s.CityId, StopSequence = s.StopSequence, Kind = s.Kind, Name = s.Name, Day = s.Day, Time = s.Time, Prime = s.Prime,
            });
        }
        await db.SaveChangesAsync();
        return id;
    });

    private async Task Generate(long routeId, DateOnly from, DateOnly to)
    {
        var (s, e) = await Admin.Post($"/api/admin/routes/{routeId}/generate", new { from, to });
        Assert.True(s == HttpStatusCode.OK, e?.ToJsonString());
    }

    private async Task<(HttpStatusCode, JsonNode?)> Put(string url, object body)
    {
        var r = await Admin.PutAsJsonAsync(url, body);
        var text = await r.Content.ReadAsStringAsync();
        return (r.StatusCode, string.IsNullOrEmpty(text) ? null : JsonNode.Parse(text));
    }

    private Task<List<RouteStop>> Stops(long routeId) =>
        fx.Sql(db => db.RouteStops.AsNoTracking().Where(s => s.RouteId == routeId).OrderBy(s => s.Sequence).ToListAsync());

    private static object StopIn(RouteStop s) => new { id = s.Id, cityId = s.CityId, day = s.Day, time = s.Time.ToString("HH:mm") };

    [Fact]
    public async Task Inserting_a_via_city_renumbers_every_stored_segment_and_removal_of_used_cities_is_refused()
    {
        var routeId = await CloneRouteAsync();
        await Generate(routeId, Day(3), Day(4));
        var trip = await fx.Sql(db => db.Trips.Where(t => t.RouteId == routeId).OrderBy(t => t.TravelDate).Select(t => t.Id).FirstAsync());
        var seat = await fx.Sql(db => db.Routes.Where(r => r.Id == routeId).SelectMany(r => r.CoachTemplate!.Seats).Select(s => s.Code).FirstAsync());
        var stops = await Stops(routeId);
        var (sb, eb) = await Admin.Post($"/api/admin/trips/{trip}/blocks", new { seats = new[] { seat }, fromSequence = 1, toSequence = stops[^1].Sequence, reason = "test" });
        Assert.True(sb == HttpStatusCode.OK, eb?.ToJsonString());

        var onRoute = stops.Select(s => s.CityId).ToList();
        var newCity = await fx.Sql(db => db.Cities.Where(c => c.IsActive && !onRoute.Contains(c.Id)).Select(c => c.Id).FirstOrDefaultAsync());
        Assert.True(newCity > 0, "seed needs a city that is not on the route");
        // a minute after the origin: always strictly between origin and the next stop
        var mid = new { id = (long?)null, cityId = newCity, day = stops[0].Day, time = stops[0].Time.AddMinutes(1).ToString("HH:mm") };
        var list = new List<object> { StopIn(stops[0]), mid };
        list.AddRange(stops.Skip(1).Select(StopIn));
        var (s1, r1) = await Put($"/api/admin/routes/{routeId}/stops", list);
        Assert.True(s1 == HttpStatusCode.OK, r1?.ToJsonString());
        Assert.Equal(1, (int)r1!["added"]!);
        Assert.NotEmpty(r1["pairsWithoutFare"]!.AsArray());

        var after = await Stops(routeId);
        Assert.Equal(stops.Count + 1, after.Count);
        Assert.Equal(Enumerable.Range(0, after.Count), after.Select(s => s.Sequence));
        var alloc = await fx.Sql(db => db.SeatAllocations.AsNoTracking().FirstAsync(a => a.TripId == trip && a.IsActive && a.SeatCode == seat));
        Assert.Equal((2, after.Count - 1), (alloc.FromSeq, alloc.ToSeq)); // shifted with its cities
        var fares = await fx.Sql(db => db.RouteFares.Where(f => f.RouteId == routeId).ToListAsync());
        Assert.DoesNotContain(fares, f => f.FromSequence == 1 || f.ToSequence == 1);
        Assert.True(await fx.Sql(db => db.RouteStages.Where(s => s.RouteId == routeId).AllAsync(s => s.StopSequence != 1)));

        // stop 2 (old 1) is the allocation's boarding city: it cannot be removed
        var (s2, e2) = await Put($"/api/admin/routes/{routeId}/stops", after.Where(s => s.Sequence != 2).Select(StopIn).ToList());
        Assert.Equal(HttpStatusCode.Conflict, s2);
        Assert.True((string)e2!["errorCode"]! is "STOP_IN_USE" or "STOP_HAS_POINTS", e2.ToJsonString());
        // reordering kept cities is refused
        var swapped = after.Select(StopIn).ToList(); (swapped[2], swapped[3]) = (swapped[3], swapped[2]);
        var (s3, _) = await Put($"/api/admin/routes/{routeId}/stops", swapped);
        Assert.True(s3 is HttpStatusCode.Conflict or HttpStatusCode.BadRequest);
        // the inserted city was never sold: it can go again
        var (s4, r4) = await Put($"/api/admin/routes/{routeId}/stops", after.Where(s => s.Sequence != 1).Select(StopIn).ToList());
        Assert.True(s4 == HttpStatusCode.OK, r4?.ToJsonString());
        alloc = await fx.Sql(db => db.SeatAllocations.AsNoTracking().FirstAsync(a => a.TripId == trip && a.IsActive && a.SeatCode == seat));
        Assert.Equal((1, stops[^1].Sequence), (alloc.FromSeq, alloc.ToSeq));
        Assert.True(await fx.Sql(db => db.AuditLogs.AnyAsync(a => a.Action == "ROUTE_STOPS_UPDATE" && a.EntityId == routeId.ToString())));
    }

    [Fact]
    public async Task Pickup_drop_and_break_points_are_created_edited_and_deleted_with_one_prime_per_city()
    {
        var routeId = await CloneRouteAsync();
        var stops = await Stops(routeId);
        var origin = stops[0]; var last = stops[^1];
        object Point(string kind, long city, string name, bool prime, string time) =>
            new { kind, cityId = city, name, address = "Main road", landmark = (string?)null, contactNumber = "9876543210", lat = 17.4m, lng = 78.4m, day = 1, time, prime };

        var (s1, p1) = await Admin.Post($"/api/admin/routes/{routeId}/stages", Point("pickup", origin.CityId, "Test Pickup", true, origin.Time.ToString("HH:mm")));
        Assert.True(s1 == HttpStatusCode.OK, p1?.ToJsonString());
        var pid = (long)p1!["id"]!;
        var primes = await fx.Sql(db => db.RouteStages.Where(s => s.RouteId == routeId && s.CityId == origin.CityId && s.Kind == "pickup" && s.Prime).Select(s => s.Id).ToListAsync());
        Assert.Equal([pid], primes);

        var (s2, _) = await Put($"/api/admin/routes/{routeId}/stages/{pid}", Point("pickup", origin.CityId, "Test Pickup Renamed", false, origin.Time.ToString("HH:mm")));
        Assert.Equal(HttpStatusCode.OK, s2);
        Assert.Equal("Test Pickup Renamed", await fx.Sql(db => db.RouteStages.Where(s => s.Id == pid).Select(s => s.Name).FirstAsync()));

        var (s3, b) = await Admin.Post($"/api/admin/routes/{routeId}/stages", Point("break", stops[1].CityId, "Tea break", false, stops[1].Time.ToString("HH:mm")));
        Assert.True(s3 == HttpStatusCode.OK, b?.ToJsonString());
        var detail = await Admin.GetJson($"/api/admin/route-detail/{routeId}");
        Assert.Contains(detail["stages"]!.AsArray(), x => (string)x!["kind"]! == "break" && (string)x["name"]! == "Tea break");

        var (s4, e4) = await Admin.Post($"/api/admin/routes/{routeId}/stages", Point("pickup", last.CityId, "Nope", false, "10:00"));
        Assert.Equal(HttpStatusCode.BadRequest, s4);
        var (s5, _) = await Admin.Post($"/api/admin/routes/{routeId}/stages", Point("drop", origin.CityId, "Nope", false, "10:00"));
        Assert.Equal(HttpStatusCode.BadRequest, s5);

        Assert.Equal(HttpStatusCode.OK, (await Admin.DeleteAsync($"/api/admin/routes/{routeId}/stages/{pid}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Admin.DeleteAsync($"/api/admin/routes/{routeId}/stages/{(long)b!["id"]!}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Admin.DeleteAsync($"/api/admin/routes/{routeId}/stages/{pid}")).StatusCode);
        // the prime role passes back to a remaining origin pickup
        Assert.True(await fx.Sql(db => db.RouteStages.CountAsync(s => s.RouteId == routeId && s.CityId == origin.CityId && s.Kind == "pickup" && s.Prime)) <= 1);
    }

    [Fact]
    public async Task Standing_seat_block_applies_to_existing_and_new_departures_and_per_trip_unblock_sticks()
    {
        var routeId = await CloneRouteAsync();
        await Generate(routeId, Day(10), Day(11));
        var codes = await fx.Sql(db => db.Routes.Where(r => r.Id == routeId).SelectMany(r => r.CoachTemplate!.Seats).OrderBy(s => s.Id).Select(s => s.Code).Take(2).ToListAsync());
        var (s1, r1) = await Admin.Post($"/api/admin/routes/{routeId}/seat-blocks", new { seats = codes, reason = "Crew", fromDate = (DateOnly?)null, toDate = (DateOnly?)null, autoReleaseHours = (int?)null });
        Assert.True(s1 == HttpStatusCode.OK, r1?.ToJsonString());
        var blockId = (long)r1!["id"]!;
        Assert.Equal(4, (int)r1["result"]!["seatsBlocked"]!);
        var tag = "route_block:" + blockId;

        var trips = await fx.Sql(db => db.Trips.Where(t => t.RouteId == routeId).OrderBy(t => t.TravelDate).Select(t => t.Id).ToListAsync());
        Assert.Equal(HttpStatusCode.OK, (await Admin.DeleteAsync($"/api/admin/trips/{trips[0]}/blocks/{codes[0]}")).StatusCode);
        // editing the block re-applies it, but the seat released on that departure stays released
        var (s2, r2) = await Put($"/api/admin/routes/{routeId}/seat-blocks/{blockId}", new { seats = codes, reason = "Crew berth", autoReleaseHours = (int?)null });
        Assert.True(s2 == HttpStatusCode.OK, r2?.ToJsonString());
        Assert.False(await fx.Sql(db => db.SeatAllocations.AnyAsync(a => a.TripId == trips[0] && a.SeatCode == codes[0] && a.IsActive && a.Reason == tag)));

        await Generate(routeId, Day(12), Day(12));
        var newTrip = await fx.Sql(db => db.Trips.Where(t => t.RouteId == routeId).OrderByDescending(t => t.TravelDate).Select(t => t.Id).FirstAsync());
        Assert.Equal(2, await fx.Sql(db => db.SeatAllocations.CountAsync(a => a.TripId == newTrip && a.IsActive && a.Reason == tag)));

        var (sd, ed) = await Admin.Post($"/api/admin/routes/{routeId}/seat-blocks", new { seats = new[] { codes[1] }, reason = "Dup" });
        Assert.Equal(HttpStatusCode.Conflict, sd);
        Assert.Equal("DUPLICATE_BLOCK", (string)ed!["errorCode"]!);
        var (sx, _) = await Admin.Post($"/api/admin/routes/{routeId}/seat-blocks", new { seats = new[] { "NOPE99" } });
        Assert.Equal(HttpStatusCode.BadRequest, sx);

        Assert.Equal(HttpStatusCode.OK, (await Admin.DeleteAsync($"/api/admin/routes/{routeId}/seat-blocks/{blockId}")).StatusCode);
        Assert.Equal(0, await fx.Sql(db => db.SeatAllocations.CountAsync(a => a.IsActive && a.Reason == tag)));
        Assert.False(await fx.Sql(db => db.RouteSeatBlocks.AnyAsync(b => b.Id == blockId)));

        // auto-release window already open (168 h before a departure 3 days out): nothing is held back
        await Generate(routeId, Day(3), Day(3));
        var (s3, r3) = await Admin.Post($"/api/admin/routes/{routeId}/seat-blocks", new { seats = codes, reason = "Late quota", fromDate = Day(3), toDate = Day(3), autoReleaseHours = 168 });
        Assert.True(s3 == HttpStatusCode.OK, r3?.ToJsonString());
        Assert.Equal(0, (int)r3!["result"]!["seatsBlocked"]!);
    }

    [Fact]
    public async Task Timetable_shift_previews_then_moves_cities_points_and_route_header()
    {
        var routeId = await CloneRouteAsync();
        await Generate(routeId, Day(5), Day(6));
        var before = await Stops(routeId);
        var stagesBefore = await fx.Sql(db => db.RouteStages.AsNoTracking().Where(s => s.RouteId == routeId).OrderBy(s => s.Id).ToListAsync());
        var dir = before[0].Time.Hour < 23 ? "delay" : "advance";
        var sign = dir == "delay" ? 1 : -1;

        var (s0, p0) = await Admin.Post($"/api/admin/routes/{routeId}/shift-time", new { direction = dir, hours = 0, minutes = 30, dryRun = true });
        Assert.True(s0 == HttpStatusCode.OK, p0?.ToJsonString());
        Assert.Equal(30 * sign, (int)p0!["deltaMinutes"]!);
        Assert.Equal(2, (int)p0["departures"]!);
        Assert.Equal(before.Count, p0["cities"]!.AsArray().Count);
        Assert.Equal(before.Select(s => s.Time), (await Stops(routeId)).Select(s => s.Time)); // dry run changes nothing

        var (s1, _) = await Admin.Post($"/api/admin/routes/{routeId}/shift-time", new { direction = dir, hours = 0, minutes = 30, dryRun = false });
        Assert.Equal(HttpStatusCode.OK, s1);
        var after = await Stops(routeId);
        Assert.All(before.Zip(after), x => Assert.Equal((x.First.Day - 1) * 1440 + x.First.Time.Hour * 60 + x.First.Time.Minute + 30 * sign,
            (x.Second.Day - 1) * 1440 + x.Second.Time.Hour * 60 + x.Second.Time.Minute));
        var stagesAfter = await fx.Sql(db => db.RouteStages.AsNoTracking().Where(s => s.RouteId == routeId).OrderBy(s => s.Id).ToListAsync());
        Assert.All(stagesBefore.Zip(stagesAfter), x => Assert.Equal(x.First.Time.AddMinutes(30 * sign), x.Second.Time));
        Assert.Equal(after[0].Time, await fx.Sql(db => db.Routes.Where(r => r.Id == routeId).Select(r => r.DepartureTime).FirstAsync()));
        Assert.True(await fx.Sql(db => db.AuditLogs.AnyAsync(a => a.Action == "ROUTE_SHIFT_TIME" && a.EntityId == routeId.ToString())));

        // moving the origin off day 1 is refused
        var originMin = after[0].Time.Hour * 60 + after[0].Time.Minute;
        var (s2, e2) = originMin + 1 <= 720
            ? await Admin.Post($"/api/admin/routes/{routeId}/shift-time", new { direction = "advance", hours = (originMin + 1) / 60, minutes = (originMin + 1) % 60, dryRun = true })
            : await Admin.Post($"/api/admin/routes/{routeId}/shift-time", new { direction = "delay", hours = (1440 - originMin) / 60, minutes = (1440 - originMin) % 60, dryRun = true });
        Assert.Equal(HttpStatusCode.Conflict, s2);
        Assert.Equal("SHIFT_CROSSES_MIDNIGHT", (string)e2!["errorCode"]!);
        var (s3, _) = await Admin.Post($"/api/admin/routes/{routeId}/shift-time", new { direction = "sideways", hours = 1, minutes = 0, dryRun = true });
        Assert.Equal(HttpStatusCode.BadRequest, s3);
    }

    [Fact]
    public async Task Coach_change_is_a_no_op_for_the_same_coach_and_refused_when_blocked_seats_are_missing()
    {
        var routeId = await CloneRouteAsync();
        var coach = await fx.Sql(db => db.Routes.Where(r => r.Id == routeId).Select(r => r.CoachTemplateId).FirstAsync());
        var (s0, r0) = await Put($"/api/admin/routes/{routeId}/coach", new { coachTemplateId = coach });
        Assert.Equal(HttpStatusCode.OK, s0);
        Assert.False((bool)r0!["changed"]!);

        var codes = await fx.Sql(db => db.CoachSeats.Where(s => s.CoachTemplateId == coach).Select(s => s.Code).ToListAsync());
        var other = await fx.Sql(async db =>
        {
            foreach (var c in await db.CoachTemplates.Where(c => c.Id != coach && c.Status == "active").Include(c => c.Seats).ToListAsync())
                if (codes.FirstOrDefault(code => c.Seats.All(s => !string.Equals(s.Code, code, StringComparison.OrdinalIgnoreCase))) is { } missing && c.Seats.Count > 0)
                    return (Id: c.Id, Missing: missing);
            return (Id: 0L, Missing: "");
        });
        if (other.Id == 0) return; // seed has no second layout
        var (sb, _) = await Admin.Post($"/api/admin/routes/{routeId}/seat-blocks", new { seats = new[] { other.Missing }, reason = "Crew" });
        Assert.Equal(HttpStatusCode.OK, sb);
        var (s1, e1) = await Put($"/api/admin/routes/{routeId}/coach", new { coachTemplateId = other.Id });
        Assert.Equal(HttpStatusCode.Conflict, s1);
        Assert.Equal("COACH_SEATS_MISSING", (string)e1!["errorCode"]!);
        Assert.Equal(coach, await fx.Sql(db => db.Routes.Where(r => r.Id == routeId).Select(r => r.CoachTemplateId).FirstAsync()));
    }
}
