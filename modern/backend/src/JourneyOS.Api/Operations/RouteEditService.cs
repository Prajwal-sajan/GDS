using System.Globalization;
using JourneyOS.Api.Caching;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Outbox;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace JourneyOS.Api.Operations;

public sealed record RouteCoachInput(long CoachTemplateId);
public sealed record RouteStopInput(long? Id, long CityId, int Day, string Time);
public sealed record RouteStageInput(string Kind, long CityId, string Name, string? Address, string? Landmark, string? ContactNumber,
    decimal? Lat, decimal? Lng, int Day, string Time, bool Prime, string? PickupType, string? ExchangePoint, string? ExchangeTime, string? MetroDescription);
public sealed record RouteSeatBlockInput(List<string> Seats, string? Reason, DateOnly? FromDate, DateOnly? ToDate, int? AutoReleaseHours);
public sealed record RouteShiftInput(string Direction, int Hours, int Minutes, bool DryRun);

/// <summary>
/// Write side of the route editor for the structural parts of a route: coach, via cities, pickup / drop / break points, standing seat
/// blocks and the timetable shift. Route data is shared by every departure and by every booking ever sold on it, so each operation:
/// <list type="bullet">
/// <item>validates fully before mutating and runs in one transaction;</item>
/// <item>never rewrites history — anything a booking, hold or seat allocation points at (stop sequence, stage id, seat code) is either
/// remapped consistently in every table that stores it, or the change is refused with a reason the operator can act on;</item>
/// <item>is audited on the route, notifies the OTA (UPDATE/REMOVE_SERVICE through the outbox) and invalidates trip/search caches.</item>
/// </list>
/// Stop sequence is the segment key stored in route_stops, route_stages, route_fares, seat_allocations, seat_holds, bookings,
/// ota_inventories and trips.fare_override_json; <see cref="ReplaceStopsAsync"/> keeps all eight in step.
/// </summary>
public sealed class RouteEditService(GdsDbContext db, InventoryService inventory, RedBusNotifier notifier, IGdsCache cache, TimeProvider clock)
{
    public const string BlockReasonPrefix = "route_block:";
    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    private long T => db.CurrentTenantId;

    private void Audit(string actor, string action, long routeId, object data) =>
        db.AuditLogs.Add(new AuditLog { TenantId = T, Actor = actor, Action = action, Entity = "route", EntityId = routeId.ToString(), DataJson = System.Text.Json.JsonSerializer.Serialize(data), At = Now });

    private async Task<long> NextIdAsync() => await db.Database.SqlQueryRaw<long>("SELECT nextval('master_ids') AS \"Value\"").SingleAsync();

    private async Task<string> TimeZoneAsync() => (await inventory.TenantAsync()).TimeZone;

    private async Task<DateOnly> TodayAsync()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(await TimeZoneAsync());
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(Now, zone));
    }

    private static TimeOnly ParseTime(string? s, string field)
    {
        if (TimeOnly.TryParseExact(s ?? "", ["HH:mm", "H:mm", "HH:mm:ss"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var t)) return t;
        throw new GdsException("VALIDATION", $"{field} must be a time like 17:30");
    }

    private static int Abs(int day, TimeOnly t) => (day - 1) * 1440 + t.Hour * 60 + t.Minute;
    private static (int Day, TimeOnly Time) FromAbs(int abs) => (1 + abs / 1440, new TimeOnly(abs % 1440 / 60, abs % 60));

    /// <summary>Locks the route row so two editors cannot interleave structural changes.</summary>
    private async Task LockRouteAsync(long routeId)
    {
        var n = await db.Database.SqlQuery<long>($"SELECT id AS \"Value\" FROM routes WHERE id = {routeId} AND tenant_id = {T} FOR UPDATE").ToListAsync();
        if (n.Count == 0) throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);
    }

    private async Task<List<Trip>> UpcomingTripsAsync(long routeId)
    {
        var today = await TodayAsync();
        return await db.Trips.Where(t => t.RouteId == routeId && t.TravelDate >= today && t.Status == "active" && t.DeletedAt == null).OrderBy(t => t.TravelDate).ToListAsync();
    }

    private async Task NotifyAndCommitAsync(Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction tx, IEnumerable<Trip> trips)
    {
        var list = trips.ToList();
        foreach (var t in list) await notifier.ServiceChangedAsync(t, 0, int.MaxValue);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        foreach (var t in list) await inventory.InvalidateTripAsync(t.Id);
        await cache.BumpAsync(CacheKeys.SearchScope(T));
    }

    // =====================================================================================================
    // Coach change
    // =====================================================================================================

    /// <summary>
    /// Changes the seat layout every departure of the route is sold on. Upcoming departures keep every seat already sold, held or
    /// blocked: each allocation and passenger is moved to the seat with the same code in the new coach. Refused when a used seat code
    /// does not exist in the new coach, when standing blocks / fare rules reference missing seats, or when a bus with a different
    /// layout is assigned to an upcoming departure (the bus would not match the seat map passengers were sold).
    /// Past departures are history and keep the layout they ran with.
    /// </summary>
    public async Task<object> ChangeCoachAsync(long routeId, long coachId, string actor)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        await LockRouteAsync(routeId);
        var route = await db.Routes.Include(r => r.SeatBlocks).Include(r => r.SeatFareRules).FirstAsync(r => r.Id == routeId);
        if (route.CoachTemplateId == coachId) { await tx.CommitAsync(); return new { changed = false, remappedSeats = 0 }; }
        var coach = await db.CoachTemplates.Include(c => c.Seats).FirstOrDefaultAsync(c => c.Id == coachId) ?? throw new GdsException("VALIDATION", "Unknown coach");
        if (coach.Status != "active") throw new GdsException("COACH_INACTIVE", $"{coach.Name} is inactive; activate it in Fleet → Coaches first", 409);
        if (coach.Seats.Count == 0) throw new GdsException("COACH_EMPTY", $"{coach.Name} has no seats configured", 409);
        var seats = coach.Seats.ToDictionary(s => s.Code, StringComparer.OrdinalIgnoreCase);

        var today = await TodayAsync();
        var tripIds = await db.Trips.Where(t => t.RouteId == routeId && t.TravelDate >= today).Select(t => t.Id).ToListAsync();
        var allocs = await db.SeatAllocations.Where(a => a.IsActive && tripIds.Contains(a.TripId)).ToListAsync();
        var missing = allocs.Where(a => !seats.ContainsKey(a.SeatCode)).Select(a => a.SeatCode).Distinct().Order().ToList();
        if (missing.Count > 0)
            throw new GdsException("COACH_SEATS_MISSING", $"Seats {string.Join(", ", missing)} are sold, held or blocked on upcoming departures but do not exist in {coach.Name}. Shift those passengers or release the seats first.", 409);
        var blockMissing = route.SeatBlocks.SelectMany(b => b.Seats).Where(s => !seats.ContainsKey(s)).Distinct().ToList();
        if (blockMissing.Count > 0)
            throw new GdsException("COACH_SEATS_MISSING", $"Standing seat blocks use seats {string.Join(", ", blockMissing)} that do not exist in {coach.Name}. Release them on the Block tab first.", 409);
        var ruleMissing = route.SeatFareRules.SelectMany(r => r.Seats).Where(s => !seats.ContainsKey(s)).Distinct().ToList();
        if (ruleMissing.Count > 0)
            throw new GdsException("COACH_SEATS_MISSING", $"Fare rules use seats {string.Join(", ", ruleMissing)} that do not exist in {coach.Name}. Edit the fare rules first.", 409);
        var mismatched = await (from a in db.TripAssignments
                                join t in db.Trips on a.TripId equals t.Id
                                join v in db.Vehicles on a.VehicleId equals (long?)v.Id
                                where a.IsActive && a.VehicleId != null && t.RouteId == routeId && t.TravelDate >= today && t.Status == "active" && v.CoachTemplateId != coachId
                                orderby t.TravelDate
                                select new { t.TravelDate, v.RegistrationNumber }).ToListAsync();
        if (mismatched.Count > 0)
            throw new GdsException("VEHICLE_COACH_MISMATCH", $"{mismatched.Count} upcoming departure(s) have a bus with a different layout assigned ({string.Join(", ", mismatched.Take(5).Select(m => $"{m.TravelDate:dd MMM} {m.RegistrationNumber}"))}). Change or unassign those buses first.", 409);

        foreach (var a in allocs) { var s = seats[a.SeatCode]; a.CoachSeatId = s.Id; a.SeatCode = s.Code; }
        var paxRows = await (from p in db.Set<BookingPassenger>() join b in db.Bookings on p.BookingId equals b.Id where tripIds.Contains(b.TripId) select p).ToListAsync();
        foreach (var p in paxRows) if (seats.TryGetValue(p.SeatCode, out var s)) { p.CoachSeatId = s.Id; p.SeatCode = s.Code; }
        var holdPax = await (from p in db.Set<HoldPassenger>() join h in db.SeatHolds on p.HoldId equals h.Id where tripIds.Contains(h.TripId) && h.Status == HoldStatus.Held select p).ToListAsync();
        foreach (var p in holdPax) if (seats.TryGetValue(p.SeatCode, out var s)) { p.CoachSeatId = s.Id; p.SeatCode = s.Code; }

        var previous = route.CoachTemplateId;
        route.CoachTemplateId = coachId;
        Audit(actor, "ROUTE_COACH_CHANGE", routeId, new { from = previous, to = coachId, coach = coach.Name, remapped_seats = allocs.Count, passengers = paxRows.Count });
        await db.SaveChangesAsync();
        await NotifyAndCommitAsync(tx, await UpcomingTripsAsync(routeId));
        return new { changed = true, coach = coach.Name, remappedSeats = allocs.Count };
    }

    // =====================================================================================================
    // Via cities
    // =====================================================================================================

    /// <summary>
    /// Replaces the ordered city list (origin first, destination last). Cities can be inserted anywhere and times edited freely; every
    /// stored stop sequence is renumbered in the same transaction. Kept cities must stay in their order (reordering would turn sold
    /// segments backwards). A city can only be removed if nothing was ever sold on it and it has no pickup/drop points; otherwise the
    /// operator must keep it (and can stop selling it by removing its fares) or create a new route. New city pairs are not put on sale
    /// until fares are entered on the Fares tab.
    /// </summary>
    public async Task<object> ReplaceStopsAsync(long routeId, List<RouteStopInput> input, string actor)
    {
        if (input is not { Count: >= 2 }) throw new GdsException("VALIDATION", "A route needs at least an origin and a destination");
        if (input.Count > 30) throw new GdsException("VALIDATION", "A route can have at most 30 cities");
        var parsed = input.Select((s, i) => (In: s, Time: ParseTime(s.Time, $"City {i + 1} time"))).ToList();
        if (parsed[0].In.Day != 1) throw new GdsException("VALIDATION", "The origin must depart on day 1");
        if (parsed.Any(p => p.In.Day is < 1 or > 7)) throw new GdsException("VALIDATION", "Journey day must be 1-7");
        for (var i = 1; i < parsed.Count; i++)
            if (Abs(parsed[i].In.Day, parsed[i].Time) <= Abs(parsed[i - 1].In.Day, parsed[i - 1].Time))
                throw new GdsException("VALIDATION", $"City {i + 1} must be reached after city {i} (check the day and time)");
        if (parsed.Select(p => p.In.CityId).Distinct().Count() != parsed.Count) throw new GdsException("VALIDATION", "A city can appear only once on a route");
        var cityIds = parsed.Select(p => p.In.CityId).ToList();
        var cities = await db.Cities.Where(c => cityIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id);
        var unknown = cityIds.Where(c => !cities.ContainsKey(c)).ToList();
        if (unknown.Count > 0) throw new GdsException("VALIDATION", $"Unknown city id(s): {string.Join(", ", unknown)}");

        await using var tx = await db.Database.BeginTransactionAsync();
        await LockRouteAsync(routeId);
        var route = await db.Routes.Include(r => r.Stops).Include(r => r.Stages).FirstAsync(r => r.Id == routeId);
        var byId = route.Stops.ToDictionary(s => s.Id);
        foreach (var p in parsed.Where(p => p.In.Id is not null))
            if (!byId.ContainsKey(p.In.Id!.Value)) throw new GdsException("VALIDATION", $"Stop {p.In.Id} does not belong to this route");
        foreach (var p in parsed.Where(p => p.In.Id is null))
            if (!cities[p.In.CityId].IsActive) throw new GdsException("VALIDATION", $"{cities[p.In.CityId].Name} is inactive in the city catalogue");
        var keptSeqs = parsed.Where(p => p.In.Id is not null).Select(p => byId[p.In.Id!.Value].Sequence).ToList();
        if (!keptSeqs.SequenceEqual(keptSeqs.Order())) throw new GdsException("STOP_ORDER_CHANGED", "Cities already on the route cannot be reordered — sold segments would run backwards. Remove and re-add a city only if it was never sold.", 409);

        var allTrips = db.Trips.Where(t => t.RouteId == routeId).Select(t => t.Id);
        async Task<bool> UsedAsync(int seq) =>
            await db.Bookings.AnyAsync(b => allTrips.Contains(b.TripId) && (b.FromSeq == seq || b.ToSeq == seq))
            || await db.SeatHolds.AnyAsync(h => allTrips.Contains(h.TripId) && (h.FromSeq == seq || h.ToSeq == seq))
            || await db.SeatAllocations.AnyAsync(a => allTrips.Contains(a.TripId) && (a.FromSeq == seq || a.ToSeq == seq));
        var keptIds = parsed.Where(p => p.In.Id is not null).Select(p => p.In.Id!.Value).ToHashSet();
        var removed = route.Stops.Where(s => !keptIds.Contains(s.Id)).OrderBy(s => s.Sequence).ToList();
        foreach (var s in removed)
        {
            var name = cities.GetValueOrDefault(s.CityId)?.Name ?? (await db.Cities.Where(c => c.Id == s.CityId).Select(c => c.Name).FirstOrDefaultAsync()) ?? s.CityId.ToString();
            var points = route.Stages.Count(x => x.StopSequence == s.Sequence);
            if (points > 0) throw new GdsException("STOP_HAS_POINTS", $"{name} still has {points} pickup/drop/break point(s). Remove them on the Pickups/Drops/Breaks tabs first.", 409);
            if (await UsedAsync(s.Sequence)) throw new GdsException("STOP_IN_USE", $"{name} has bookings, holds or seat blocks (including past departures) and cannot be removed. Remove its fares to stop selling it, or create a new route.", 409);
        }
        foreach (var p in parsed.Where(p => p.In.Id is not null))
        {
            var s = byId[p.In.Id!.Value];
            if (s.CityId == p.In.CityId) continue;
            if (route.Stages.Any(x => x.StopSequence == s.Sequence) || await UsedAsync(s.Sequence))
                throw new GdsException("STOP_IN_USE", $"City {keptSeqs.IndexOf(s.Sequence) + 1} has points or sales and cannot be switched to another city. Add the new city as a separate stop instead.", 409);
        }

        // old sequence -> new sequence for every kept stop (monotonic by construction)
        var oldSeqs = new List<int>(); var newSeqs = new List<int>();
        for (var i = 0; i < parsed.Count; i++)
            if (parsed[i].In.Id is { } id) { oldSeqs.Add(byId[id].Sequence); newSeqs.Add(i); }
        var removedSeqs = removed.Select(s => s.Sequence).ToArray();
        var tripIdList = await allTrips.ToListAsync();

        // Withdraw published OTA inventory on removed cities (never sold — checked above) while the old stops still resolve.
        if (removedSeqs.Length > 0)
        {
            var invs = await db.OtaInventories.Where(i => tripIdList.Contains(i.TripId) && (removedSeqs.Contains(i.FromSeq) || removedSeqs.Contains(i.ToSeq))).ToListAsync();
            var tripsById = await db.Trips.Where(t => tripIdList.Contains(t.Id)).ToDictionaryAsync(t => t.Id);
            var today = await TodayAsync();
            foreach (var i in invs) if (tripsById[i.TripId] is { Status: "active" } t && t.TravelDate >= today) await notifier.InventoryRemovedAsync(t, i);
            db.OtaInventories.RemoveRange(invs);
            await db.SaveChangesAsync();
        }

        // Renumber in two phases (+1000, then final) so unique indexes and the seat exclusion constraint never see a transient clash.
        var o = oldSeqs.ToArray(); var n = newSeqs.ToArray(); var trips = tripIdList.ToArray();
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM route_fares WHERE route_id = {routeId} AND (from_sequence = ANY({removedSeqs}) OR to_sequence = ANY({removedSeqs}))");
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM route_stops WHERE route_id = {routeId} AND sequence = ANY({removedSeqs})");
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE route_stops SET sequence = sequence + 1000 WHERE route_id = {routeId}");
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE route_stops SET sequence = ({n})[array_position({o}, sequence - 1000)] WHERE route_id = {routeId}");
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE route_stages SET stop_sequence = ({n})[array_position({o}, stop_sequence)] WHERE route_id = {routeId}");
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE route_fares SET from_sequence = from_sequence + 1000, to_sequence = to_sequence + 1000 WHERE route_id = {routeId}");
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE route_fares SET from_sequence = ({n})[array_position({o}, from_sequence - 1000)], to_sequence = ({n})[array_position({o}, to_sequence - 1000)] WHERE route_id = {routeId}");
        foreach (var table in new[] { "seat_allocations", "seat_holds", "bookings", "ota_inventories" })
        {
            await db.Database.ExecuteSqlRawAsync($"UPDATE {table} SET from_seq = from_seq + 1000, to_seq = to_seq + 1000 WHERE trip_id = ANY(@p0)", trips);
            await db.Database.ExecuteSqlRawAsync($"UPDATE {table} SET from_seq = (@p1)[array_position(@p2, from_seq - 1000)], to_seq = (@p1)[array_position(@p2, to_seq - 1000)] WHERE trip_id = ANY(@p0)", trips, n, o);
        }

        db.ChangeTracker.Clear();
        // Per-trip fare overrides (JSON) use the same keys.
        var map = oldSeqs.Zip(newSeqs).ToDictionary(x => x.First, x => x.Second);
        foreach (var t in await db.Trips.Where(t => t.RouteId == routeId && t.FareOverrideJson != null).ToListAsync())
        {
            var fares = System.Text.Json.JsonSerializer.Deserialize<List<TripFare>>(t.FareOverrideJson!) ?? [];
            var remapped = fares.Where(f => map.ContainsKey(f.FromSequence) && map.ContainsKey(f.ToSequence))
                .Select(f => f with { FromSequence = map[f.FromSequence], ToSequence = map[f.ToSequence] }).ToList();
            t.FareOverrideJson = System.Text.Json.JsonSerializer.Serialize(remapped);
        }

        var stops = await db.RouteStops.Where(s => s.RouteId == routeId).ToDictionaryAsync(s => s.Sequence);
        for (var i = 0; i < parsed.Count; i++)
        {
            var p = parsed[i];
            if (p.In.Id is null) db.RouteStops.Add(new RouteStop { RouteId = routeId, Sequence = i, CityId = p.In.CityId, Day = p.In.Day, Time = p.Time });
            else { var s = stops[i]; s.CityId = p.In.CityId; s.Day = p.In.Day; s.Time = p.Time; }
        }
        var r = await db.Routes.FirstAsync(x => x.Id == routeId);
        var first = parsed[0]; var last = parsed[^1];
        r.DepartureTime = first.Time; r.ArrivalTime = last.Time; r.ArrivalDay = last.In.Day;
        r.DurationMinutes = Abs(last.In.Day, last.Time) - Abs(1, first.Time);
        await db.SaveChangesAsync();

        var fareRows = await db.RouteFares.Where(f => f.RouteId == routeId).Select(f => new { f.FromSequence, f.ToSequence }).ToListAsync();
        var missingPairs = new List<object>();
        for (var a = 0; a < parsed.Count; a++)
            for (var b = a + 1; b < parsed.Count; b++)
                if (!fareRows.Any(f => f.FromSequence == a && f.ToSequence == b))
                    missingPairs.Add(new { from = cities[parsed[a].In.CityId].Name, to = cities[parsed[b].In.CityId].Name });
        Audit(actor, "ROUTE_STOPS_UPDATE", routeId, new
        {
            cities = parsed.Select(p => new { city = cities[p.In.CityId].Name, day = p.In.Day, time = p.Time.ToString("HH:mm") }),
            added = parsed.Count(p => p.In.Id is null), removed = removed.Count,
        });
        await NotifyAndCommitAsync(tx, await UpcomingTripsAsync(routeId));
        return new { stops = parsed.Count, added = parsed.Count(p => p.In.Id is null), removed = removed.Count, pairsWithoutFare = missingPairs };
    }

    // =====================================================================================================
    // Pickups / drops / breaks
    // =====================================================================================================

    private async Task<int> StageUseAsync(long stageId) =>
        await db.Bookings.CountAsync(b => b.BoardingStageId == stageId || b.DroppingStageId == stageId)
        + await db.SeatHolds.CountAsync(h => h.BoardingStageId == stageId || h.DroppingStageId == stageId);

    /// <summary>Creates (stageId null) or edits a pickup / drop / break point. Points that bookings or holds reference keep their kind
    /// and city (tickets and manifests resolve through them); everything else — name, address, pin, time, contact, metro details — can
    /// change and is published to the OTA for upcoming departures.</summary>
    public async Task<RouteStage> SaveStageAsync(long routeId, long? stageId, RouteStageInput i, string actor)
    {
        if (i.Kind is not ("pickup" or "drop" or "break")) throw new GdsException("VALIDATION", "Kind must be pickup, drop or break");
        var name = (i.Name ?? "").Trim();
        if (name.Length is 0 or > 120) throw new GdsException("VALIDATION", "Point name is required (max 120 characters)");
        var time = ParseTime(i.Time, "Time");
        if (i.Day is < 1 or > 7) throw new GdsException("VALIDATION", "Journey day must be 1-7");
        if (i.Lat is < -90 or > 90 || i.Lng is < -180 or > 180) throw new GdsException("VALIDATION", "Latitude must be -90..90 and longitude -180..180");
        if ((i.Lat is null) != (i.Lng is null)) throw new GdsException("VALIDATION", "Enter both latitude and longitude, or neither");
        var contact = string.IsNullOrWhiteSpace(i.ContactNumber) ? null : i.ContactNumber.Trim();
        if (contact is not null && (contact.Length is < 10 or > 13 || !contact.All(char.IsDigit))) throw new GdsException("VALIDATION", "Contact number must be 10-13 digits");
        var metro = string.Equals(i.PickupType, "Metro", StringComparison.OrdinalIgnoreCase);
        if (metro && i.Kind != "pickup") throw new GdsException("VALIDATION", "Only pickup points can be free-metro pickups");
        TimeOnly? exchange = metro && !string.IsNullOrWhiteSpace(i.ExchangeTime) ? ParseTime(i.ExchangeTime, "Exchange time") : null;

        await using var tx = await db.Database.BeginTransactionAsync();
        await LockRouteAsync(routeId);
        var route = await db.Routes.Include(r => r.Stops).Include(r => r.Stages).FirstAsync(r => r.Id == routeId);
        var stop = route.Stops.FirstOrDefault(s => s.CityId == i.CityId) ?? throw new GdsException("VALIDATION", "The city is not on this route. Add it on the Cities & Schedule tab first.");
        var firstSeq = route.Stops.Min(s => s.Sequence); var lastSeq = route.Stops.Max(s => s.Sequence);
        if (i.Kind == "pickup" && stop.Sequence == lastSeq) throw new GdsException("VALIDATION", "Passengers cannot board at the destination city");
        if (i.Kind == "drop" && stop.Sequence == firstSeq) throw new GdsException("VALIDATION", "Passengers cannot be dropped at the origin city");

        RouteStage st;
        if (stageId is null)
        {
            st = new RouteStage { Id = await NextIdAsync(), RouteId = routeId };
            route.Stages.Add(st);
        }
        else
        {
            st = route.Stages.FirstOrDefault(s => s.Id == stageId) ?? throw new GdsException("NOT_FOUND", "Point not found on this route", 404);
            if ((st.Kind != i.Kind || st.CityId != i.CityId) && await StageUseAsync(st.Id) is var used and > 0)
                throw new GdsException("STAGE_IN_USE", $"{st.Name} is on {used} booking(s)/hold(s); its type and city cannot change. Add a new point instead.", 409);
        }
        var before = stageId is null ? null : new { st.Kind, st.Name, st.CityId, st.Day, Time = st.Time.ToString("HH:mm"), st.Lat, st.Lng };
        st.Kind = i.Kind; st.Name = name; st.CityId = i.CityId; st.StopSequence = stop.Sequence; st.Day = i.Day; st.Time = time;
        st.Address = Clean(i.Address); st.Landmark = Clean(i.Landmark); st.ContactNumber = contact; st.Lat = i.Lat; st.Lng = i.Lng;
        st.PickupType = metro ? "Metro" : null; st.ExchangePoint = metro ? Clean(i.ExchangePoint) : null; st.ExchangeTime = exchange;
        st.MetroDescription = metro ? Clean(i.MetroDescription) : null;
        // Exactly one prime (default) point per city and kind.
        var peers = route.Stages.Where(s => s.CityId == st.CityId && s.Kind == st.Kind && s.Id != st.Id).ToList();
        if (i.Prime || peers.All(p => !p.Prime)) { foreach (var p in peers) p.Prime = false; st.Prime = true; }
        else st.Prime = false;
        Audit(actor, stageId is null ? "ROUTE_STAGE_CREATE" : "ROUTE_STAGE_UPDATE", routeId, new { stage = st.Id, before, after = new { st.Kind, st.Name, st.CityId, st.Day, Time = st.Time.ToString("HH:mm"), st.Lat, st.Lng, st.Prime } });
        await db.SaveChangesAsync();
        await NotifyAndCommitAsync(tx, st.Kind == "break" ? new List<Trip>() : await UpcomingTripsAsync(routeId));
        return st;
    }

    /// <summary>Deletes a point that no booking or hold has ever used (tickets, manifests and reports resolve old bookings through it).</summary>
    public async Task DeleteStageAsync(long routeId, long stageId, string actor)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        await LockRouteAsync(routeId);
        var stages = await db.RouteStages.Where(s => s.RouteId == routeId).ToListAsync();
        var st = stages.FirstOrDefault(s => s.Id == stageId) ?? throw new GdsException("NOT_FOUND", "Point not found on this route", 404);
        if (await StageUseAsync(stageId) is var used and > 0)
            throw new GdsException("STAGE_IN_USE", $"{st.Name} is on {used} booking(s)/hold(s) and cannot be deleted. Edit it instead (name, address, pin, time).", 409);
        db.RouteStages.Remove(st);
        if (st.Prime && stages.Where(s => s.Id != st.Id && s.CityId == st.CityId && s.Kind == st.Kind).OrderBy(s => s.Day).ThenBy(s => s.Time).FirstOrDefault() is { } next) next.Prime = true;
        Audit(actor, "ROUTE_STAGE_DELETE", routeId, new { stage = st.Id, st.Kind, st.Name });
        await db.SaveChangesAsync();
        await NotifyAndCommitAsync(tx, st.Kind == "break" ? new List<Trip>() : await UpcomingTripsAsync(routeId));
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    // =====================================================================================================
    // Standing seat blocks
    // =====================================================================================================

    public sealed record BlockApplyResult(int Departures, int SeatsBlocked, int SeatsReleased, List<string> Skipped);

    public async Task<(RouteSeatBlock Block, BlockApplyResult Result)> SaveSeatBlockAsync(long routeId, long? blockId, RouteSeatBlockInput i, string actor)
    {
        if (i.Seats is not { Count: > 0 }) throw new GdsException("VALIDATION", "Choose at least one seat");
        if (i.FromDate is { } f && i.ToDate is { } t && t < f) throw new GdsException("VALIDATION", "To date is before from date");
        if (i.AutoReleaseHours is < 0 or > 168) throw new GdsException("VALIDATION", "Auto-release must be 0-168 hours before departure");
        var reason = string.IsNullOrWhiteSpace(i.Reason) ? "Blocked" : i.Reason.Trim();
        if (reason.Length > 80) throw new GdsException("VALIDATION", "Reason is limited to 80 characters");

        await using var tx = await db.Database.BeginTransactionAsync();
        await LockRouteAsync(routeId);
        var route = await db.Routes.Include(r => r.CoachTemplate!).ThenInclude(c => c.Seats).Include(r => r.SeatBlocks).FirstAsync(r => r.Id == routeId);
        var seats = route.CoachTemplate!.Seats.ToDictionary(s => s.Code, StringComparer.OrdinalIgnoreCase);
        var bad = i.Seats.Where(s => !seats.ContainsKey(s)).ToList();
        if (bad.Count > 0) throw new GdsException("INVALID_SEAT", $"Seat(s) {string.Join(", ", bad)} do not exist in {route.CoachTemplate.Name}");
        var codes = i.Seats.Select(s => seats[s].Code).Distinct().ToArray();
        var clash = route.SeatBlocks.Where(b => b.Id != blockId).SelectMany(b => b.Seats.Where(codes.Contains).Select(s => (s, b))).FirstOrDefault();
        if (clash.b is not null && Overlaps(clash.b, i.FromDate, i.ToDate))
            throw new GdsException("DUPLICATE_BLOCK", $"Seat {clash.s} is already in the standing block “{clash.b.Reason}” for overlapping dates. Edit that block instead.", 409);

        RouteSeatBlock block;
        if (blockId is null)
        {
            block = new RouteSeatBlock { RouteId = routeId, CreatedBy = actor, CreatedAt = Now };
            db.RouteSeatBlocks.Add(block);
        }
        else block = route.SeatBlocks.FirstOrDefault(b => b.Id == blockId) ?? throw new GdsException("NOT_FOUND", "Seat block not found on this route", 404);
        var before = blockId is null ? null : new { block.Seats, block.Reason, block.FromDate, block.ToDate, block.AutoReleaseHours };
        block.Seats = codes; block.Reason = reason; block.FromDate = i.FromDate; block.ToDate = i.ToDate; block.AutoReleaseHours = i.AutoReleaseHours;
        await db.SaveChangesAsync();
        var result = await ReconcileBlockAsync(route, block, deleting: false);
        Audit(actor, blockId is null ? "ROUTE_SEAT_BLOCK_CREATE" : "ROUTE_SEAT_BLOCK_UPDATE", routeId, new { block = block.Id, before, after = new { block.Seats, block.Reason, block.FromDate, block.ToDate, block.AutoReleaseHours }, result });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await InvalidateTripsAsync(result);
        return (block, result);
    }

    public async Task<BlockApplyResult> DeleteSeatBlockAsync(long routeId, long blockId, string actor)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        await LockRouteAsync(routeId);
        var route = await db.Routes.Include(r => r.CoachTemplate!).ThenInclude(c => c.Seats).Include(r => r.SeatBlocks).FirstAsync(r => r.Id == routeId);
        var block = route.SeatBlocks.FirstOrDefault(b => b.Id == blockId) ?? throw new GdsException("NOT_FOUND", "Seat block not found on this route", 404);
        var result = await ReconcileBlockAsync(route, block, deleting: true);
        db.RouteSeatBlocks.Remove(block);
        Audit(actor, "ROUTE_SEAT_BLOCK_DELETE", routeId, new { block = block.Id, block.Seats, block.Reason, result });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await InvalidateTripsAsync(result);
        return result;
    }

    /// <summary>Applies every standing block of a route to newly generated departures (called by trip generation, inside its transaction).</summary>
    public async Task ApplyBlocksToNewTripsAsync(long routeId)
    {
        var route = await db.Routes.Include(r => r.CoachTemplate!).ThenInclude(c => c.Seats).Include(r => r.SeatBlocks).FirstAsync(r => r.Id == routeId);
        foreach (var b in route.SeatBlocks) await ReconcileBlockAsync(route, b, deleting: false);
        await db.SaveChangesAsync();
    }

    private static bool Overlaps(RouteSeatBlock b, DateOnly? from, DateOnly? to) =>
        (b.FromDate is null || to is null || b.FromDate <= to) && (b.ToDate is null || from is null || from <= b.ToDate);

    private readonly HashSet<long> touchedTrips = [];
    private async Task InvalidateTripsAsync(BlockApplyResult _)
    {
        foreach (var id in touchedTrips) await inventory.InvalidateTripAsync(id);
        touchedTrips.Clear();
        await cache.BumpAsync(CacheKeys.SearchScope(T));
    }

    /// <summary>
    /// Makes the Blocked allocations of one standing block match its definition on upcoming departures that have not passed their
    /// auto-release time: adds missing seats (full route segment) where the seat is free, releases seats no longer covered. Seats the
    /// operator unblocked on a single departure (reason suffix <c>:unblocked</c>) stay released, like legacy schedule.unblocked.
    /// Seats already sold/held on that departure are skipped and reported, never displaced.
    /// </summary>
    private async Task<BlockApplyResult> ReconcileBlockAsync(Route route, RouteSeatBlock block, bool deleting)
    {
        var tz = await TimeZoneAsync();
        var trips = await UpcomingTripsAsync(route.Id);
        var stops = await db.RouteStops.Where(s => s.RouteId == route.Id).Select(s => s.Sequence).ToListAsync();
        int from = stops.Min(), to = stops.Max();
        var tag = BlockReasonPrefix + block.Id;
        var tripIds = trips.Select(t => t.Id).ToList();
        var allocs = await db.SeatAllocations.Where(a => tripIds.Contains(a.TripId) && (a.IsActive || a.Reason == tag + ":unblocked")).ToListAsync();
        var seats = route.CoachTemplate!.Seats.ToDictionary(s => s.Code, StringComparer.OrdinalIgnoreCase);
        int added = 0, released = 0, departures = 0; var skipped = new List<string>();
        foreach (var trip in trips)
        {
            var dep = TripClock.ToUtc(TripClock.Local(trip.TravelDate, 1, trip.DepartureTime ?? route.DepartureTime), tz);
            var releaseAt = block.AutoReleaseHours is { } h ? dep.AddHours(-h) : dep;
            var open = releaseAt > Now;
            var wanted = !deleting && open && (block.FromDate is null || trip.TravelDate >= block.FromDate) && (block.ToDate is null || trip.TravelDate <= block.ToDate);
            var mine = allocs.Where(a => a.TripId == trip.Id && a.IsActive && a.Reason == tag).ToList();
            var changed = false;
            foreach (var a in mine.Where(a => !wanted || !block.Seats.Contains(a.SeatCode, StringComparer.OrdinalIgnoreCase)))
            {
                if (!open && !deleting) continue; // past release time: the sweeper owns it
                a.IsActive = false; a.ReleasedAt = Now; released++; changed = true;
            }
            if (wanted)
                foreach (var code in block.Seats)
                {
                    if (mine.Any(a => a.SeatCode == code && a.IsActive)) continue;
                    if (allocs.Any(a => a.TripId == trip.Id && !a.IsActive && a.SeatCode == code && a.Reason == tag + ":unblocked")) continue;
                    var busy = allocs.FirstOrDefault(a => a.TripId == trip.Id && a.IsActive && a.SeatCode == code && a.FromSeq < to && from < a.ToSeq);
                    if (busy is not null) { if (busy.Reason != tag) skipped.Add($"{trip.TravelDate:dd MMM} {code} ({busy.Kind.ToString().ToLowerInvariant()})"); continue; }
                    var seat = seats[code];
                    var row = new SeatAllocation { TenantId = T, TripId = trip.Id, CoachSeatId = seat.Id, SeatCode = seat.Code, FromSeq = from, ToSeq = to, Kind = AllocationKind.Blocked, Reason = tag, CreatedAt = Now };
                    db.SeatAllocations.Add(row); allocs.Add(row); added++; changed = true;
                }
            if (changed) { departures++; touchedTrips.Add(trip.Id); await notifier.ServiceChangedAsync(trip, from, to); }
        }
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23P01" })
        { throw new GdsException("SEAT_UNAVAILABLE", "A seat was sold or held while the block was being applied. Reload and try again.", 409); }
        return new BlockApplyResult(departures, added, released, skipped);
    }

    /// <summary>Releases standing-block seats whose auto-release time has passed (legacy auto_release_hours). Runs per tenant from the sweeper.</summary>
    public async Task<int> ReleaseDueBlocksAsync()
    {
        var tz = await TimeZoneAsync();
        var today = await TodayAsync();
        var rows = await (from a in db.SeatAllocations
                          join t in db.Trips on a.TripId equals t.Id
                          where a.IsActive && a.Kind == AllocationKind.Blocked && a.Reason!.StartsWith(BlockReasonPrefix) && t.TravelDate >= today.AddDays(-1) && t.TravelDate <= today.AddDays(8)
                          select new { a, t }).ToListAsync();
        if (rows.Count == 0) return 0;
        var ids = rows.Select(x => long.TryParse(x.a.Reason![BlockReasonPrefix.Length..], out var id) ? id : 0).Distinct().ToList();
        var blocks = await db.RouteSeatBlocks.Where(b => ids.Contains(b.Id)).ToDictionaryAsync(b => b.Id);
        var routeIds = rows.Select(x => x.t.RouteId).Distinct().ToList();
        var routes = await db.Routes.Where(r => routeIds.Contains(r.Id)).ToDictionaryAsync(r => r.Id, r => r.DepartureTime);
        var touched = new HashSet<Trip>();
        foreach (var x in rows)
        {
            if (!long.TryParse(x.a.Reason![BlockReasonPrefix.Length..], out var bid) || !blocks.TryGetValue(bid, out var b) || b.AutoReleaseHours is not { } h) continue;
            var dep = TripClock.ToUtc(TripClock.Local(x.t.TravelDate, 1, x.t.DepartureTime ?? routes[x.t.RouteId]), tz);
            if (dep.AddHours(-h) > Now) continue;
            x.a.IsActive = false; x.a.ReleasedAt = Now; x.a.Reason += ":auto_released";
            touched.Add(x.t);
        }
        foreach (var t in touched) await notifier.ServiceChangedAsync(t, 0, int.MaxValue);
        await db.SaveChangesAsync();
        foreach (var t in touched) await inventory.InvalidateTripAsync(t.Id);
        if (touched.Count > 0) await cache.BumpAsync(CacheKeys.SearchScope(T));
        return touched.Count;
    }

    // =====================================================================================================
    // Timetable shift (Update tab)
    // =====================================================================================================

    /// <summary>
    /// Moves the whole timetable — origin departure, every city and every pickup / drop / break — later or earlier. Departures follow
    /// the route timetable, so this applies to every departure that has not left yet; a departure currently on the road blocks the
    /// shift (live tracking and drop times would jump). The origin must stay on day 1 (move the start date instead). Manual per-departure
    /// delays move with the timetable. Dry run returns the before/after table and how many booked passengers are affected so the
    /// operator can notify them (Schedules → Notify) — sold tickets keep their PNR and seats.
    /// </summary>
    public async Task<object> ShiftTimetableAsync(long routeId, RouteShiftInput i, string actor)
    {
        if (i.Direction is not ("delay" or "advance")) throw new GdsException("VALIDATION", "Direction must be delay or advance");
        if (i.Hours < 0 || i.Minutes is < 0 or > 59) throw new GdsException("VALIDATION", "Hours must be 0 or more and minutes 0-59");
        var delta = (i.Hours * 60 + i.Minutes) * (i.Direction == "advance" ? -1 : 1);
        if (delta == 0) throw new GdsException("VALIDATION", "Enter how much to shift the timetable");
        if (Math.Abs(delta) > 720) throw new GdsException("VALIDATION", "Shift is limited to 12 hours. For bigger changes edit the cities and points directly.");

        await using var tx = await db.Database.BeginTransactionAsync();
        await LockRouteAsync(routeId);
        var route = await db.Routes.Include(r => r.Stops).ThenInclude(s => s.City).Include(r => r.Stages).FirstAsync(r => r.Id == routeId);
        var stops = route.Stops.OrderBy(s => s.Sequence).ToList();
        if (stops.Count == 0) throw new GdsException("VALIDATION", "Route has no cities");
        var originAbs = Abs(stops[0].Day, stops[0].Time) + delta;
        if (originAbs is < 0 or >= 1440) throw new GdsException("SHIFT_CROSSES_MIDNIGHT", $"This would move the origin departure to the {(originAbs < 0 ? "previous" : "next")} day. Change the route start date and timings instead.", 409);
        if (route.Stages.Any(s => Abs(s.Day, s.Time) + delta < 0)) throw new GdsException("SHIFT_CROSSES_MIDNIGHT", "A pickup would move before day 1. Reduce the shift.", 409);
        if (stops.Any(s => Abs(s.Day, s.Time) + delta >= 7 * 1440) || route.Stages.Any(s => Abs(s.Day, s.Time) + delta >= 7 * 1440))
            throw new GdsException("VALIDATION", "A stop would move past day 7");

        var tz = await TimeZoneAsync();
        var today = await TodayAsync();
        var recent = await db.Trips.Where(t => t.RouteId == routeId && t.Status == "active" && t.DeletedAt == null && t.TravelDate >= today.AddDays(-7)).ToListAsync();
        var lastAbs = Math.Max(Abs(stops[^1].Day, stops[^1].Time), route.Stages.Count == 0 ? 0 : route.Stages.Max(s => Abs(s.Day, s.Time)));
        DateTime At(Trip t, int abs) => TripClock.ToUtc(TripClock.Local(t.TravelDate, 1, new TimeOnly(0, 0)).AddMinutes(abs), tz);
        var firstBoard = route.Stages.Where(s => s.Kind == "pickup").Select(s => Abs(s.Day, s.Time)).DefaultIfEmpty(Abs(stops[0].Day, stops[0].Time)).Min();
        var onRoad = recent.Where(t => At(t, firstBoard) <= Now && Now < At(t, lastAbs)).ToList();
        if (onRoad.Count > 0) throw new GdsException("TRIP_ON_ROAD", $"The {onRoad[0].TravelDate:dd MMM} departure is on the road. Shift the timetable after it arrives.", 409);
        var upcoming = recent.Where(t => At(t, firstBoard) > Now).ToList();
        var upcomingIds = upcoming.Select(t => t.Id).ToList();
        var bookings = await db.Bookings.Where(b => upcomingIds.Contains(b.TripId) && b.Status != "CANCELLED").CountAsync();
        var passengers = await (from p in db.Set<BookingPassenger>() join b in db.Bookings on p.BookingId equals b.Id where upcomingIds.Contains(b.TripId) && p.Status == "CONFIRMED" select p.Id).CountAsync();

        string Fmt(int abs) { var (d, t) = FromAbs(abs); return d == 1 ? t.ToString("HH:mm") : $"{t:HH:mm} (D{d})"; }
        var preview = new
        {
            deltaMinutes = delta,
            cities = stops.Select(s => new { city = s.City?.Name, before = Fmt(Abs(s.Day, s.Time)), after = Fmt(Abs(s.Day, s.Time) + delta) }),
            points = route.Stages.OrderBy(s => s.Day).ThenBy(s => s.Time).Select(s => new { s.Kind, s.Name, before = Fmt(Abs(s.Day, s.Time)), after = Fmt(Abs(s.Day, s.Time) + delta) }),
            departures = upcoming.Count, bookings, passengers,
        };
        if (i.DryRun) { await tx.RollbackAsync(); return preview; }

        foreach (var s in stops) (s.Day, s.Time) = FromAbs(Abs(s.Day, s.Time) + delta);
        foreach (var s in route.Stages)
        {
            (s.Day, s.Time) = FromAbs(Abs(s.Day, s.Time) + delta);
            if (s.ExchangeTime is { } x) s.ExchangeTime = x.AddMinutes(delta);
        }
        route.DepartureTime = stops[0].Time;
        if (route.ArrivalTime is { } at) { var (d, t) = FromAbs(Abs(route.ArrivalDay ?? 1, at) + delta); route.ArrivalTime = t; route.ArrivalDay = d; }
        foreach (var t in upcoming.Where(t => t.DepartureTime is not null)) t.DepartureTime = t.DepartureTime!.Value.AddMinutes(delta);
        Audit(actor, "ROUTE_SHIFT_TIME", routeId, new { minutes = delta, departures = upcoming.Count, bookings, passengers });
        await db.SaveChangesAsync();
        await NotifyAndCommitAsync(tx, upcoming);
        return preview;
    }
}

/// <summary>Releases standing route seat blocks at their auto-release time (legacy auto_release_hours) for every tenant, once a minute.</summary>
public sealed class RouteBlockReleaser(IServiceScopeFactory scopes, ILogger<RouteBlockReleaser> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        while (!stop.IsCancellationRequested)
        {
            try { await SweepAsync(); }
            catch (Exception ex) when (!stop.IsCancellationRequested) { log.LogError(ex, "Route block release sweep failed"); }
            try { await Task.Delay(TimeSpan.FromSeconds(60), stop); } catch (OperationCanceledException) { }
        }
    }

    public async Task<int> SweepAsync()
    {
        List<long> tenants;
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GdsDbContext>();
            tenants = await (from b in db.RouteSeatBlocks join r in db.Routes.IgnoreQueryFilters() on b.RouteId equals r.Id
                             where b.AutoReleaseHours != null select r.TenantId).Distinct().ToListAsync();
        }
        var total = 0;
        foreach (var tenantId in tenants)
        {
            using var scope = scopes.CreateScope();
            scope.ServiceProvider.GetRequiredService<TenantContext>().TenantId = tenantId;
            total += await scope.ServiceProvider.GetRequiredService<RouteEditService>().ReleaseDueBlocksAsync();
        }
        return total;
    }
}
