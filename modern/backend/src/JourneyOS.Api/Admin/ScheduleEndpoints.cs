using JourneyOS.Api.Inventory;
using JourneyOS.Api.Operations;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Reports;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record ScheduleToggleInput(bool Active);

/// <summary>
/// Read model for the GDS → Schedules list (legacy <c>GET /api/schedules</c>) and the per-departure on/off switch
/// (legacy <c>POST /api/schedules/:id/toggle</c>). All figures come from PostgreSQL; nothing is synthesised.
/// </summary>
public static class ScheduleEndpoints
{
    public static void MapSchedules(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization().WithTags("Schedules");

        g.MapGet("/schedules", async (DateOnly from, DateOnly to, GdsDbContext db, ReportsService reports) =>
        {
            if (to < from || to.DayNumber - from.DayNumber > 31) throw new GdsException("VALIDATION", "Choose a date range of at most 31 days");
            var trips = await db.Trips.AsNoTracking().Where(t => t.TravelDate >= from && t.TravelDate <= to && t.DeletedAt == null).ToListAsync();
            var routeIds = trips.Select(t => t.RouteId).Distinct().ToList();
            var routes = await db.Routes.AsNoTracking().AsSplitQuery().Where(r => routeIds.Contains(r.Id))
                .Include(r => r.Stops).ThenInclude(s => s.City).Include(r => r.Stages).Include(r => r.Fares).Include(r => r.CoachTemplate).ThenInclude(c => c!.Seats)
                .ToDictionaryAsync(r => r.Id);
            var ids = trips.Select(t => t.Id).ToList();
            var alloc = await db.SeatAllocations.AsNoTracking().Where(a => ids.Contains(a.TripId) && a.IsActive)
                .GroupBy(a => new { a.TripId, a.Kind }).Select(x => new { x.Key.TripId, x.Key.Kind, Seats = x.Select(a => a.CoachSeatId).Distinct().Count() }).ToListAsync();
            var money = trips.Count > 0 ? await reports.TripMoneyAsync(from, to) : [];
            int Count(long trip, AllocationKind k) => alloc.Where(a => a.TripId == trip && a.Kind == k).Sum(a => a.Seats);

            return Results.Ok(new
            {
                schedules = trips.Select(t =>
                {
                    var r = routes[t.RouteId];
                    var stops = r.Stops.OrderBy(s => s.Sequence).ToList();
                    var first = stops.FirstOrDefault(); var last = stops.LastOrDefault();
                    var fare = first is null || last is null ? null : r.Fares.FirstOrDefault(f => f.FromSequence == first.Sequence && f.ToSequence == last.Sequence);
                    var capacity = r.CoachTemplate?.Seats.Count ?? 0;
                    // Legacy card: departs at the route departure time, arrives at the last drop point (falls back to the last city stop).
                    var lastDrop = r.Stages.Where(s => s.Kind == "drop").OrderBy(s => s.Day).ThenBy(s => s.Time).LastOrDefault();
                    var arrivalTime = lastDrop?.Time ?? last?.Time;
                    var arrivalDay = lastDrop?.Day ?? last?.Day ?? 1;
                    var booked = Count(t.Id, AllocationKind.Booked); var held = Count(t.Id, AllocationKind.Hold); var blocked = Count(t.Id, AllocationKind.Blocked);
                    money.TryGetValue(t.Id, out var m);
                    return new
                    {
                        id = t.Id, routeId = t.RouteId, travelDate = t.TravelDate, serviceNumber = r.ServiceNumber, serviceName = r.Name,
                        coach = r.CoachTemplate?.Name, origin = first?.City?.Name, destination = last?.City?.Name,
                        departureTime = r.DepartureTime, arrivalTime, arrivalDayOffset = Math.Max(0, arrivalDay - 1),
                        mainFare = fare is null ? null : new { seater = fare.Seater, sleeperLower = fare.SleeperLower, sleeperUpper = fare.SleeperUpper },
                        status = t.Status, bookable = t.Bookable, capacity, booked, held, blocked, free = Math.Max(0, capacity - booked - held - blocked),
                        occupancyPct = capacity > 0 ? Math.Round(booked * 100m / capacity, 2) : 0,
                        sale = m?.Gross, netSales = m?.Net, expense = m?.Expense, profit = m?.Profit, expenseBasis = m?.Basis,
                    };
                }).OrderBy(s => s.travelDate).ThenBy(s => s.departureTime).ThenBy(s => s.serviceNumber),
            });
        }).RequireAuthorization(Policies.Reports);

        g.MapPost("/schedules/{id:long}/toggle", async (long id, ScheduleToggleInput i, OperationsService s, HttpContext h) =>
            Results.Ok(new { bookable = await s.SetBookableAsync(id, i.Active, h.User.Identity!.Name!) })).RequireAuthorization(Policies.Operations);

        // Schedule management overlay read model (legacy GET /api/schedules/:id + /trips/:id passengers + /schedules/:id/booking-history).
        g.MapGet("/schedule-detail/{id:long}", async (long id, GdsDbContext db) =>
        {
            var t = await db.Trips.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null) ?? throw new GdsException("SERVICE_NOT_FOUND", "Schedule not found", 404);
            var r = await db.Routes.AsNoTracking().AsSplitQuery().Include(x => x.Stops).ThenInclude(s => s.City).Include(x => x.Stages).Include(x => x.CoachTemplate)
                .FirstAsync(x => x.Id == t.RouteId);
            var stops = r.Stops.OrderBy(s => s.Sequence).ToList();
            var cityNames = await db.Cities.AsNoTracking().Where(c => r.Stages.Select(s => s.CityId).Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);
            var bookings = await db.Bookings.AsNoTracking().Include(b => b.Passengers).Where(b => b.TripId == id).ToListAsync();
            // Seats (not tickets) per boarding / dropping point, excluding cancelled passengers — legacy stopTab() count.
            var live = bookings.SelectMany(b => b.Passengers.Where(p => p.Status != "CANCELLED").Select(_ => b)).ToList();
            var lastDrop = r.Stages.Where(s => s.Kind == "drop").OrderBy(s => s.Day).ThenBy(s => s.Time).LastOrDefault();
            var ov = StageOverrides(t);
            return Results.Ok(new
            {
                id = t.Id, routeId = r.Id, travelDate = t.TravelDate, status = t.Status, bookable = t.Bookable,
                serviceNumber = r.ServiceNumber, serviceName = r.Name, coach = r.CoachTemplate?.Name,
                origin = stops.FirstOrDefault()?.City?.Name, destination = stops.LastOrDefault()?.City?.Name,
                departureTime = r.DepartureTime, arrivalTime = lastDrop?.Time ?? stops.LastOrDefault()?.Time,
                arrivalDay = lastDrop?.Day ?? stops.LastOrDefault()?.Day ?? 1,
                uiSettings = t.UiSettingsJson is null ? (System.Text.Json.JsonElement?)null : System.Text.Json.JsonDocument.Parse(t.UiSettingsJson).RootElement.Clone(),
                delayMinutes = t.DelayMinutes ?? 0,
                seatFareRules = FareCalculator.TripRules(t).Select(x => new { name = x.Label, seats = x.Seats, days = x.Days.Select(int.Parse), kind = x.Kind == "percent" ? "percent" : "flat", value = x.Value }),
                stageOverrides = ov.Keys,
                stops = stops.Select(s => new { cityId = s.CityId, name = s.City?.Name, state = s.City?.State, day = s.Day, time = s.Time }),
                stages = r.Stages.Select(s => Overlay(s, ov)).OrderBy(s => s.Day).ThenBy(s => s.Time).Select(s => new
                {
                    s.Id, s.Kind, s.Name, s.Address, s.Landmark, s.ContactNumber, s.Lat, s.Lng, s.Day, s.Time, s.Prime, s.PickupType,
                    cityId = s.CityId, city = cityNames.GetValueOrDefault(s.CityId),
                    passengers = live.Count(b => (s.Kind == "pickup" ? b.BoardingStageId : b.DroppingStageId) == s.Id),
                    overridden = ov.ContainsKey(s.Id),
                }),
                history = bookings.OrderByDescending(b => b.DateOfIssue).ThenByDescending(b => b.Id).Select(b =>
                {
                    var pax = b.Passengers.OrderBy(p => p.Id).ToList();
                    return new
                    {
                        pnr = b.Pnr, seats = pax.Select(p => p.SeatCode), totalAmount = b.TotalFare, source = b.Channel,
                        // legacy contact.name is always the primary (first) passenger
                        contactName = (pax.FirstOrDefault(p => p.IsPrimary) ?? pax.FirstOrDefault())?.Name,
                        bookedAt = b.DateOfIssue, status = b.Status == "CANCELLED" ? "cancelled" : "confirmed", // legacy has no partial state
                    };
                }),
            });
        }).RequireAuthorization(Policies.Reports);

        // Legacy GET /schedules/:id/manage-bookings/v48: timestamped booking / hold / manual seat-block evidence, oldest first.
        // Only recorded timestamps are used; no transition is inferred.
        g.MapGet("/schedules/{id:long}/manage-bookings/v48", async (long id, GdsDbContext db, HttpContext h) =>
        {
            h.Response.Headers.CacheControl = "private, no-store";
            _ = await db.Trips.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null) ?? throw new GdsException("SERVICE_NOT_FOUND", "Schedule not found", 404);
            var bookings = await db.Bookings.AsNoTracking().Include(b => b.Passengers).Where(b => b.TripId == id).ToListAsync();
            var holds = await db.SeatHolds.AsNoTracking().Include(x => x.Passengers).Where(x => x.TripId == id).ToListAsync();
            var blocks = await db.SeatAllocations.AsNoTracking().Where(a => a.TripId == id && a.Kind == AllocationKind.Blocked).OrderBy(a => a.CreatedAt).ToListAsync();
            var booked = bookings.Where(b => b.HoldId != null).Select(b => b.HoldId!.Value).ToHashSet();
            var events = new List<Dictionary<string, object?>>();
            static string At(DateTime d) => DateTime.SpecifyKind(d, DateTimeKind.Utc).ToString("O");
            foreach (var b in bookings)
            {
                var pax = b.Passengers.Where(p => p.Status != "CANCELLED" || b.Status == "CANCELLED").Select(p => new { seat = p.SeatCode, name = p.Name, age = p.Age, gender = p.Gender }).ToList();
                var status = b.Status == "CANCELLED" ? "released" : "confirmed";
                Dictionary<string, object?> Ev(string kind, DateTime at, string msg, string st) => new()
                {
                    ["id"] = $"{kind}:{b.Pnr}:{At(at)}", ["kind"] = kind, ["at"] = At(at), ["message"] = msg, ["status"] = st, ["pnr"] = b.Pnr, ["ticket"] = "",
                    ["source"] = b.Channel, ["passengers"] = pax, ["seats"] = Array.Empty<string>(), ["reason"] = "",
                };
                events.Add(Ev("recorded", b.DateOfIssue, "Booking recorded", status));
                if (b.DateOfCancellation is { } c) events.Add(Ev("released", c, "Cancellation recorded", "released"));
            }
            foreach (var x in holds.Where(x => !booked.Contains(x.Id)))
            {
                var pax = x.Passengers.Select(p => new { seat = p.SeatCode, name = p.Name, age = p.Age, gender = p.Gender }).ToList();
                Dictionary<string, object?> Ev(string kind, DateTime at, string msg, string st) => new()
                {
                    ["id"] = $"{kind}:hold{x.Id}:{At(at)}", ["kind"] = kind, ["at"] = At(at), ["message"] = msg, ["status"] = st, ["pnr"] = null, ["ticket"] = null,
                    ["source"] = x.Channel, ["passengers"] = pax, ["seats"] = x.Passengers.Select(p => p.SeatCode).ToArray(), ["reason"] = "",
                };
                events.Add(Ev("hold", x.CreatedAt, "Seat hold recorded", x.Status == HoldStatus.Held ? "blocked" : "recorded"));
                if (x.ClosedAt is { } c && x.Status is HoldStatus.Released or HoldStatus.Expired)
                    events.Add(Ev(x.Status == HoldStatus.Expired ? "expired" : "released", c, x.Status == HoldStatus.Expired ? "Hold expired" : "Hold released", x.Status == HoldStatus.Expired ? "expired" : "released"));
            }
            foreach (var a in blocks)
            {
                events.Add(new()
                {
                    ["id"] = $"manual-block:{a.Id}:{At(a.CreatedAt)}", ["kind"] = "blocked", ["at"] = At(a.CreatedAt), ["status"] = a.IsActive ? "blocked" : "released",
                    ["message"] = "Manual seat block recorded", ["source"] = "Schedule", ["pnr"] = null, ["ticket"] = null, ["seats"] = new[] { a.SeatCode }, ["reason"] = a.Reason ?? "", ["passengers"] = Array.Empty<object>(),
                });
                if (!a.IsActive && a.ReleasedAt is { } r)
                    events.Add(new()
                    {
                        ["id"] = $"unblock:{a.Id}:{At(r)}", ["kind"] = "released", ["at"] = At(r), ["status"] = "released", ["message"] = "Seat block released", ["source"] = "Schedule",
                        ["pnr"] = null, ["ticket"] = null, ["seats"] = new[] { a.SeatCode }, ["reason"] = a.Reason ?? "", ["passengers"] = Array.Empty<object>(),
                    });
            }
            events = events.OrderBy(e => (string)e["at"]!, StringComparer.Ordinal).ThenBy(e => (string)e["id"]!, StringComparer.Ordinal).ToList();
            return Results.Ok(new
            {
                counts = new
                {
                    all = events.Count, seat_blocks = blocks.Count, bookings = bookings.Count, released = events.Count(e => (string)e["status"]! == "released"),
                    confirmed = bookings.Count(b => b.Status != "CANCELLED"), expired = holds.Count(x => x.Status == HoldStatus.Expired), blocked_active = blocks.Count(a => a.IsActive),
                },
                events = events.TakeLast(500), provenance = "Booking, hold and seat-block timestamps only", timezone = "Asia/Kolkata",
            });
        }).RequireAuthorization(Policies.Reports);

        // Legacy PUT /schedules/:id {ui_settings}: overlay preferences (via-city origin/destination toggles, sub-route fare %). Not published to OTAs.
        g.MapPut("/schedules/{id:long}/ui-settings", async (long id, System.Text.Json.Nodes.JsonObject body, GdsDbContext db, HttpContext h) =>
        {
            var t = await db.Trips.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null) ?? throw new GdsException("SERVICE_NOT_FOUND", "Schedule not found", 404);
            var clean = (t.UiSettingsJson is null ? null : System.Text.Json.Nodes.JsonNode.Parse(t.UiSettingsJson) as System.Text.Json.Nodes.JsonObject) ?? new System.Text.Json.Nodes.JsonObject();
            if (body["added_group"] is System.Text.Json.Nodes.JsonObject ag)
            {
                var gname = (ag["name"]?.ToString() ?? "").Trim();
                var gseats = (ag["seat_ids"] as System.Text.Json.Nodes.JsonArray ?? []).Select(x => x?.ToString().Trim() ?? "").Where(x => x.Length is > 0 and <= 8).Distinct().Take(80).ToList();
                if (gname.Length == 0 || gname.Length > 60 || gseats.Count == 0) throw new GdsException("VALIDATION", "Fare group needs a name and seat IDs");
                clean["added_group"] = new System.Text.Json.Nodes.JsonObject { ["name"] = gname, ["seat_ids"] = new System.Text.Json.Nodes.JsonArray(gseats.Select(x => (System.Text.Json.Nodes.JsonNode?)x).ToArray()) };
            }
            if (body["auto_price"] is { } ap) clean["auto_price"] = ap.GetValue<bool>();
            decimal? Money(string k) => body[k] is null ? null : decimal.TryParse(body[k]!.ToString(), System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var v) && v >= 0 ? v : throw new GdsException("VALIDATION", $"{k} must be a non-negative number");
            var min = Money("min_price"); var max = Money("max_price");
            if (min is not null) clean["min_price"] = min;
            if (max is not null) clean["max_price"] = max;
            if (clean["min_price"] is { } mn && clean["max_price"] is { } mx && mn.GetValue<decimal>() > mx.GetValue<decimal>()) throw new GdsException("VALIDATION", "Fare min/max not valid");
            if (body["curve"] is { } cv)
            {
                var c = cv.GetValue<string>();
                if (c is not ("Max revenue" or "Balanced" or "Max occupancy")) throw new GdsException("VALIDATION", "Unknown demand curve");
                clean["curve"] = c;
            }
            if (body["via_city_enabled"] is System.Text.Json.Nodes.JsonObject via)
            {
                var o = new System.Text.Json.Nodes.JsonObject();
                foreach (var (k, v) in via.Take(100))
                    if (long.TryParse(k, out _) && v is System.Text.Json.Nodes.JsonObject f)
                        o[k] = new System.Text.Json.Nodes.JsonObject { ["origin"] = f["origin"]?.GetValue<bool>() ?? true, ["destination"] = f["destination"]?.GetValue<bool>() ?? true };
                clean["via_city_enabled"] = o;
            }
            if (body["rates"] is System.Text.Json.Nodes.JsonObject rates)
            {
                var o = new System.Text.Json.Nodes.JsonObject();
                foreach (var (k, v) in rates.Take(200))
                {
                    if (!decimal.TryParse(v?.ToString(), System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var pct) || pct < 0 || pct > 100)
                        throw new GdsException("VALIDATION", "Fare % must be between 0 and 100");
                    o[k] = pct;
                }
                clean["rates"] = o;
            }
            t.UiSettingsJson = clean.ToJsonString();
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = h.User.Identity?.Name ?? "system", Action = "SCHEDULE_UI_SETTINGS", Entity = "schedule", EntityId = id.ToString(), DataJson = t.UiSettingsJson, At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true });
        }).RequireAuthorization(Policies.Operations);

        // Legacy PUT /schedules/:id {stage_overrides}: per-trip pickup/drop corrections; the route template is unchanged.
        g.MapPut("/schedules/{id:long}/stage-overrides", async (long id, System.Text.Json.Nodes.JsonObject body, GdsDbContext db, InventoryService inv, HttpContext h) =>
        {
            var t = await db.Trips.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null) ?? throw new GdsException("SERVICE_NOT_FOUND", "Schedule not found", 404);
            var ids = await db.Routes.AsNoTracking().Where(r => r.Id == t.RouteId).SelectMany(r => r.Stages.Select(s => s.Id)).ToListAsync();
            var ov = body["overrides"] as System.Text.Json.Nodes.JsonObject ?? (body["overrides"] is null ? new System.Text.Json.Nodes.JsonObject() : throw new GdsException("VALIDATION", "stage_overrides must be an object"));
            var clean = StageOverrides(t);
            if (body["reset"] is System.Text.Json.Nodes.JsonArray reset)
                foreach (var r0 in reset) if (long.TryParse(r0?.ToString(), out var rid)) clean.Remove(rid);
            foreach (var (k, v) in ov)
            {
                if (!long.TryParse(k, out var sid) || !ids.Contains(sid)) throw new GdsException("VALIDATION", $"Unknown stop {k}");
                if (v is not System.Text.Json.Nodes.JsonObject o) throw new GdsException("VALIDATION", $"Stop {k} must be an object");
                string? S(string n, int max) { var s = o[n]?.ToString().Trim(); return string.IsNullOrEmpty(s) ? null : s.Length > max ? s[..max] : s; }
                var time = S("time", 5);
                if (time is not null && !System.Text.RegularExpressions.Regex.IsMatch(time, @"^\d{1,2}:\d{2}$")) throw new GdsException("VALIDATION", "Stop time must be HH:MM");
                if (time is not null && !TimeOnly.TryParseExact(time.PadLeft(5, '0'), "HH:mm", out _)) throw new GdsException("VALIDATION", "Stop time must be HH:MM");
                int? day = S("day", 3) is { } ds ? int.TryParse(ds, out var dv) && dv is >= 1 and <= 7 ? dv : throw new GdsException("VALIDATION", "Stop day must be between 1 and 7") : null;
                decimal? Coord(string n, decimal lim) => S(n, 20) is { } cs ? decimal.TryParse(cs, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var c) && Math.Abs(c) <= lim ? c : throw new GdsException("VALIDATION", $"Invalid {(n == "lat" ? "latitude" : "longitude")}") : null;
                var phone = S("contact_number", 20);
                if (phone is not null && !System.Text.RegularExpressions.Regex.IsMatch(phone, @"^\+?[0-9 -]{6,20}$")) throw new GdsException("VALIDATION", "Enter a valid contact phone");
                var prev = clean.GetValueOrDefault(sid);
                clean[sid] = new StageOverride(S("name", 120) ?? prev?.Name, time?.PadLeft(5, '0') ?? prev?.Time, day ?? prev?.Day, S("landmark", 200) ?? prev?.Landmark, phone ?? prev?.ContactNumber, Coord("lat", 90) ?? prev?.Lat, Coord("lng", 180) ?? prev?.Lng);
            }
            var before = t.StageOverridesJson;
            t.StageOverridesJson = clean.Count == 0 ? null : System.Text.Json.JsonSerializer.Serialize(clean.ToDictionary(x => x.Key.ToString(), x => x.Value), OverrideJson);
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = h.User.Identity?.Name ?? "system", Action = "stops", Entity = "schedule", EntityId = id.ToString(), DataJson = System.Text.Json.JsonSerializer.Serialize(new { before, after = t.StageOverridesJson }), At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            await inv.InvalidateTripAsync(id);
            return Results.Ok(new { success = true, overridden = clean.Count });
        }).RequireAuthorization(Policies.Operations);

        // Legacy PUT /schedules/:id {seat_fare_rules}: trip-only premium/discount seat rules, priced after route rules (domain.js fareFor).
        g.MapPut("/schedules/{id:long}/seat-fare-rules", async (long id, System.Text.Json.Nodes.JsonObject body, GdsDbContext db, InventoryService inv, HttpContext h) =>
        {
            var t = await db.Trips.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null) ?? throw new GdsException("SERVICE_NOT_FOUND", "Schedule not found", 404);
            if (body["rules"] is not System.Text.Json.Nodes.JsonArray arr || arr.Count > 200) throw new GdsException("VALIDATION", "seat_fare_rules must be a list");
            var seatCodes = await db.Routes.AsNoTracking().Where(r => r.Id == t.RouteId).SelectMany(r => r.CoachTemplate!.Seats.Select(s => s.Code)).ToListAsync();
            var rules = new List<FareCalculator.TripSeatRule>();
            foreach (var x in arr.OfType<System.Text.Json.Nodes.JsonObject>())
            {
                var seats = (x["seats"] as System.Text.Json.Nodes.JsonArray ?? []).Select(s => s?.ToString() ?? "").Where(s => s.Length > 0).Distinct().ToArray();
                var unknown = seats.Where(s => !seatCodes.Contains(s)).ToList();
                if (unknown.Count > 0) throw new GdsException("VALIDATION", "Unknown seat(s): " + string.Join(", ", unknown.Take(10)));
                var days = (x["days"] as System.Text.Json.Nodes.JsonArray ?? []).Select(d => int.TryParse(d?.ToString(), out var n) ? n : -1).Where(d => d is >= 0 and <= 6).Distinct().ToArray();
                var kind = x["kind"]?.ToString() == "percent" ? "percent" : "flat";
                if (!decimal.TryParse(x["value"]?.ToString(), System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var value)) value = 0;
                if (kind == "percent" && Math.Abs(value) > 100) throw new GdsException("VALIDATION", "Percent change must be between -100 and 100");
                if (Math.Abs(value) > 100000) throw new GdsException("VALIDATION", "Fare change is too large");
                var name = (x["name"]?.ToString() ?? "Rule").Trim(); if (name.Length == 0) name = "Rule"; if (name.Length > 80) name = name[..80];
                if (seats.Length > 0 && value != 0) rules.Add(new(name, seats, days, kind, value)); // legacy drops empty rules
            }
            var before = t.SeatFareRulesJson;
            t.SeatFareRulesJson = rules.Count == 0 ? null : System.Text.Json.JsonSerializer.Serialize(rules, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = h.User.Identity?.Name ?? "system", Action = "fares", Entity = "schedule", EntityId = id.ToString(), DataJson = System.Text.Json.JsonSerializer.Serialize(new { before, seat_fare_rules = t.SeatFareRulesJson }), At = DateTime.UtcNow });
            await db.SaveChangesAsync();
            await inv.InvalidateTripAsync(id);
            return Results.Ok(new { success = true, rules = rules.Count });
        }).RequireAuthorization(Policies.Operations);

        // Legacy GET /schedules/:id/history: edit history (section, by, changes) from the immutable audit log.
        g.MapGet("/schedules/{id:long}/history", async (long id, GdsDbContext db, int? limit) =>
        {
            var key = id.ToString();
            var rows = await db.AuditLogs.AsNoTracking().Where(a => a.Entity == "schedule" && a.EntityId == key).OrderByDescending(a => a.At).ThenByDescending(a => a.Id)
                .Take(Math.Clamp(limit ?? 100, 1, 500)).ToListAsync();
            return Results.Ok(new
            {
                history = rows.Select(a => new
                {
                    at = a.At, section = a.Action, by = a.Actor, name = a.Actor,
                    changes = a.DataJson is null ? (System.Text.Json.JsonElement?)null : System.Text.Json.JsonDocument.Parse(a.DataJson).RootElement.Clone(),
                }),
            });
        }).RequireAuthorization(Policies.Reports);
    }

    public sealed record StageOverride(string? Name, string? Time, int? Day, string? Landmark, string? ContactNumber, decimal? Lat, decimal? Lng);
    static readonly System.Text.Json.JsonSerializerOptions OverrideJson = new(System.Text.Json.JsonSerializerDefaults.Web)
    { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower, DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull };

    public static Dictionary<long, StageOverride> StageOverrides(Trip t) =>
        string.IsNullOrEmpty(t.StageOverridesJson) ? []
        : (System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, StageOverride>>(t.StageOverridesJson, OverrideJson) ?? []).ToDictionary(x => long.Parse(x.Key), x => x.Value);

    /// <summary>legacy ops.js stagesFor(): route stage with the trip's override fields applied (detached copy).</summary>
    public static RouteStage Overlay(RouteStage s, Dictionary<long, StageOverride> ov)
    {
        if (!ov.TryGetValue(s.Id, out var o)) return s;
        return new RouteStage
        {
            Id = s.Id, RouteId = s.RouteId, CityId = s.CityId, StopSequence = s.StopSequence, Kind = s.Kind, Prime = s.Prime, PickupType = s.PickupType, ExchangePoint = s.ExchangePoint, ExchangeTime = s.ExchangeTime, MetroDescription = s.MetroDescription, Address = s.Address,
            Name = o.Name ?? s.Name, Landmark = o.Landmark ?? s.Landmark, ContactNumber = o.ContactNumber ?? s.ContactNumber, Lat = o.Lat ?? s.Lat, Lng = o.Lng ?? s.Lng, Day = o.Day ?? s.Day,
            Time = o.Time is not null && TimeOnly.TryParseExact(o.Time, "HH:mm", out var tm) ? tm : s.Time,
        };
    }
}
