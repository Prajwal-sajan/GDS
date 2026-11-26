using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Row = System.Collections.Generic.Dictionary<string, object?>;

namespace JourneyOS.Api.Reports;

/// <summary>
/// Accounts → Reports detail suite: a faithful port of legacy server/reports-suite-v21.js (8 reports),
/// server/reports-performance-v22.js (4 reports) and server/fleet-operations-v20.js over authoritative Postgres data.
/// Output keeps the legacy snake_case JSON contract the report screens render from (summary / sections / totals / methodology).
/// Trip P&L figures use the legacy trip P&L arithmetic (route expense template + recorded trip expenses + completed-trip telemetry diesel
/// + channel commission on running trips) so the Expenses / Trip P&L / Fleet diesel numbers match the reference screens.
/// </summary>
public sealed class ReportSuiteService(GdsDbContext db, ReportsService reports)
{
    public static readonly string[] V21 = ["staff-duty", "point-usage", "cancellations", "driver-behavior", "expenses", "metro-bookings", "no-shows", "van-bookings"];
    public static readonly string[] V22 = ["frequent-travellers", "point-performance", "station-performance", "trip-pnl"];
    public static bool Known(string key) => key == "fleet-operations" || V21.Contains(key) || V22.Contains(key);

    // ------------------------------------------------------------------ model
    private sealed record CrewM(long Id, string Role);
    private sealed class Sch
    {
        public long Id, RouteId; public string Date = "", Dep = "", Status = "active"; public string? TripStatus; public long? VehicleId;
        public List<CrewM> Crew = []; public decimal? Km, FuelL; public JsonElement? Tel; public JsonElement? Stops;
    }
    private sealed class Rt
    {
        public long Id, Origin, Dest; public string Service = "", Dep = ""; public List<RouteStage> Stages = []; public List<long> Cities = [];
        public decimal? DistanceKm; public int Capacity; public List<RouteExpenseItem> Exp = [];
    }
    private sealed record Px(string Seat, string Name, decimal Fare, string Status, DateTime? NoShowAt);
    private sealed record Cx(DateTime At, string By, string[] Seats, decimal Charge);
    private sealed class Bk
    {
        public long Id, SchId, RouteId, BoardingId, DroppingId, FromCity, ToCity; public string Pnr = "", Date = "", Source = "", Status = "", Name = "", Phone = "", Email = "";
        public decimal Total, Net, Commission; public DateTime BookedAt; public List<Px> Pax = []; public List<Cx> Cx = [];
    }
    private sealed class Ctx
    {
        public string Key = "", From = "", To = "", Mode = "both", Operator = "Operator", Today = "";
        public long? BusId, StaffId, ScheduleId;
        public List<Sch> Schedules = []; public List<Bk> Bookings = []; public Dictionary<long, Sch> SchById = [];
        public List<Sch> AllSchedules = [];
        public Dictionary<long, Rt> Routes = []; public Dictionary<long, Vehicle> Veh = []; public Dictionary<long, Staff> Staff = []; public Dictionary<long, string> Cities = [];
        public Dictionary<long, List<TripExpense>> TripExp = [];
        public Dictionary<long, List<Bk>> BkBySch = [];
        // v22 params
        public string SelectedPoint = "", Sort = "trips", Top = "100", Search = ""; public int MinTrips = 2; public int? MaxTrips;
    }

    // ------------------------------------------------------------------ helpers
    private static readonly CompareInfo Cmp = CultureInfo.InvariantCulture.CompareInfo;
    private static int LC(string? a, string? b) => Cmp.Compare(a ?? "", b ?? "", CompareOptions.None);
    private static int Ord(string? a, string? b) => string.CompareOrdinal(a ?? "", b ?? "");
    private static decimal R(decimal v, int d = 2) => Math.Round(v, d, MidpointRounding.AwayFromZero) / 1.000000000000000000000000000000000m;
    private static decimal R1(decimal v) => R(v, 1);
    private static GdsException Err(int status, string message) => new(status == 404 ? "NOT_FOUND" : "VALIDATION", message, status);
    private static bool ValidDay(string? s) => s is not null && Regex.IsMatch(s, @"^\d{4}-\d{2}-\d{2}$") && DateOnly.TryParseExact(s, "yyyy-MM-dd", out _);
    private static int DaysBetween(string a, string b) => DateOnly.ParseExact(b, "yyyy-MM-dd").DayNumber - DateOnly.ParseExact(a, "yyyy-MM-dd").DayNumber;
    private static string AddDays(string d, int n) => DateOnly.ParseExact(d, "yyyy-MM-dd").AddDays(n).ToString("yyyy-MM-dd");
    private static IEnumerable<string> DateRange(string from, string to) { for (var d = DateOnly.ParseExact(from, "yyyy-MM-dd"); d <= DateOnly.ParseExact(to, "yyyy-MM-dd"); d = d.AddDays(1)) yield return d.ToString("yyyy-MM-dd"); }
    private static string Title(string? s) => Regex.Replace(s ?? "", @"\b\w", m => m.Value.ToUpperInvariant());
    private static string IN(long n) => n.ToString("#,##,##0", CultureInfo.GetCultureInfo("en-IN"));
    private static string Q(IQueryCollection q, params string[] names) { foreach (var n in names) { var v = q[n].ToString(); if (!string.IsNullOrEmpty(v)) return v; } return ""; }
    private static decimal? TNum(JsonElement? t, params string[] keys)
    {
        if (t is not { ValueKind: JsonValueKind.Object } o) return null;
        foreach (var k in keys)
        {
            if (!o.TryGetProperty(k, out var v) || v.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) continue;
            if (v.ValueKind == JsonValueKind.Number) return v.GetDecimal();
            if (v.ValueKind == JsonValueKind.String && decimal.TryParse(v.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d)) return d;
            return null;
        }
        return null;
    }
    private static string? TStr(JsonElement? t, params string[] keys)
    {
        if (t is not { ValueKind: JsonValueKind.Object } o) return null;
        foreach (var k in keys) if (o.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String && v.GetString() is { Length: > 0 } s) return s;
        return null;
    }
    private static JsonElement? Prop(JsonElement? t, string key) => t is { ValueKind: JsonValueKind.Object } o && o.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Object ? v : null;
    private static JsonElement? ParseJson(string? s) { if (string.IsNullOrWhiteSpace(s)) return null; try { return JsonDocument.Parse(s).RootElement.Clone(); } catch (JsonException) { return null; } }
    private static int? ClockMinutes(string? s, TimeZoneInfo tz)
    {
        if (string.IsNullOrEmpty(s)) return null;
        var m = Regex.Match(s, @"^(\d{1,2}):(\d{2})");
        if (m.Success) return int.Parse(m.Groups[1].Value) * 60 + int.Parse(m.Groups[2].Value);
        if (DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dt)) { var l = TimeZoneInfo.ConvertTime(dt, tz); return l.Hour * 60 + l.Minute; }
        return null;
    }

    private static int PaxCount(Bk b) => b.Pax.Count(p => p.Status != "cancelled");
    private static decimal PaxShare(Bk b, Px p) => p.Fare != 0 ? p.Fare : b.Total / Math.Max(1, b.Pax.Count);
    private Rt Route(Ctx c, long id) => c.Routes.GetValueOrDefault(id) ?? new Rt();
    private static RouteStage? Stage(Rt r, long id) => r.Stages.FirstOrDefault(s => s.Id == id);
    private static string StageName(Rt r, long id, string dash) => Stage(r, id)?.Name is { Length: > 0 } n ? n : dash;
    private string City(Ctx c, long id) => c.Cities.GetValueOrDefault(id) ?? "Unknown";
    private string RouteLabel(Ctx c, Rt r) => r.Id == 0 ? "—" : $"{c.Cities.GetValueOrDefault(r.Origin)} → {c.Cities.GetValueOrDefault(r.Dest)}";
    private List<Row> CrewOf(Ctx c, Sch? s) => s is null ? [] : s.Crew.Select(x =>
    {
        var st = c.Staff.GetValueOrDefault(x.Id);
        return new Row { ["id"] = x.Id, ["role"] = x.Role, ["name"] = st?.Name ?? "Unassigned", ["phone"] = st?.Phone ?? "" };
    }).ToList();
    private static bool Assigned(Sch s, long? staffId) => staffId is null || s.Crew.Any(x => x.Id == staffId);
    private string Vehi(Ctx c, Sch? s) => s?.VehicleId is { } v && c.Veh.GetValueOrDefault(v) is { } veh ? veh.RegistrationNumber : "—";

    // ------------------------------------------------------------------ loading
    private async Task<Ctx> LoadAsync(string key, string from, string to)
    {
        var tenant = await reports.TenantAsync();
        var c = new Ctx { Key = key, From = from, To = to, Operator = string.IsNullOrEmpty(tenant.Name) ? "Operator" : tenant.Name, Today = (await reports.TodayAsync()).ToString("yyyy-MM-dd") };
        var f = DateOnly.ParseExact(from, "yyyy-MM-dd"); var t = DateOnly.ParseExact(to, "yyyy-MM-dd");
        c.Cities = await db.Cities.AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name);
        c.Veh = await db.Vehicles.AsNoTracking().ToDictionaryAsync(x => x.Id);
        c.Staff = await db.Staff.AsNoTracking().ToDictionaryAsync(x => x.Id);
        var routes = await db.Routes.AsNoTracking().Include(r => r.Stops).Include(r => r.Stages).Include(r => r.ExpenseItems).AsSplitQuery().ToListAsync();
        var caps = await db.Routes.AsNoTracking().Select(r => new { r.Id, Cap = r.CoachTemplate!.Seats.Count }).ToDictionaryAsync(x => x.Id, x => x.Cap);
        foreach (var r in routes)
        {
            var stops = r.Stops.OrderBy(s => s.Sequence).ToList();
            c.Routes[r.Id] = new Rt
            {
                Id = r.Id, Service = r.ServiceNumber, Dep = r.DepartureTime.ToString("HH:mm"), Origin = stops.FirstOrDefault()?.CityId ?? 0, Dest = stops.LastOrDefault()?.CityId ?? 0,
                Stages = r.Stages.OrderBy(s => s.StopSequence).ThenBy(s => s.Day).ThenBy(s => s.Time).ThenBy(s => s.Id).ToList(), Cities = stops.Select(s => s.CityId).ToList(),
                DistanceKm = r.DistanceKm, Capacity = caps.GetValueOrDefault(r.Id), Exp = r.ExpenseItems.OrderBy(x => x.Type == "fixed" ? 0 : 1).ThenBy(x => x.Id).ToList(),
            };
        }
        var trips = await db.Trips.AsNoTracking().Where(x => x.TravelDate >= f && x.TravelDate <= t && x.DeletedAt == null).OrderBy(x => x.TravelDate).ThenBy(x => x.Id).ToListAsync();
        var tids = trips.Select(x => x.Id).ToList();
        var asg = (await db.TripAssignments.AsNoTracking().Where(a => tids.Contains(a.TripId) && a.IsActive).OrderBy(a => a.Id).ToListAsync()).GroupBy(a => a.TripId).ToDictionary(g => g.Key, g => g.ToList());
        foreach (var x in trips)
        {
            var a = asg.GetValueOrDefault(x.Id) ?? [];
            var r = c.Routes.GetValueOrDefault(x.RouteId);
            c.AllSchedules.Add(new Sch
            {
                Id = x.Id, RouteId = x.RouteId, Date = x.TravelDate.ToString("yyyy-MM-dd"), Dep = x.DepartureTime?.ToString("HH:mm") ?? r?.Dep ?? "", Status = x.Status == "active" ? "active" : "cancelled",
                TripStatus = x.TripStatus, VehicleId = a.FirstOrDefault(y => y.VehicleId != null)?.VehicleId,
                Crew = a.Where(y => y.StaffId != null).Select(y => new CrewM(y.StaffId!.Value, Regex.Replace(y.Role ?? "", @"\s+\d+$", ""))).ToList(),
                Km = x.Km, FuelL = x.FuelL, Tel = ParseJson(x.TelemetryJson), Stops = ParseJson(x.StopEventsJson),
            });
        }
        c.TripExp = (await db.TripExpenses.AsNoTracking().Where(e => tids.Contains(e.TripId)).OrderBy(e => e.Id).ToListAsync()).GroupBy(e => e.TripId).ToDictionary(g => g.Key, g => g.ToList());
        var bks = await db.Bookings.AsNoTracking().Where(b => tids.Contains(b.TripId)).OrderBy(b => b.Id).ToListAsync();
        var bids = bks.Select(b => b.Id).ToList();
        var pax = (await db.BookingPassengers.AsNoTracking().Where(p => bids.Contains(p.BookingId)).OrderBy(p => p.Id).ToListAsync()).GroupBy(p => p.BookingId).ToDictionary(g => g.Key, g => g.ToList());
        var fin = (await db.BookingFinances.AsNoTracking().Where(x => bids.Contains(x.BookingId)).ToListAsync()).GroupBy(x => x.BookingId).ToDictionary(g => g.Key, g => g.First());
        var cxs = (await db.Cancellations.AsNoTracking().Where(x => bids.Contains(x.BookingId)).OrderBy(x => x.CreatedAt).ToListAsync()).GroupBy(x => x.BookingId).ToDictionary(g => g.Key, g => g.ToList());
        var schById = c.AllSchedules.ToDictionary(s => s.Id);
        foreach (var b in bks)
        {
            var s = schById[b.TripId]; var r = c.Routes.GetValueOrDefault(s.RouteId) ?? new Rt();
            var ps = pax.GetValueOrDefault(b.Id) ?? [];
            var fn = fin.GetValueOrDefault(b.Id);
            var primary = ps.FirstOrDefault(p => p.IsPrimary) ?? ps.FirstOrDefault();
            c.Bookings.Add(new Bk
            {
                Id = b.Id, SchId = b.TripId, RouteId = s.RouteId, BoardingId = b.BoardingStageId, DroppingId = b.DroppingStageId,
                FromCity = Stage(r, b.BoardingStageId)?.CityId ?? 0, ToCity = Stage(r, b.DroppingStageId)?.CityId ?? 0,
                Pnr = b.Pnr, Date = s.Date, Source = b.Channel, Status = b.Status == "CANCELLED" ? "cancelled" : "confirmed",
                Name = primary?.Name ?? "", Phone = b.ContactMobile ?? "", Email = b.ContactEmail ?? "",
                Total = b.TotalFare, Net = fn?.NetFare ?? ps.Sum(p => p.BaseFare), Commission = fn?.OtaCommission ?? 0, BookedAt = b.DateOfIssue,
                Pax = ps.Select(p => new Px(p.SeatCode, p.Name, p.BaseFare, p.Status == "CANCELLED" ? "cancelled" : p.BoardingStatus == "No-Show" ? "no_show" : p.BoardingStatus == "Boarded" ? "dropped" : "booked",
                    p.BoardingStatus == "No-Show" ? p.BoardingStatusAt : null)).ToList(),
                Cx = (cxs.GetValueOrDefault(b.Id) ?? []).Select(x => new Cx(x.CreatedAt, x.Reason == "bus_cancellation" ? "operator" : "passenger", x.Seats, x.Charge)).ToList(),
            });
        }
        c.BkBySch = c.Bookings.GroupBy(b => b.SchId).ToDictionary(g => g.Key, g => g.ToList());
        return c;
    }

    private void Scope(Ctx c, bool v22)
    {
        var s = c.AllSchedules.Where(x => (c.BusId is null || x.VehicleId == c.BusId) && Assigned(x, c.StaffId));
        if (v22 && c.ScheduleId is { } rid) s = s.Where(x => x.RouteId == rid);
        c.Schedules = s.ToList();
        c.SchById = c.Schedules.ToDictionary(x => x.Id);
        c.Bookings = c.Bookings.Where(b => c.SchById.ContainsKey(b.SchId)).ToList();
    }

    // ------------------------------------------------------------------ shared trip P&L (legacy server/reports.js tripPnl)
    private sealed record ExpItem(string Type, string Key, string Label, decimal PerDay, bool Manual, bool TelemetryDiesel);
    private sealed record Pnl(int Seats, int Capacity, decimal Net, decimal Commission, decimal Expense, List<ExpItem> Items);
    private Pnl TripPnl(Ctx c, Sch s)
    {
        var r = Route(c, s.RouteId); var active = s.Status == "active";
        var conf = (c.BkBySch.GetValueOrDefault(s.Id) ?? []).Where(b => b.Status == "confirmed").ToList();
        decimal PaxNet(Bk b) { var tot = b.Pax.Sum(p => p.Fare); if (tot == 0) tot = 1; return b.Pax.Where(p => p.Status != "cancelled").Sum(p => p.Fare) / tot * b.Net; }
        decimal PaxComm(Bk b) => b.Net == 0 ? 0 : PaxNet(b) * b.Commission / b.Net;
        var recorded = c.TripExp.GetValueOrDefault(s.Id) ?? [];
        var ov = recorded.Where(e => e.Kind == "override").GroupBy(e => (e.Type, e.Category)).ToDictionary(g => g.Key, g => g.Last().Amount);
        var items = r.Exp.Where(x => x.Type == "fixed" || active)
            .Select(x => new ExpItem(x.Type, x.Key, x.Label, ov.TryGetValue((x.Type, x.Key), out var o) ? o : x.PerTrip, false, false)).ToList();
        items.AddRange(recorded.Where(e => e.Kind != "override" && (active || e.Type == "fixed")).Select(e => new ExpItem(e.Type == "fixed" ? "fixed" : "running", e.Category, e.Category, e.Amount, true, false)));
        var diesel = s.TripStatus == "completed" && active ? TNum(s.Tel, "diesel_cost") : null;
        if (diesel is >= 0)
        {
            var i = items.FindIndex(x => x.Type == "running" && !x.Manual && !ov.ContainsKey((x.Type, x.Key)) && Regex.IsMatch(x.Key + x.Label, "diesel|fuel", RegexOptions.IgnoreCase));
            if (i >= 0) items[i] = items[i] with { PerDay = diesel.Value, TelemetryDiesel = true };
        }
        var commission = active ? R(conf.Sum(PaxComm)) : 0;
        var expense = R(items.Sum(x => x.PerDay) + commission);
        return new Pnl(conf.Sum(PaxCount), r.Capacity, conf.Sum(PaxNet), commission, expense, items);
    }

    // ------------------------------------------------------------------ entry points
    public async Task<object> OptionsV21Async()
    {
        var veh = await db.Vehicles.AsNoTracking().ToListAsync(); var staff = await db.Staff.AsNoTracking().ToListAsync();
        return new Row
        {
            ["buses"] = veh.Select(x => new Row { ["id"] = x.Id, ["name"] = x.RegistrationNumber }).OrderBy(x => (string)x["name"]!, Comparer<string>.Create(LC)).ToList(),
            ["staff"] = staff.Select(x => new Row { ["id"] = x.Id, ["name"] = x.Name, ["phone"] = x.Phone, ["role"] = x.Role }).OrderBy(x => (string)x["name"]!, Comparer<string>.Create(LC)).ToList(),
        };
    }

    public async Task<object> OptionsV22Async()
    {
        var cities = await db.Cities.AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name);
        var routes = await db.Routes.AsNoTracking().Include(r => r.Stops).OrderBy(r => r.Id).ToListAsync();
        return new Row
        {
            ["buses"] = (await db.Vehicles.AsNoTracking().OrderBy(x => x.Id).ToListAsync()).Select(x => new Row { ["id"] = x.Id, ["name"] = x.RegistrationNumber }).ToList(),
            ["staff"] = (await db.Staff.AsNoTracking().OrderBy(x => x.Id).ToListAsync()).Select(x => new Row { ["id"] = x.Id, ["name"] = x.Name, ["role"] = x.Role }).ToList(),
            ["schedules"] = routes.Select(r =>
            {
                var st = r.Stops.OrderBy(s => s.Sequence).ToList();
                return new Row { ["id"] = r.Id, ["name"] = $"{r.ServiceNumber} · {cities.GetValueOrDefault(st.FirstOrDefault()?.CityId ?? 0) ?? "Unknown"} → {cities.GetValueOrDefault(st.LastOrDefault()?.CityId ?? 0) ?? "Unknown"}" };
            }).ToList(),
        };
    }

    public async Task<object> FleetOptionsAsync()
    {
        var veh = await db.Vehicles.AsNoTracking().ToListAsync(); var staff = await db.Staff.AsNoTracking().ToListAsync();
        return new Row
        {
            ["buses"] = veh.Select(v => new Row { ["id"] = v.Id, ["registration_number"] = v.RegistrationNumber, ["vehicle_role"] = v.VehicleRole ?? "main" })
                .OrderBy(x => (string)x["registration_number"]!, Comparer<string>.Create(LC)).ToList(),
            ["staff"] = staff.Where(p => Regex.IsMatch(p.Role ?? "", "driver|helper|conductor|crew|attendant", RegexOptions.IgnoreCase))
                .Select(p => new Row { ["id"] = p.Id, ["name"] = p.Name, ["phone"] = p.Phone ?? "", ["role"] = p.Role ?? "" }).OrderBy(x => (string)x["name"]!, Comparer<string>.Create(LC)).ToList(),
        };
    }

    private async Task<long?> IdParam(string raw, string name, bool bus, string invalid, string missing)
    {
        if (string.IsNullOrEmpty(raw)) return null;
        if (!Regex.IsMatch(raw, @"^\d{1,12}$")) throw Err(400, invalid);
        var id = long.Parse(raw);
        var ok = name switch { "bus_id" => await db.Vehicles.AnyAsync(v => v.Id == id), "staff_id" => await db.Staff.AnyAsync(s => s.Id == id), _ => await db.Routes.AnyAsync(r => r.Id == id) };
        if (!ok) throw Err(404, missing);
        _ = bus;
        return id;
    }

    public async Task<object> ComputeAsync(string key, IQueryCollection q)
    {
        if (!Known(key)) throw Err(404, "Unknown report");
        var today = (await reports.TodayAsync()).ToString("yyyy-MM-dd");
        if (key == "fleet-operations")
        {
            var from = Q(q, "from", "from_date") is { Length: > 0 } a ? a : AddDays(today, -6); var to = Q(q, "to", "to_date") is { Length: > 0 } b ? b : today;
            if (!ValidDay(from) || !ValidDay(to) || Ord(from, to) > 0 || DaysBetween(from, to) + 1 > 366) throw Err(400, "Choose valid dates (maximum 366 days)");
            var staffRaw = Q(q, "staff_id", "driver_id"); var busRaw = Q(q, "bus_id", "vehicle_id");
            if ((staffRaw != "" && !Regex.IsMatch(staffRaw, @"^\d{1,12}$")) || (busRaw != "" && !Regex.IsMatch(busRaw, @"^\d{1,12}$"))) throw Err(400, "Invalid staff or bus filter");
            var staffId = await IdParam(staffRaw, "staff_id", false, "Invalid staff or bus filter", "Staff member not found");
            var busId = await IdParam(busRaw, "bus_id", true, "Invalid staff or bus filter", "Bus not found");
            var c = await LoadAsync(key, from, to); c.StaffId = staffId; c.BusId = busId;
            return Fleet(c);
        }
        if (V21.Contains(key))
        {
            var from = Q(q, "from", "from_date") is { Length: > 0 } a ? a : AddDays(today, -6); var to = Q(q, "to", "to_date") is { Length: > 0 } b ? b : today;
            if (!ValidDay(from) || !ValidDay(to) || Ord(from, to) > 0 || DaysBetween(from, to) > 365) throw Err(400, "Choose a valid date range of up to 366 days");
            var busId = await IdParam(Q(q, "bus_id", "vehicle_id"), "bus_id", true, "Invalid bus ID", "Bus not found");
            var staffId = await IdParam(Q(q, "staff_id", "driver_id"), "staff_id", false, "Invalid staff ID", "Staff member not found");
            var c = await LoadAsync(key, from, to); c.BusId = busId; c.StaffId = staffId;
            var mode = q["mode"].ToString(); c.Mode = mode is "both" or "pickup" or "drop" ? mode : "both";
            Scope(c, false);
            return key switch
            {
                "staff-duty" => StaffDuty(c), "point-usage" => PointUsage(c), "cancellations" => Cancellations(c), "driver-behavior" => Behavior(c),
                "expenses" => Expenses(c), "metro-bookings" => Feeder(c, "metro"), "no-shows" => NoShows(c), _ => Feeder(c, "van"),
            };
        }
        {
            var to = Q(q, "to", "to_date") is { Length: > 0 } b ? b : today;
            var from = Q(q, "from", "from_date") is { Length: > 0 } a ? a : AddDays(to, key == "frequent-travellers" ? -365 : -6);
            if (!ValidDay(from) || !ValidDay(to) || Ord(from, to) > 0 || DaysBetween(from, to) > 1120) throw Err(400, "Choose a valid date range up to 3 years");
            var busId = await IdParam(q["bus_id"].ToString(), "bus_id", true, "Invalid bus_id", "bus_id not found");
            var staffId = await IdParam(q["staff_id"].ToString(), "staff_id", false, "Invalid staff_id", "staff_id not found");
            var schId = await IdParam(q["schedule_id"].ToString(), "schedule_id", false, "Invalid schedule_id", "schedule_id not found");
            var c = await LoadAsync(key, from, to); c.BusId = busId; c.StaffId = staffId; c.ScheduleId = schId;
            c.Mode = q["mode"].ToString() == "drop" ? "drop" : "pickup";
            var sp = q["point"].ToString().Trim(); c.SelectedPoint = sp.Length > 200 ? sp[..200] : sp;
            var minRaw = q["min_trips"].ToString(); var maxRaw = q["max_trips"].ToString();
            if (minRaw != "" && !int.TryParse(minRaw, out _)) throw Err(400, "Minimum trips must be at least 1");
            c.MinTrips = minRaw == "" ? 2 : int.Parse(minRaw);
            if (c.MinTrips < 1 || c.MinTrips > 10000) throw Err(400, "Minimum trips must be at least 1");
            if (maxRaw is not ("" or "any"))
            {
                if (!int.TryParse(maxRaw, out var mx) || mx < c.MinTrips || mx > 10000) throw Err(400, "Invalid maximum trips");
                c.MaxTrips = mx;
            }
            var sort = q["sort"].ToString(); c.Sort = sort is "trips" or "spend" or "recent" ? sort : "trips";
            var top = q["top"].ToString(); c.Top = top is "50" or "100" or "500" or "1000" or "all" ? top : "100";
            var search = q["search"].ToString().Trim(); c.Search = search.Length > 100 ? search[..100] : search;
            Scope(c, true);
            return key switch { "frequent-travellers" => Frequent(c), "point-performance" => Point(c), "station-performance" => Station(c), _ => TripPnlReport(c) };
        }
    }

    private static Row Output(Ctx c, object summary, Row sections, Row totals, string note)
        => new() { ["report"] = c.Key, ["from"] = c.From, ["to"] = c.To, ["bus_id"] = c.BusId, ["staff_id"] = c.StaffId, ["mode"] = c.Mode, ["operator_name"] = c.Operator,
            ["summary"] = summary, ["sections"] = sections, ["totals"] = totals, ["methodology"] = note };

    private static Row Output22(Ctx c, object summary, Row sections, Row totals, string note, Row? more = null)
    {
        var o = new Row
        {
            ["report"] = c.Key, ["from"] = c.From, ["to"] = c.To, ["bus_id"] = c.BusId, ["staff_id"] = c.StaffId, ["schedule_id"] = c.ScheduleId, ["mode"] = c.Mode, ["point"] = c.SelectedPoint,
            ["min_trips"] = c.MinTrips, ["max_trips"] = c.MaxTrips, ["sort"] = c.Sort, ["top"] = c.Top, ["search"] = c.Search, ["operator_name"] = c.Operator,
            ["summary"] = summary, ["sections"] = sections, ["totals"] = totals, ["methodology"] = note,
        };
        if (more is not null) foreach (var (k, v) in more) o[k] = v;
        return o;
    }

    private static decimal D(Row r, string k) => r.GetValueOrDefault(k) switch { null => 0, int i => i, long l => l, decimal d => d, double d => (decimal)d, _ => 0 };
    private static decimal Sum(IEnumerable<Row> rows, string k) => rows.Sum(r => D(r, k));
    private static int ISum(IEnumerable<Row> rows, string k) => (int)rows.Sum(r => D(r, k));
    private static string S(Row r, string k) => r.GetValueOrDefault(k) as string ?? "";

    // ------------------------------------------------------------------ v21: point usage
    private static readonly HashSet<string> OwnSources = ["website", "app", "staff", "agent", "branch", "operator", "offline", "counter"];
    private Row PointUsage(Ctx c)
    {
        var raw = c.Bookings.Where(b => OwnSources.Contains(b.Source.ToLowerInvariant()) && b.Status == "confirmed" && PaxCount(b) > 0).Select(b =>
        {
            var r = Route(c, b.RouteId);
            return (boarding: StageName(r, b.BoardingId, "—"), dropping: StageName(r, b.DroppingId, "—"), date: b.Date, seats: PaxCount(b), amount: b.Total, pnr: b.Pnr);
        }).ToList();
        var allSeats = raw.Sum(x => x.seats);
        List<Row> Build(Func<(string boarding, string dropping, string date, int seats, decimal amount, string pnr), string> fn) => raw.GroupBy(fn).Select(g => new Row
        {
            ["point"] = g.Key, ["bookings"] = g.Count(), ["seats"] = g.Sum(x => x.seats), ["amount"] = R(g.Sum(x => x.amount)), ["days_used"] = g.Select(x => x.date).Distinct().Count(),
            ["share_pct"] = raw.Count > 0 ? R(g.Sum(x => x.seats) / (decimal)(allSeats == 0 ? 1 : allSeats) * 100, 1) : 0m,
        }).OrderByDescending(x => D(x, "seats")).ThenByDescending(x => D(x, "bookings")).ToList();
        var boarding = Build(x => x.boarding); var dropping = Build(x => x.dropping);
        var pairs = raw.GroupBy(x => x.boarding + "|" + x.dropping).Select(g => new Row
        {
            ["boarding"] = g.First().boarding, ["dropping"] = g.First().dropping, ["bookings"] = g.Count(), ["seats"] = g.Sum(x => x.seats), ["amount"] = R(g.Sum(x => x.amount)),
        }).OrderByDescending(x => D(x, "seats")).ThenByDescending(x => D(x, "bookings")).ToList();
        var amount = R(raw.Sum(x => x.amount));
        var summary = new Row { ["bookings"] = raw.Count, ["seats"] = allSeats, ["amount"] = amount, ["boarding_points"] = boarding.Count, ["dropping_points"] = dropping.Count };
        var totals = new Row
        {
            ["boarding"] = new Row { ["point"] = boarding.Count + " points", ["bookings"] = raw.Count, ["seats"] = allSeats, ["amount"] = amount },
            ["dropping"] = new Row { ["point"] = dropping.Count + " points", ["bookings"] = raw.Count, ["seats"] = allSeats, ["amount"] = amount },
            ["pairs"] = new Row { ["boarding"] = pairs.Count + " pairs", ["bookings"] = raw.Count, ["seats"] = allSeats, ["amount"] = amount },
        };
        return Output(c, summary, new Row { ["boarding"] = boarding, ["dropping"] = dropping, ["pairs"] = pairs }, totals,
            "Own-channel confirmed bookings only. Share = point seats ÷ all eligible seats; days used = distinct travel dates. Rows preserve each source point name without merging aliases.");
    }

    // ------------------------------------------------------------------ v21: resale index, cancellations, no-shows
    private sealed record Sale(DateTime At, string Pnr, string Seat, decimal Amount);
    private static Dictionary<string, List<Sale>> ResaleIndex(Ctx c)
    {
        var idx = new Dictionary<string, List<Sale>>();
        foreach (var b in c.Bookings.Where(b => b.Status == "confirmed" || b.Pax.Any(p => p.Status != "cancelled")))
            foreach (var p in b.Pax.Where(p => p.Status != "cancelled"))
            {
                var k = b.SchId + "|" + p.Seat;
                if (!idx.TryGetValue(k, out var a)) idx[k] = a = [];
                a.Add(new Sale(b.BookedAt, b.Pnr, p.Seat, p.Fare != 0 ? p.Fare : b.Total / Math.Max(1, b.Pax.Count)));
            }
        foreach (var k in idx.Keys.ToList()) idx[k] = idx[k].OrderBy(x => x.At).ToList();
        return idx;
    }
    private static Sale? Resale(Dictionary<string, List<Sale>> idx, long sid, string seat, DateTime? after, string except)
        => after is null ? null : (idx.GetValueOrDefault(sid + "|" + seat) ?? []).FirstOrDefault(x => x.At > after && x.Pnr != except);

    private Row Cancellations(Ctx c)
    {
        var idx = ResaleIndex(c); var outRows = new List<Row>();
        foreach (var b in c.Bookings)
        {
            var r = Route(c, b.RouteId);
            foreach (var x in b.Cx)
            {
                var resold = x.Seats.Select(seat => Resale(idx, b.SchId, seat, x.At, b.Pnr)).Where(s => s is not null).ToList();
                var originals = b.Pax.Where(p => x.Seats.Contains(p.Seat)).ToList();
                var amount = originals.Count > 0 ? originals.Sum(p => PaxShare(b, p)) : b.Total * x.Seats.Length / Math.Max(1, b.Pax.Count);
                outRows.Add(new Row
                {
                    ["date"] = b.Date, ["cancelled_at"] = x.At.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"), ["service"] = r.Service, ["pnr"] = b.Pnr, ["passenger"] = b.Name, ["phone"] = b.Phone,
                    ["boarding"] = StageName(r, b.BoardingId, "—"), ["source"] = b.Source, ["by"] = Title(x.By), ["seats"] = x.Seats.Length,
                    ["amount"] = R(amount), ["charge"] = R(x.Charge), ["resold"] = resold.Count, ["resold_label"] = resold.Count > 0 ? resold.Count + "/" + x.Seats.Length : "—",
                    ["recovered"] = R(resold.Sum(s => s!.Amount)), ["resale_verified"] = resold.Count > 0,
                });
            }
        }
        outRows = outRows.OrderBy(x => S(x, "date"), StringComparer.Ordinal).ThenBy(x => S(x, "pnr"), Comparer<string>.Create(LC)).ToList();
        var resoldRows = outRows.Where(x => D(x, "resold") > 0).ToList();
        var seats = ISum(outRows, "seats");
        var summary = new Row
        {
            ["cancellations"] = outRows.Count, ["seats"] = seats, ["amount"] = R(Sum(outRows, "amount")), ["charges_kept"] = R(Sum(outRows, "charge")),
            ["by_operator"] = outRows.Count(x => S(x, "by").ToLowerInvariant() == "operator"), ["bookings_resold"] = resoldRows.Count,
            ["resale_pct"] = outRows.Count > 0 ? R(resoldRows.Count / (decimal)outRows.Count * 100, 1) : 0m, ["seats_resold"] = ISum(outRows, "resold"), ["recovered"] = R(Sum(outRows, "recovered")),
        };
        var totals = new Row
        {
            ["rows"] = new Row { ["date"] = outRows.Count + " cancellations", ["seats"] = seats, ["amount"] = summary["amount"], ["charge"] = summary["charges_kept"],
                ["resold_label"] = summary["seats_resold"] + "/" + seats, ["recovered"] = summary["recovered"] },
        };
        return Output(c, summary, new Row { ["rows"] = outRows }, totals,
            "Cancelled bookings by travel date. Resold = same seat on same trip booked after cancellation; recovered is the later seat fare. Without later booking evidence, resale is not assumed.");
    }

    private Row NoShows(Ctx c)
    {
        var idx = ResaleIndex(c); var outRows = new List<Row>();
        foreach (var b in c.Bookings)
        {
            var r = Route(c, b.RouteId); var s = c.SchById.GetValueOrDefault(b.SchId);
            foreach (var p in b.Pax.Where(x => x.Status == "no_show"))
            {
                var res = p.NoShowAt is { } at ? Resale(idx, b.SchId, p.Seat, at, b.Pnr) : null;
                outRows.Add(new Row
                {
                    ["date"] = b.Date, ["service"] = r.Service, ["bus"] = Vehi(c, s), ["pnr"] = b.Pnr, ["passenger"] = p.Name, ["phone"] = b.Phone,
                    ["boarding"] = StageName(r, b.BoardingId, "—"), ["source"] = b.Source, ["seat"] = p.Seat, ["fare"] = R(PaxShare(b, p)),
                    ["resold"] = res is null ? 0 : 1, ["resold_label"] = res is null ? "—" : "1/1", ["recovered"] = res is null ? 0m : R(res.Amount), ["verified"] = res is not null,
                });
            }
        }
        outRows = outRows.OrderBy(x => S(x, "date"), StringComparer.Ordinal).ThenBy(x => S(x, "pnr"), Comparer<string>.Create(LC)).ToList();
        var resold = ISum(outRows, "resold");
        var summary = new Row
        {
            ["no_shows"] = outRows.Count, ["fare"] = R(Sum(outRows, "fare")), ["seats_resold"] = resold,
            ["resale_pct"] = outRows.Count > 0 ? R(resold / (decimal)outRows.Count * 100, 1) : 0m, ["recovered"] = R(Sum(outRows, "recovered")),
        };
        var totals = new Row { ["rows"] = new Row { ["date"] = outRows.Count + " no-shows", ["fare"] = summary["fare"], ["resold_label"] = resold + " resold", ["recovered"] = summary["recovered"] } };
        return Output(c, summary, new Row { ["rows"] = outRows }, totals,
            "A no-show is a passenger marked no_show. Resale requires a recorded no-show timestamp and a later sale of the same seat on the same trip; where timing evidence is missing, resale is unknown rather than presumed.");
    }

    // ------------------------------------------------------------------ v21: driver behaviour
    private Row Behavior(Ctx c)
    {
        var active = c.Schedules.Where(s => s.Status == "active").ToList();
        var recorded = active.Where(s => s.TripStatus != "running" && s.TripStatus != "scheduled" && s.Tel is { ValueKind: JsonValueKind.Object }
            && new[] { "driving_score", "hard_brake", "harsh_accel", "over_speed_minutes", "idling_minutes" }.Any(k => TNum(s.Tel, k) is not null)).ToList();
        var outRows = recorded.Select(s =>
        {
            var t = s.Tel; var r = Route(c, s.RouteId);
            var drivers = CrewOf(c, s).Where(x => Regex.IsMatch(S(x, "role"), "driver", RegexOptions.IgnoreCase)).ToList();
            var km = s.Km ?? TNum(t, "km") ?? 0;
            var hard = TNum(t, "hard_brake") ?? 0; var harsh = TNum(t, "harsh_accel", "harsh_acceleration") ?? 0; var freerun = TNum(t, "free_run", "freerun") ?? 0;
            var over = TNum(t, "over_speed_minutes", "overspeed_minutes", "over_speed_duration_minutes");
            var idle = TNum(t, "idling_minutes", "idle_minutes", "idling_duration_minutes");
            var scoreSource = TNum(t, "driving_score");
            var complete = km > 0 && TNum(t, "hard_brake") is not null && TNum(t, "harsh_accel", "harsh_acceleration") is not null && TNum(t, "free_run", "freerun") is not null && over is not null && idle is not null;
            decimal? score = scoreSource ?? (complete ? Math.Max(0, Math.Round(100 - 5 * (hard + harsh + freerun + .5m * over!.Value / 10 + .2m * idle!.Value / 10) * 100 / km, MidpointRounding.AwayFromZero)) : null);
            return new Row
            {
                ["date"] = s.Date, ["dep"] = s.Dep, ["service"] = r.Service, ["route"] = RouteLabel(c, r), ["bus"] = Vehi(c, s),
                ["drivers"] = string.Join(", ", drivers.Select(x => S(x, "name") + (S(x, "phone") != "" ? " (" + S(x, "phone") + ")" : ""))) + (drivers.Count > 1 ? " · Shared" : ""),
                ["driver_ids"] = drivers.Select(x => x["id"]).ToList(), ["staff"] = drivers, ["km"] = R1(km), ["score"] = score, ["hard_brake"] = hard, ["harsh_accel"] = harsh,
                ["over_speed"] = over, ["over_speed_events"] = TNum(t, "over_speed"), ["top_speed"] = TNum(t, "max_speed_kmh"),
                ["idling"] = idle, ["idling_events"] = TNum(t, "idling"), ["freerun"] = freerun, ["shared"] = drivers.Count > 1 ? 1 : 0,
            };
        }).ToList();
        var m = new Dictionary<long, (Row x, decimal scoreW, int scoreN, int overN, int idleN, SortedSet<string> buses)>();
        var order = new List<long>();
        foreach (var row in outRows)
            foreach (var st in (List<Row>)row["staff"]!)
            {
                var id = (long)st["id"]!;
                if (!m.TryGetValue(id, out var e))
                {
                    e = (new Row { ["driver"] = st["name"], ["driver_id"] = id, ["phone"] = st["phone"], ["trips"] = 0, ["shared"] = 0, ["km"] = 0m, ["hard_brake"] = 0m, ["harsh_accel"] = 0m,
                        ["over_speed"] = 0m, ["idling"] = 0m, ["freerun"] = 0m, ["top_speed"] = (decimal?)null }, 0, 0, 0, 0, new SortedSet<string>(StringComparer.Ordinal));
                    order.Add(id);
                }
                var x = e.x;
                x["trips"] = (int)x["trips"]! + 1; x["shared"] = (int)x["shared"]! + (int)row["shared"]!; x["km"] = D(x, "km") + D(row, "km");
                x["hard_brake"] = D(x, "hard_brake") + D(row, "hard_brake"); x["harsh_accel"] = D(x, "harsh_accel") + D(row, "harsh_accel");
                if (row["over_speed"] is decimal o) { x["over_speed"] = D(x, "over_speed") + o; e.overN++; }
                if (row["idling"] is decimal i) { x["idling"] = D(x, "idling") + i; e.idleN++; }
                x["freerun"] = D(x, "freerun") + D(row, "freerun");
                x["top_speed"] = Math.Max((decimal?)x["top_speed"] ?? 0, (decimal?)row["top_speed"] ?? 0);
                if (row["score"] is decimal sc) { e.scoreW += sc; e.scoreN++; }
                e.buses.Add(S(row, "bus"));
                m[id] = e;
            }
        var drivers = order.Select(id =>
        {
            var (x, w, n, overN, idleN, buses) = m[id];
            var o = new Row(x)
            {
                ["km"] = R1(D(x, "km")), ["score"] = n > 0 ? Math.Round(w / n, MidpointRounding.AwayFromZero) : (decimal?)null,
                ["over_speed"] = overN > 0 ? x["over_speed"] : null, ["idling"] = idleN > 0 ? x["idling"] : null,
                ["buses"] = string.Join(", ", buses), ["top_speed"] = (decimal?)x["top_speed"] is > 0 ? x["top_speed"] : null,
            };
            return o;
        }).OrderBy(x => (decimal?)x["score"] ?? 101).ThenBy(x => S(x, "driver"), Comparer<string>.Create(LC)).ToList();
        var available = drivers.Where(x => x["score"] is not null).ToList();
        var summary = new Row
        {
            ["trips_recorded"] = outRows.Count, ["trips"] = active.Count, ["drivers"] = drivers.Count,
            ["avg_driver_score"] = available.Count > 0 ? Math.Round(Sum(available, "score") / available.Count, MidpointRounding.AwayFromZero) : (decimal?)null,
            ["below_65"] = available.Count(x => D(x, "score") < 65),
            ["trips_without_driver"] = active.Count(s => !s.Crew.Any(x => Regex.IsMatch(x.Role, "driver", RegexOptions.IgnoreCase))),
        };
        var totals = new Row
        {
            ["drivers"] = new Row { ["driver"] = drivers.Count + " drivers", ["trips"] = ISum(drivers, "trips"), ["shared"] = ISum(drivers, "shared"), ["km"] = R1(Sum(drivers, "km")),
                ["hard_brake"] = Sum(drivers, "hard_brake"), ["harsh_accel"] = Sum(drivers, "harsh_accel"), ["over_speed"] = Sum(drivers, "over_speed"), ["idling"] = Sum(drivers, "idling"), ["freerun"] = Sum(drivers, "freerun") },
            ["rows"] = new Row { ["date"] = outRows.Count + " trips", ["km"] = R1(Sum(outRows, "km")), ["hard_brake"] = Sum(outRows, "hard_brake"), ["harsh_accel"] = Sum(outRows, "harsh_accel"),
                ["over_speed"] = Sum(outRows, "over_speed"), ["idling"] = Sum(outRows, "idling"), ["freerun"] = Sum(outRows, "freerun") },
        };
        return Output(c, summary, new Row { ["drivers"] = drivers, ["rows"] = outRows }, totals,
            "Telemetry only for trips with recorded readings; every assigned driver receives all alerts on shared trips. Score uses recorded provider score when available, else the reference penalty formula. Duration fields are shown only where actual minutes exist; raw event counts are not mislabeled as minutes.");
    }

    // ------------------------------------------------------------------ v21: expenses
    private Row Expenses(Ctx c)
    {
        var all = c.Schedules.OrderBy(s => s.Date, StringComparer.Ordinal).ThenBy(s => s.Dep, StringComparer.Ordinal).ToList();
        var rows = new List<(Row row, Dictionary<string, decimal> cats)>();
        var cmap = new Dictionary<string, Row>(); var corder = new List<string>();
        void AddItem(string key, string label, string type, decimal amount, Dictionary<string, decimal> cats)
        {
            cats[key] = R(cats.GetValueOrDefault(key) + amount);
            if (!cmap.TryGetValue(key, out var cat)) { cmap[key] = cat = new Row { ["key"] = key, ["label"] = label, ["type"] = type, ["amount"] = 0m, ["trips"] = 0 }; corder.Add(key); }
            cat["amount"] = D(cat, "amount") + amount; cat["trips"] = (int)cat["trips"]! + 1;
        }
        foreach (var s in all)
        {
            var r = Route(c, s.RouteId); var on = s.Status == "active"; var p = TripPnl(c, s);
            var row = new Row { ["date"] = s.Date, ["dep"] = s.Dep, ["service"] = r.Service, ["route"] = RouteLabel(c, r), ["bus"] = on ? Vehi(c, s) : "Turned off",
                ["vehicle_id"] = s.VehicleId, ["off"] = !on, ["trips"] = on ? 1 : 0, ["total"] = 0m };
            var cats = new Dictionary<string, decimal>();
            foreach (var it in p.Items)
                AddItem(Regex.Replace((it.Key is { Length: > 0 } ? it.Key : it.Label is { Length: > 0 } ? it.Label : "Other").ToLowerInvariant(), @"\W+", "_"), it.Label is { Length: > 0 } ? it.Label : it.Key, it.Type, it.PerDay, cats);
            if (on) AddItem("channel_commission", "Channel commission", "running", p.Commission, cats);
            row["total"] = R(p.Expense);
            rows.Add((row, cats));
        }
        var total = R(rows.Sum(x => D(x.row, "total")));
        var categories = corder.Select(k => cmap[k]).Select(x => new Row
        {
            ["key"] = x["key"], ["label"] = x["label"], ["type"] = Title((string)x["type"]!), ["amount"] = R(D(x, "amount")), ["trips"] = x["trips"],
            ["share_pct"] = total != 0 ? R(R(D(x, "amount")) / total * 100, 1) : 0m, ["avg_per_trip"] = (int)x["trips"]! > 0 ? R(D(x, "amount") / (int)x["trips"]!) : 0m,
        }).OrderByDescending(x => D(x, "amount")).ToList();
        var fixedAmt = R(Sum(categories.Where(x => S(x, "type") == "Fixed"), "amount"));
        var commission = R(categories.FirstOrDefault(x => S(x, "key") == "channel_commission") is { } cc ? D(cc, "amount") : 0);
        var top = categories.Take(8).Select(x => new Row { ["key"] = x["key"], ["label"] = x["label"] }).ToList();
        var keys = top.Select(x => S(x, "key")).ToHashSet();
        foreach (var (row, cats) in rows)
        {
            foreach (var k in keys) row[k] = R(cats.GetValueOrDefault(k));
            row["other"] = R(cats.Where(kv => !keys.Contains(kv.Key)).Sum(kv => kv.Value));
        }
        var rowList = rows.Select(x => x.row).ToList();
        var byBus = rowList.GroupBy(r => r["vehicle_id"]?.ToString() ?? "none").Select(g =>
        {
            var vid = g.First()["vehicle_id"] as long?;
            var x = new Row { ["bus"] = vid is { } v ? c.Veh.GetValueOrDefault(v)?.RegistrationNumber : "Unassigned", ["trips"] = ISum(g, "trips"), ["off"] = g.Count(r => (bool)r["off"]!),
                ["total"] = R(Sum(g, "total")), ["other"] = R(Sum(g, "other")) };
            foreach (var t in top) x[S(t, "key")] = Sum(g, S(t, "key"));
            x["trips_label"] = (int)x["trips"]! + ((int)x["off"]! > 0 ? " (+" + x["off"] + " off)" : "");
            return x;
        }).OrderByDescending(x => D(x, "total")).ToList();
        var trips = ISum(rowList, "trips");
        var summary = new Row
        {
            ["total_expense"] = total, ["fixed"] = fixedAmt, ["running"] = R(total - fixedAmt), ["channel_commission"] = commission, ["per_trip"] = trips > 0 ? R(total / trips) : 0m,
            ["trips"] = trips, ["trips_turned_off"] = rowList.Count(x => (bool)x["off"]!), ["buses"] = rowList.Where(x => (int)x["trips"]! > 0 && x["vehicle_id"] is not null).Select(x => x["vehicle_id"]).Distinct().Count(),
        };
        var tBus = new Row { ["bus"] = byBus.Count + " buses", ["trips_label"] = trips, ["total"] = total, ["other"] = R(Sum(byBus, "other")) };
        var tRows = new Row { ["date"] = rowList.Count + " trips", ["total"] = total, ["other"] = R(Sum(rowList, "other")) };
        foreach (var t in top) { tBus[S(t, "key")] = R(Sum(byBus, S(t, "key"))); tRows[S(t, "key")] = R(Sum(rowList, S(t, "key"))); }
        var totals = new Row { ["categories"] = new Row { ["label"] = categories.Count + " categories", ["amount"] = total, ["share_pct"] = 100 }, ["by_bus"] = tBus, ["rows"] = tRows };
        var o = Output(c, summary, new Row { ["categories"] = categories, ["by_bus"] = byBus, ["rows"] = rowList }, totals,
            "Trip expense categories follow the GDS trip P&L breakdown including commission; turned-off trips include configured fixed costs only. Category names without records are omitted. Actual diesel telemetry changes P&L only when it is part of the persisted expense breakdown.");
        o["top_categories"] = top;
        return o;
    }

    // ------------------------------------------------------------------ v21: staff duty
    private Row StaffDuty(Ctx c)
    {
        var st = c.StaffId is { } sid ? c.Staff.GetValueOrDefault(sid) : null;
        if (st is null)
        {
            var e = Output(c, new Row(), new Row { ["rows"] = new List<Row>(), ["daily"] = new List<Row>() }, new Row(), "Select a driver or staff member to see their statement.");
            e["staff"] = null; return e;
        }
        var tz = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");
        var rows = new List<Row>();
        foreach (var s in c.Schedules.Where(s => Assigned(s, c.StaffId)))
        {
            var r = Route(c, s.RouteId); var crew = CrewOf(c, s); var me = crew.FirstOrDefault(x => (long)x["id"]! == st.Id);
            var bp = r.Stages.FirstOrDefault(x => x.Kind == "pickup"); var drop = r.Stages.LastOrDefault(x => x.Kind == "drop");
            var start = bp is null ? null : Prop(s.Stops, bp.Id.ToString()); var end = drop is null ? null : Prop(s.Stops, drop.Id.ToString());
            var firstActual = TStr(start, "actual_time", "time_actual"); var lastActual = TStr(end, "actual_time", "time_actual");
            var other = c.AllSchedules.Where(z => z.Status == "active" && z.VehicleId == s.VehicleId && (z.Km ?? 0) > 0 && (z.FuelL ?? 0) > 0).ToList();
            decimal? busAvg = other.Count > 0 ? R(other.Sum(z => z.Km!.Value) / other.Sum(z => z.FuelL!.Value)) : null;
            decimal? eff = s.Km > 0 && s.FuelL > 0 ? R(s.Km.Value / s.FuelL.Value) : null;
            int? observed = null;
            if (ClockMinutes(firstActual, tz) is { } am && bp is not null) observed = ((am - (bp.Time.Hour * 60 + bp.Time.Minute) + 720) % 1440 + 1440) % 1440 - 720;
            var delay = TNum(start, "delay_minutes") ?? observed;
            rows.Add(new Row
            {
                ["date"] = s.Date, ["dep"] = s.Dep, ["service"] = r.Service, ["route"] = RouteLabel(c, r), ["bus"] = Vehi(c, s), ["status"] = s.Status == "active" ? "Worked" : "Halt",
                ["crew_role"] = me is null ? "" : S(me, "role"), ["pickup_scheduled"] = bp?.Time.ToString("HH:mm"), ["pickup_actual"] = firstActual,
                ["drop_scheduled"] = drop?.Time.ToString("HH:mm"), ["drop_actual"] = lastActual,
                ["late"] = delay is null ? null : delay >= 8 ? 1 : 0, ["km"] = s.Km, ["fuel_l"] = s.FuelL, ["kmpl"] = eff, ["bus_avg_kmpl"] = busAvg,
                ["vs_bus_avg_pct"] = eff is not null && busAvg > 0 ? R1((eff.Value / busAvg.Value - 1) * 100) : null,
                ["other_crew"] = string.Join(", ", crew.Where(x => (long)x["id"]! != st.Id).Select(x => S(x, "name"))), ["schedule_id"] = s.Id,
            });
        }
        rows = rows.OrderBy(x => S(x, "date"), StringComparer.Ordinal).ThenBy(x => S(x, "dep"), StringComparer.Ordinal).ToList();
        var daily = rows.GroupBy(x => S(x, "date")).Select(g =>
        {
            var worked = g.Count(x => S(x, "status") == "Worked");
            return new Row { ["date"] = g.Key, ["trips"] = g.Count(), ["worked"] = worked, ["halts"] = g.Count() - worked, ["status"] = worked > 0 ? "Worked" : "Halt", ["km"] = R1(Sum(g, "km")), ["fuel_l"] = R1(Sum(g, "fuel_l")) };
        }).ToList();
        var paired = rows.Where(x => D(x, "km") > 0 && D(x, "fuel_l") > 0).ToList();
        var summary = new Row
        {
            ["trips"] = rows.Count(x => S(x, "status") == "Worked"), ["working_days"] = daily.Count(x => (int)x["worked"]! > 0), ["halt_days"] = daily.Count(x => (int)x["worked"]! == 0 && (int)x["halts"]! > 0),
            ["km"] = R1(Sum(rows, "km")), ["fuel_l"] = R1(Sum(rows, "fuel_l")), ["mileage"] = Sum(paired, "fuel_l") > 0 ? R(Sum(paired, "km") / Sum(paired, "fuel_l")) : null,
            ["late_pickups"] = rows.Count(x => x["late"] is 1), ["trips_turned_off"] = rows.Count(x => S(x, "status") == "Halt"),
        };
        var totals = new Row
        {
            ["rows"] = new Row { ["date"] = rows.Count + " assigned", ["km"] = summary["km"], ["fuel_l"] = summary["fuel_l"] },
            ["daily"] = new Row { ["date"] = daily.Count + " days", ["trips"] = ISum(daily, "trips"), ["km"] = summary["km"], ["fuel_l"] = summary["fuel_l"] },
        };
        var o = Output(c, summary, new Row { ["rows"] = rows, ["daily"] = daily }, totals,
            "Assigned trip = passenger bus service with staff/driver on its crew roster. Halt day only if all assigned trips were off. Actual pickup/drop fields show dash when no timestamp exists. Late at 8+ minutes where measured; bus average uses the selected period.");
        o["staff"] = new Row { ["id"] = st.Id, ["name"] = st.Name, ["role"] = st.Role, ["phone"] = st.Phone };
        return o;
    }

    // ------------------------------------------------------------------ v21: metro / van feeder legs
    private static string LegType(RouteStage? st)
    {
        if (st is null) return "";
        var declared = (st.PickupType ?? "").ToLowerInvariant().Trim();
        if (declared != "") return declared;
        var label = Regex.Replace((st.Name ?? "").ToLowerInvariant(), @"\s+", " ");
        if (Regex.IsMatch(label, @"\bfree\s+metro\s+(?:pickup|drop)\b|\(\s*metro\s+(?:pickup|drop)\s*\)", RegexOptions.IgnoreCase)) return "metro";
        if (Regex.IsMatch(label, @"\(\s*(?:pickup\s+van|van\s+(?:pickup|drop))\s*\)", RegexOptions.IgnoreCase)) return "van";
        return "";
    }

    private Row Feeder(Ctx c, string type)
    {
        // No metro ticket-billing records exist in this tenant's data, so billed legs come only from such evidence when it exists (none) — never presumed.
        var rows = new List<Row>();
        foreach (var b in c.Bookings)
        {
            var r = Route(c, b.RouteId); var s = c.SchById.GetValueOrDefault(b.SchId); var bs = Stage(r, b.BoardingId); var ds = Stage(r, b.DroppingId);
            var pick = LegType(bs).Contains(type); var drop = LegType(ds).Contains(type);
            if (!pick && !drop) continue;
            var confirmed = b.Status == "confirmed" && PaxCount(b) > 0;
            if (!confirmed) continue;
            if ((c.Mode == "pickup" && !pick) || (c.Mode == "drop" && !drop)) continue;
            var legPick = pick && c.Mode != "drop"; var legDrop = drop && c.Mode != "pickup";
            rows.Add(new Row
            {
                ["date"] = b.Date, ["service"] = r.Service, ["bus"] = Vehi(c, s), ["pnr"] = b.Pnr, ["source"] = b.Source,
                ["leg"] = legPick && legDrop ? "Pickup + Drop" : legPick ? "Pickup" : "Drop", ["pickup"] = legPick, ["drop"] = legDrop,
                ["boarding"] = StageName(r, b.BoardingId, "—"), ["dropping"] = StageName(r, b.DroppingId, "—"),
                ["exchange_point"] = bs?.ExchangePoint is { Length: > 0 } e1 ? e1 : ds?.ExchangePoint is { Length: > 0 } e2 ? e2 : null, ["seats"] = PaxCount(b),
                ["metro_pax"] = null, ["metro_fare"] = null, ["metro_billed"] = false, ["billed_legs"] = 0, ["billing_status"] = type == "metro" ? "Not billed" : "—",
                ["van"] = null, ["amount"] = b.Total, ["type"] = type == "metro" ? "Metro" : "Van", ["charged_after_cancellation"] = false,
            });
        }
        rows = rows.OrderBy(x => S(x, "date"), StringComparer.Ordinal).ThenBy(x => S(x, "service"), Comparer<string>.Create(LC)).ThenBy(x => S(x, "pnr"), Comparer<string>.Create(LC)).ToList();
        var picked = rows.Where(x => (bool)x["pickup"]!).ToList(); var dropped = rows.Where(x => (bool)x["drop"]!).ToList();
        List<Row> ByPoint(List<Row> items, string key) => items.GroupBy(x => S(x, key)).Select(g => new Row { ["point"] = g.Key, ["pnrs"] = g.Count(), ["seats"] = ISum(g, "seats"), ["revenue"] = R(Sum(g, "amount")) })
            .OrderByDescending(x => D(x, "seats")).ThenByDescending(x => D(x, "pnrs")).ToList();
        var pp = ByPoint(picked, "boarding"); var dp = ByPoint(dropped, "dropping");
        var daily = rows.GroupBy(x => S(x, "date")).Select(g => new Row { ["date"] = g.Key, ["pnrs"] = g.Count(), ["seats"] = ISum(g, "seats"), ["revenue"] = R(Sum(g, "amount")) }).OrderBy(x => S(x, "date"), StringComparer.Ordinal).ToList();
        var seats = ISum(rows, "seats"); var revenue = R(Sum(rows, "amount"));
        var summary = new Row();
        if (type == "metro") summary["metro_pnrs"] = rows.Count; else summary["van_pnrs"] = rows.Count;
        summary["seats"] = seats; summary["revenue"] = revenue; summary["with_pickup"] = picked.Count; summary["with_drop"] = dropped.Count; summary["both_legs"] = rows.Count(x => (bool)x["pickup"]! && (bool)x["drop"]!);
        if (type == "metro") { summary["billed_metro_legs"] = 0; summary["metro_pax"] = 0; summary["metro_fare"] = 0m; summary["charged_after_cancellation"] = 0; }
        else { summary["vans_used"] = 0; summary["pnrs_without_van"] = rows.Count; }
        var totals = new Row
        {
            ["pickup_points"] = new Row { ["point"] = pp.Count + " points", ["pnrs"] = ISum(pp, "pnrs"), ["seats"] = ISum(pp, "seats"), ["revenue"] = R(Sum(pp, "revenue")) },
            ["drop_points"] = new Row { ["point"] = dp.Count + " points", ["pnrs"] = ISum(dp, "pnrs"), ["seats"] = ISum(dp, "seats"), ["revenue"] = R(Sum(dp, "revenue")) },
            ["daily"] = new Row { ["date"] = daily.Count + " days", ["pnrs"] = rows.Count, ["seats"] = seats, ["revenue"] = revenue },
            ["rows"] = new Row { ["date"] = rows.Count + " PNRs", ["seats"] = seats, ["metro_pax"] = 0, ["metro_fare"] = 0m, ["amount"] = revenue },
        };
        return Output(c, summary, new Row { ["pickup_points"] = pp, ["drop_points"] = dp, ["daily"] = daily, ["rows"] = rows }, totals,
            type == "metro" ? "Metro stages are identified by explicit feeder markers or ticket-billing evidence. Each PNR counts once in Pickup + Drop; billed pickup and drop count as two charged legs. Fare/pax require linked or billed ticket evidence, including cancellations after ticket billing."
                : "Pickup Van stages require declared feeder type or explicit Pickup Van marker; a PNR counts once for both legs, and only assigned vans are shown.");
    }

    // ------------------------------------------------------------------ v22 helpers
    private static decimal Money(Bk b)
    {
        var denom = b.Pax.Sum(p => p.Fare);
        return R(denom > 0 ? b.Total * b.Pax.Where(p => p.Status != "cancelled").Sum(p => p.Fare) / denom : b.Total * PaxCount(b) / Math.Max(b.Pax.Count, 1));
    }
    private static bool Live(Bk b) => b.Status == "confirmed" && PaxCount(b) > 0;
    private static string Norm(string? s) => Regex.Replace((s ?? "").ToLowerInvariant(), @"\s+", "").Trim();

    private Row Frequent(Ctx c)
    {
        var map = new Dictionary<string, Row>(); var chans = new Dictionary<string, HashSet<string>>(); var order = new List<string>();
        foreach (var b in c.Bookings)
        {
            var phone = b.Phone.Trim(); if (phone == "") continue;
            if (!map.TryGetValue(phone, out var x))
            {
                map[phone] = x = new Row { ["phone"] = phone, ["passenger"] = b.Name, ["email"] = b.Email, ["trips"] = 0, ["travelled"] = 0, ["upcoming"] = 0, ["seats"] = 0, ["spend"] = 0m,
                    ["cancelled"] = 0, ["first_trip"] = null, ["last_trip"] = null };
                chans[phone] = []; order.Add(phone);
            }
            if (b.Cx.Count > 0) x["cancelled"] = (int)x["cancelled"]! + 1;
            if (!Live(b)) continue;
            x["trips"] = (int)x["trips"]! + 1; x["seats"] = (int)x["seats"]! + PaxCount(b); x["spend"] = D(x, "spend") + Money(b); chans[phone].Add(b.Source is { Length: > 0 } src ? src : "Unknown");
            var trip = c.SchById.GetValueOrDefault(b.SchId);
            if (Ord(b.Date, c.Today) > 0 && trip?.TripStatus != "completed") x["upcoming"] = (int)x["upcoming"]! + 1; else x["travelled"] = (int)x["travelled"]! + 1;
            if (x["first_trip"] is not string ft || Ord(b.Date, ft) < 0) x["first_trip"] = b.Date;
            if (x["last_trip"] is not string lt || Ord(b.Date, lt) > 0) x["last_trip"] = b.Date;
            if (S(x, "passenger") == "") x["passenger"] = b.Name;
            if (S(x, "email") == "") x["email"] = b.Email;
        }
        var all = order.Select(p => map[p]).Where(x => (int)x["trips"]! > 0).Select(x =>
        {
            var o = new Row(x) { ["spend"] = R(D(x, "spend")) };
            o["avg_trip"] = (int)x["trips"]! > 0 ? R(D(x, "spend") / (int)x["trips"]!) : 0m;
            o["channels"] = string.Join(", ", chans[S(x, "phone")].OrderBy(s => s, Comparer<string>.Create(Ord)));
            return o;
        }).ToList();
        var tripCount = ISum(all, "trips");
        (int lo, int hi, string label)[] bandsDef = [(1, 1, "1 trip"), (2, 2, "2 trips"), (3, 5, "3–5 trips"), (6, 10, "6–10 trips"), (11, 20, "11–20 trips"), (21, int.MaxValue, "21+ trips")];
        var bands = bandsDef.Select(bd =>
        {
            var a = all.Where(x => (int)x["trips"]! >= bd.lo && (int)x["trips"]! <= bd.hi).ToList(); var taken = ISum(a, "trips");
            return new Row { ["band"] = bd.label, ["passengers"] = a.Count, ["share_pct"] = all.Count > 0 ? R(a.Count / (decimal)all.Count * 100) : 0m, ["trips_taken"] = taken,
                ["share_of_trips"] = tripCount > 0 ? R(taken / (decimal)tripCount * 100) : 0m, ["spend"] = R(Sum(a, "spend")) };
        }).ToList();
        var q = c.Search.ToLowerInvariant();
        IEnumerable<Row> qual = all.Where(x => (int)x["trips"]! >= c.MinTrips && (c.MaxTrips is null || (int)x["trips"]! <= c.MaxTrips) && (q == "" || $"{S(x, "passenger")} {S(x, "phone")}".ToLowerInvariant().Contains(q)));
        qual = c.Sort switch
        {
            "spend" => qual.OrderByDescending(x => D(x, "spend")).ThenByDescending(x => D(x, "trips")),
            "recent" => qual.OrderByDescending(x => S(x, "last_trip"), StringComparer.Ordinal).ThenByDescending(x => D(x, "trips")),
            _ => qual.OrderByDescending(x => D(x, "trips")).ThenByDescending(x => D(x, "spend")),
        };
        var qualified = qual.ToList();
        var rows = (c.Top == "all" ? qualified : qualified.Take(int.Parse(c.Top))).Select((x, i) => new Row(x) { ["rank"] = i + 1 }).ToList();
        var qTrips = ISum(qualified, "trips"); var qSpend = R(Sum(qualified, "spend"));
        var summary = new Row
        {
            ["passengers_label"] = IN(qualified.Count) + " of " + IN(all.Count), ["passengers"] = qualified.Count, ["all_passengers"] = all.Count, ["trips"] = qTrips, ["spend"] = qSpend,
            ["avg_trip"] = qTrips > 0 ? R(Sum(qualified, "spend") / qTrips) : 0m, ["upcoming"] = ISum(qualified, "upcoming"), ["cancelled"] = ISum(qualified, "cancelled"), ["shown"] = rows.Count,
            ["total_trips"] = tripCount, ["total_spend"] = R(Sum(all, "spend")),
        };
        var totals = new Row
        {
            ["rows"] = new Row { ["rank"] = "Total", ["passenger"] = rows.Count + " passengers", ["trips"] = ISum(rows, "trips"), ["travelled"] = ISum(rows, "travelled"), ["upcoming"] = ISum(rows, "upcoming"),
                ["seats"] = ISum(rows, "seats"), ["spend"] = R(Sum(rows, "spend")), ["cancelled"] = ISum(rows, "cancelled") },
            ["bands"] = new Row { ["band"] = "Total", ["passengers"] = all.Count, ["trips_taken"] = tripCount, ["spend"] = R(Sum(all, "spend")) },
        };
        var desc = (c.MaxTrips is null ? $"{c.MinTrips}+" : $"{c.MinTrips}–{c.MaxTrips}") + " trips · ranked by " + (c.Sort switch { "spend" => "top spend", "recent" => "recent", _ => "most trips" }) + " · " + (c.Top == "all" ? "all" : "top " + c.Top);
        return Output22(c, summary, new Row { ["rows"] = rows, ["bands"] = bands }, totals,
            "Trips = confirmed/completed bookings in the selected period across all channels including imported bookings, grouped by contact phone. Passenger cohorts are independent of the Top N table. Spend is the retained fare of booked seats.",
            new Row { ["pdf_context"] = new[] { new[] { "Trips:", desc } }, ["report_options"] = new Row { ["sort"] = c.Sort, ["top"] = c.Top, ["min_trips"] = c.MinTrips, ["max_trips"] = c.MaxTrips } });
    }

    private Row Point(Ctx c)
    {
        var kind = c.Mode == "pickup" ? "pickup" : "drop";
        var tz = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");
        var map = new Dictionary<string, (Row x, HashSet<long> booked, HashSet<long> serving, int onTime, int gps, int bookings, int seats, decimal amount, int cancelled, int noShows)>();
        var order = new List<string>(); var allRows = new List<Row>();
        string? Put(string raw)
        {
            var key = Norm(raw); if (key == "") return null;
            if (!map.ContainsKey(key)) { map[key] = (new Row { ["key"] = key, ["point"] = raw }, [], [], 0, 0, 0, 0, 0m, 0, 0); order.Add(key); }
            return key;
        }
        foreach (var s in c.Schedules.Where(s => s.Status == "active"))
        {
            var r = Route(c, s.RouteId);
            foreach (var st in r.Stages.Where(x => x.Kind == kind))
            {
                var k = Put(st.Name); if (k is null) continue;
                var e = map[k]; e.serving.Add(s.Id);
                var ev = Prop(s.Stops, st.Id.ToString());
                var am = ClockMinutes(TStr(ev, "actual_arrival", "arrived_at", "actual_time"), tz); var sm = st.Time.Hour * 60 + st.Time.Minute;
                if (am is { } a) { e.gps++; var diff = ((a - sm + 720) % 1440 + 1440) % 1440 - 720; if (Math.Abs(diff) <= 8) e.onTime++; }
                map[k] = e;
            }
        }
        foreach (var b in c.Bookings)
        {
            var r = Route(c, b.RouteId); var st = Stage(r, kind == "pickup" ? b.BoardingId : b.DroppingId);
            if (st?.Kind != kind) continue;
            var k = Put(st.Name); if (k is null) continue;
            var e = map[k];
            var sold = Live(b); var v = sold ? PaxCount(b) : 0; var amount = sold ? Money(b) : 0;
            var ns = b.Pax.Count(p => p.Status == "no_show");
            if (sold) { e.bookings++; e.seats += v; e.amount += amount; e.booked.Add(b.SchId); }
            if (b.Cx.Count > 0) e.cancelled++;
            e.noShows += ns;
            map[k] = e;
            allRows.Add(new Row { ["date"] = b.Date, ["point"] = e.x["point"], ["point_key"] = k, ["schedule_id"] = b.SchId, ["service"] = r.Service, ["source"] = b.Source,
                ["bookings"] = sold ? 1 : 0, ["seats"] = v, ["amount"] = amount, ["cancelled"] = b.Cx.Count > 0 ? 1 : 0, ["no_shows"] = ns });
        }
        var eligible = order.Select(k => map[k]).Where(x => x.seats > 0).OrderByDescending(x => x.seats).ThenByDescending(x => x.bookings).ThenBy(x => S(x.x, "point"), Comparer<string>.Create(LC)).ToList();
        var allSeats = eligible.Sum(x => x.seats);
        var ranking = eligible.Select((x, i) => new Row
        {
            ["rank"] = i + 1, ["point"] = x.x["point"], ["point_key"] = x.x["key"], ["pnrs"] = x.bookings, ["seats"] = x.seats, ["share_pct"] = allSeats > 0 ? R(x.seats / (decimal)allSeats * 100) : 0m,
            ["trips_booked"] = x.booked.Count, ["seats_per_trip"] = x.booked.Count > 0 ? R1(x.seats / (decimal)x.booked.Count) : 0m, ["revenue"] = R(x.amount), ["trips_serving"] = x.serving.Count,
            ["cancelled"] = x.cancelled, ["no_shows"] = x.noShows, ["on_time"] = x.gps > 0 ? R(x.onTime / (decimal)x.gps * 100) : null, ["gps_count"] = x.gps,
        }).ToList();
        var choices = order.Select(k => map[k].x).OrderBy(x => S(x, "point"), Comparer<string>.Create(LC)).Select(x => new Row { ["key"] = x["key"], ["point"] = x["point"] }).ToList();
        var selKey = Norm(c.SelectedPoint);
        var hasSel = map.TryGetValue(selKey, out var sv);
        Row? target = hasSel ? ranking.FirstOrDefault(x => S(x, "point_key") == S(sv.x, "key")) ?? new Row
        {
            ["rank"] = null, ["point"] = sv.x["point"], ["point_key"] = sv.x["key"], ["pnrs"] = 0, ["seats"] = 0, ["share_pct"] = 0, ["trips_booked"] = 0, ["seats_per_trip"] = 0,
            ["revenue"] = 0, ["trips_serving"] = sv.serving.Count, ["cancelled"] = sv.cancelled, ["no_shows"] = sv.noShows, ["on_time"] = null, ["gps_count"] = 0,
        } : null;
        var selRows = hasSel ? allRows.Where(x => S(x, "point_key") == S(sv.x, "key")).ToList() : [];
        var byService = selRows.GroupBy(x => S(x, "service")).Select(g =>
        {
            var trips = g.Where(x => (int)x["bookings"]! > 0).Select(x => x["schedule_id"]).Distinct().Count();
            return new Row { ["service"] = g.Key, ["pnrs"] = ISum(g, "bookings"), ["seats"] = ISum(g, "seats"), ["revenue"] = R(Sum(g, "amount")), ["trips_booked"] = trips,
                ["seats_per_trip"] = trips > 0 ? R1(ISum(g, "seats") / (decimal)trips) : 0m };
        }).OrderByDescending(x => D(x, "seats")).ToList();
        var bySource = selRows.GroupBy(x => S(x, "source")).Select(g => new Row { ["source"] = g.Key, ["pnrs"] = ISum(g, "bookings"), ["seats"] = ISum(g, "seats"), ["revenue"] = R(Sum(g, "amount")) })
            .OrderByDescending(x => D(x, "seats")).ToList();
        var daily = selRows.GroupBy(x => S(x, "date")).Select(g => new Row { ["date"] = g.Key, ["pnrs"] = ISum(g, "bookings"), ["seats"] = ISum(g, "seats"), ["revenue"] = R(Sum(g, "amount")),
            ["cancelled"] = ISum(g, "cancelled"), ["no_shows"] = ISum(g, "no_shows") }).OrderBy(x => S(x, "date"), StringComparer.Ordinal).ToList();
        Row summary;
        if (target is not null)
        {
            summary = new Row(target) { ["point_name"] = target["point"], ["rank_label"] = target["rank"] is int rk ? rk + " of " + ranking.Count : "—" };
            var pn = (int)D(target, "pnrs"); var cn = (int)D(target, "cancelled"); var seats = D(target, "seats");
            summary["cancellation_pct"] = pn + cn > 0 ? R(cn / (decimal)(pn + cn) * 100) : 0m;
            summary["no_show_pct"] = seats > 0 ? R(D(target, "no_shows") / seats * 100) : 0m;
        }
        else summary = new Row { ["points"] = ranking.Count };
        var totals = new Row
        {
            ["ranking"] = new Row { ["rank"] = "Total", ["point"] = ranking.Count + " points", ["pnrs"] = ISum(ranking, "pnrs"), ["seats"] = allSeats, ["revenue"] = R(Sum(ranking, "revenue")) },
            ["by_service"] = new Row { ["service"] = byService.Count + " schedules", ["pnrs"] = ISum(byService, "pnrs"), ["seats"] = ISum(byService, "seats"), ["revenue"] = R(Sum(byService, "revenue")) },
            ["by_source"] = new Row { ["source"] = bySource.Count + " sources", ["pnrs"] = ISum(bySource, "pnrs"), ["seats"] = ISum(bySource, "seats"), ["revenue"] = R(Sum(bySource, "revenue")) },
            ["daily"] = new Row { ["date"] = daily.Count + " days", ["pnrs"] = ISum(daily, "pnrs"), ["seats"] = ISum(daily, "seats"), ["revenue"] = R(Sum(daily, "revenue")) },
        };
        return Output22(c, summary, new Row { ["ranking"] = ranking, ["by_service"] = byService, ["by_source"] = bySource, ["daily"] = daily }, totals,
            "PNRs from every source (OTAs included), by travel date. Point names match ignoring case and spaces. Confirmed/completed are sold. Cancelled and no-shows use recorded events. Trips serving = running trips with a scheduled stop here; on time uses recorded GPS stop stamps within ±8 minutes; unrecorded stops are excluded.",
            new Row { ["points"] = choices, ["selected_point"] = target, ["mode"] = c.Mode,
                ["pdf_context"] = new[] { new[] { "Point:", target is null ? "No point selected" : S(target, "point") }, new[] { "Type:", c.Mode == "pickup" ? "Pickup" : "Drop" } } });
    }

    private Row Station(Ctx c)
    {
        var running = c.Schedules.Where(s => s.Status == "active").ToList(); var confirmed = c.Bookings.Where(Live).ToList();
        int CityOrder(Rt r, long id) => r.Cities.IndexOf(id);
        bool Serves(Sch s, long from, long to) { var r = Route(c, s.RouteId); var a = CityOrder(r, from); var b = CityOrder(r, to); return a < b && a >= 0 && b >= 0; }
        string PK(Bk b) => b.FromCity + "|" + b.ToCity;
        var cancelMap = c.Bookings.Where(b => b.Cx.Count > 0).GroupBy(PK).ToDictionary(g => g.Key, g => g.Count());
        var noMap = c.Bookings.GroupBy(PK).ToDictionary(g => g.Key, g => g.Sum(b => b.Pax.Count(p => p.Status == "no_show")));
        var seatsTotal = confirmed.Sum(PaxCount); var pnrs = confirmed.Count; var revenue = R(confirmed.Sum(Money));
        decimal Pct(decimal a) => seatsTotal > 0 ? R(a / seatsTotal * 100) : 0m;
        var pairs = confirmed.Where(b => c.SchById.ContainsKey(b.SchId)).GroupBy(PK).Select(g =>
        {
            var f = g.First(); var seats = g.Sum(PaxCount); var rev = g.Sum(Money);
            var serving = running.Count(s => Serves(s, f.FromCity, f.ToCity));
            return new Row
            {
                ["from"] = City(c, f.FromCity), ["to"] = City(c, f.ToCity), ["pnrs"] = g.Count(), ["seats"] = seats, ["share_pct"] = Pct(seats), ["avg_fare"] = seats > 0 ? R(rev / seats) : 0m,
                ["revenue"] = R(rev), ["trips_serving"] = serving, ["trips_booked"] = g.Select(b => b.SchId).Distinct().Count(), ["seats_per_trip"] = serving > 0 ? R1(seats / (decimal)serving) : 0m,
                ["cancelled"] = cancelMap.GetValueOrDefault(g.Key), ["no_shows"] = noMap.GetValueOrDefault(g.Key), ["schedules"] = g.Select(b => b.RouteId).Distinct().Count(),
            };
        }).OrderByDescending(x => D(x, "seats")).ThenByDescending(x => D(x, "revenue")).ToList();
        List<Row> StationAgg(bool isFrom) => confirmed.GroupBy(b => isFrom ? b.FromCity : b.ToCity).Select(g =>
        {
            var seats = g.Sum(PaxCount); var rev = g.Sum(Money);
            var other = g.GroupBy(b => City(c, isFrom ? b.ToCity : b.FromCity)).Select(o => (name: o.Key, n: o.Sum(PaxCount))).OrderByDescending(o => o.n).FirstOrDefault();
            return new Row { ["station"] = City(c, g.Key), ["pnrs"] = g.Count(), ["seats"] = seats, ["revenue"] = R(rev), ["share_pct"] = Pct(seats), ["avg_fare"] = seats > 0 ? R(rev / seats) : 0m, ["top_station"] = other.name ?? "" };
        }).OrderByDescending(x => D(x, "seats")).ToList();
        var boarding = StationAgg(true); var dropping = StationAgg(false);
        bool EndToEnd(Bk b) { var r = Route(c, b.RouteId); return b.FromCity == r.Origin && b.ToCity == r.Dest; }
        var bySchedule = running.GroupBy(s => s.RouteId).Select(g =>
        {
            var r = Route(c, g.Key); var records = confirmed.Where(b => b.RouteId == g.Key).ToList(); var seats = records.Sum(PaxCount); var spent = records.Sum(Money);
            var byPairs = records.GroupBy(PK).Select(p => (pair: City(c, p.First().FromCity) + " → " + City(c, p.First().ToCity), n: p.Sum(PaxCount))).ToList();
            var best = byPairs.OrderByDescending(p => p.n).FirstOrDefault();
            var endSeats = records.Where(EndToEnd).Sum(PaxCount); var trips = g.Count();
            return new Row
            {
                ["service"] = r.Service, ["route"] = City(c, r.Origin) + " → " + City(c, r.Dest), ["dep"] = r.Dep, ["trips"] = trips, ["pnrs"] = records.Count, ["seats"] = seats,
                ["seats_per_trip"] = trips > 0 ? R1(seats / (decimal)trips) : 0m, ["avg_fare"] = seats > 0 ? R(spent / seats) : 0m, ["revenue"] = R(spent), ["pairs"] = byPairs.Count,
                ["top_pair"] = best.pair ?? "", ["end_to_end_pct"] = seats > 0 ? R(endSeats / (decimal)seats * 100) : 0m, ["route_id"] = r.Id,
            };
        }).OrderByDescending(x => D(x, "revenue")).ToList();
        var bySchedulePairs = confirmed.GroupBy(b => b.RouteId + "|" + PK(b)).Select(g =>
        {
            var f = g.First(); var seats = g.Sum(PaxCount); var rev = g.Sum(Money);
            var serving = running.Count(s => s.RouteId == f.RouteId && Serves(s, f.FromCity, f.ToCity));
            var same = c.Bookings.Where(b => b.RouteId == f.RouteId && b.FromCity == f.FromCity && b.ToCity == f.ToCity).ToList();
            return new Row
            {
                ["route_id"] = f.RouteId, ["service"] = Route(c, f.RouteId).Service, ["from"] = City(c, f.FromCity), ["to"] = City(c, f.ToCity), ["pnrs"] = g.Count(), ["seats"] = seats,
                ["revenue"] = R(rev), ["avg_fare"] = seats > 0 ? R(rev / seats) : 0m, ["trips_serving"] = serving, ["trips_booked"] = g.Select(b => b.SchId).Distinct().Count(),
                ["seats_per_trip"] = serving > 0 ? R1(seats / (decimal)serving) : 0m, ["cancelled"] = same.Count(b => b.Cx.Count > 0), ["no_shows"] = same.Sum(b => b.Pax.Count(p => p.Status == "no_show")),
            };
        }).OrderBy(x => S(x, "from"), Comparer<string>.Create(LC)).ThenBy(x => S(x, "to"), Comparer<string>.Create(LC)).ThenBy(x => S(x, "service"), Comparer<string>.Create(LC)).ToList();
        var sources = confirmed.GroupBy(b => b.Source is { Length: > 0 } s ? s : "Unknown").Select(g =>
        {
            var seats = g.Sum(PaxCount); var rev = g.Sum(Money);
            return new Row { ["source"] = g.Key, ["pnrs"] = g.Count(), ["seats"] = seats, ["revenue"] = R(rev), ["share_pct"] = Pct(seats), ["avg_fare"] = seats > 0 ? R(rev / seats) : 0m };
        }).OrderByDescending(x => D(x, "seats")).ToList();
        string[] dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        var daily = DateRange(c.From, c.To).Select(date =>
        {
            var bs = confirmed.Where(b => b.Date == date).ToList();
            return new Row
            {
                ["date"] = date, ["day"] = dows[(int)DateOnly.ParseExact(date, "yyyy-MM-dd").DayOfWeek], ["trips"] = running.Count(s => s.Date == date), ["pnrs"] = bs.Count, ["seats"] = bs.Sum(PaxCount),
                ["end_to_end"] = bs.Where(EndToEnd).Sum(PaxCount), ["revenue"] = R(bs.Sum(Money)), ["cancelled"] = c.Bookings.Count(b => b.Date == date && b.Cx.Count > 0),
            };
        }).ToList();
        var endToEnd = confirmed.Where(EndToEnd).Sum(PaxCount);
        var cancelled = c.Bookings.Count(b => b.Cx.Count > 0);
        var noShows = c.Bookings.Sum(b => b.Pax.Count(p => p.Status == "no_show"));
        var summary = new Row
        {
            ["seats"] = seatsTotal, ["pnrs"] = pnrs, ["revenue"] = revenue, ["avg_fare"] = seatsTotal > 0 ? R(revenue / seatsTotal) : 0m, ["station_pairs"] = pairs.Count,
            ["stations"] = boarding.Select(x => S(x, "station")).Concat(dropping.Select(x => S(x, "station"))).Where(x => x != "").Distinct().Count(),
            ["trips"] = running.Count, ["schedules"] = bySchedule.Count, ["seats_per_trip"] = running.Count > 0 ? R1(seatsTotal / (decimal)running.Count) : 0m,
            ["end_to_end"] = endToEnd, ["end_to_end_pct"] = Pct(endToEnd), ["cancelled"] = cancelled, ["cancelled_pct"] = pnrs + cancelled > 0 ? R(cancelled / (decimal)(pnrs + cancelled) * 100) : 0m,
            ["no_shows"] = noShows, ["no_show_pct"] = Pct(noShows),
        };
        summary["end_to_end_label"] = IN(endToEnd) + " (" + D(summary, "end_to_end_pct").ToString("0.0", CultureInfo.InvariantCulture) + "%)";
        summary["cancelled_label"] = IN(cancelled) + " (" + D(summary, "cancelled_pct").ToString("0.0", CultureInfo.InvariantCulture) + "%)";
        summary["no_show_label"] = IN(noShows) + " (" + D(summary, "no_show_pct").ToString("0.0", CultureInfo.InvariantCulture) + "%)";
        var sections = new Row { ["pairs"] = pairs, ["boarding"] = boarding, ["dropping"] = dropping, ["by_schedule"] = bySchedule, ["by_schedule_pairs"] = bySchedulePairs, ["sources"] = sources, ["daily"] = daily };
        var totals = new Row();
        foreach (var (key, v) in sections)
        {
            var rows = (List<Row>)v!; var t = new Row();
            foreach (var k in new[] { "pnrs", "seats", "revenue", "cancelled", "no_shows", "end_to_end", "trips" }) t[k] = R(Sum(rows, k));
            var (label, text) = key switch
            {
                "pairs" => ("from", pairs.Count + " pairs"), "boarding" or "dropping" => ("station", rows.Count + " stations"), "by_schedule" => ("service", rows.Count + " schedules"),
                "by_schedule_pairs" => ("service", rows.Count + " pairs"), "sources" => ("source", rows.Count + " sources"), _ => ("date", rows.Count + " days"),
            };
            t[label] = text; totals[key] = t;
        }
        return Output22(c, summary, sections, totals,
            "All booking sources, by travel date. Station = stop city. Trips serving = running trips stopping at both cities in route order. End-to-end = schedule origin to destination. Cancelled = confirmed PNR subsequently cancelled; no-shows = seats marked no-show.",
            new Row { ["pdf_context"] = new[] { new[] { "Schedule:", c.ScheduleId is { } sid ? Route(c, sid).Service : "All schedules" } } });
    }

    private Row TripPnlReport(Ctx c)
    {
        var raw = c.Schedules.Select(s =>
        {
            var r = Route(c, s.RouteId); var p = TripPnl(c, s); var running = s.Status == "active";
            var net = R(p.Net); var expense = R(p.Expense);
            return new Row
            {
                ["date"] = s.Date, ["dep"] = s.Dep, ["service"] = r.Service, ["route"] = City(c, r.Origin) + " → " + City(c, r.Dest),
                ["bus"] = running ? (s.VehicleId is { } v && c.Veh.GetValueOrDefault(v) is { } veh ? veh.RegistrationNumber : "Unassigned") : "Turned off", ["running"] = running,
                ["seats_label"] = running ? p.Seats + "/" + p.Capacity : "—", ["occupancy_pct"] = running && p.Capacity > 0 ? R(p.Seats / (decimal)p.Capacity * 100) : null,
                ["net_sales"] = net, ["expense"] = expense, ["profit"] = R(net - expense), ["seats"] = running ? p.Seats : 0, ["capacity"] = running ? p.Capacity : 0,
            };
        }).OrderBy(x => S(x, "date"), StringComparer.Ordinal).ThenBy(x => S(x, "dep"), StringComparer.Ordinal).ToList();
        var run = raw.Where(x => (bool)x["running"]!).ToList(); var seats = ISum(run, "seats"); var cap = ISum(run, "capacity");
        var summary = new Row
        {
            ["trips"] = run.Count, ["occupancy_pct"] = cap > 0 ? R(seats / (decimal)cap * 100) : 0m, ["net_sales"] = R(Sum(raw, "net_sales")), ["expense"] = R(Sum(raw, "expense")),
            ["profit"] = R(Sum(raw, "profit")), ["loss_trips"] = raw.Count(x => D(x, "profit") < 0), ["all_trips"] = raw.Count,
        };
        var totals = new Row { ["rows"] = new Row { ["date"] = raw.Count + " trips", ["seats_label"] = seats + "/" + cap, ["occupancy_pct"] = summary["occupancy_pct"],
            ["net_sales"] = summary["net_sales"], ["expense"] = summary["expense"], ["profit"] = summary["profit"] } };
        return Output22(c, summary, new Row { ["rows"] = raw }, totals,
            "Net sales = retained confirmed ticket sales after offers and GST (as in Sales). A turned-off trip carries fixed costs only; profit here = net sales − expenses. Cancellation charges are excluded from this particular P&L report.");
    }

    // ------------------------------------------------------------------ fleet operations (v20)
    private static bool IsMain(Vehicle? v) => v is not null && (v.VehicleRole is null or "main" or "main_bus");
    private static bool IsTemp(Vehicle? v) => (v?.OwnershipType ?? "").ToLowerInvariant() is "temporary" or "attached" or "leased";
    private static decimal? Ratio(decimal km, decimal fuel) => fuel > 0 ? R(km / fuel) : null;

    private Row Fleet(Ctx c)
    {
        var days = DateRange(c.From, c.To).ToList();
        var vehicles = c.Veh.Values.OrderBy(v => v.Id).ToList();
        var filtered = c.AllSchedules.Where(s => (c.BusId is null || s.VehicleId == c.BusId) && (c.StaffId is null || s.Crew.Any(x => x.Id == c.StaffId))).ToList();
        var disabled = filtered.Where(s => s.Status != "active").ToList();
        var active = filtered.Where(s => s.Status == "active").OrderBy(s => s.Date, StringComparer.Ordinal).ThenBy(s => s.Dep, StringComparer.Ordinal).ThenBy(s => s.Id).ToList();
        List<Row> CrewInfo(Sch s, bool drivers) => CrewOf(c, s).Where(x => Regex.IsMatch(S(x, "role"), "driver", RegexOptions.IgnoreCase) == drivers).ToList();
        decimal? KmOf(Sch s) => s.Km ?? TNum(s.Tel, "km", "distance_km");
        decimal? FuelOf(Sch s) => s.FuelL ?? TNum(s.Tel, "fuel_l", "fuel_consumed_l");
        var rows = active.Select(s =>
        {
            var v = s.VehicleId is { } vid ? c.Veh.GetValueOrDefault(vid) : null; var r = Route(c, s.RouteId);
            var km = KmOf(s); var fuel = FuelOf(s);
            var lines = TripPnl(c, s).Items.Where(x => x.Type == "running" && Regex.IsMatch(x.Key + x.Label, "diesel|fuel", RegexOptions.IgnoreCase)).ToList();
            var dieselAmt = lines.Count == 0 ? 0m : R(lines.Sum(x => x.PerDay));
            var source = lines.Count == 0 ? "unavailable" : lines.Any(x => x.TelemetryDiesel) ? "telemetry" : lines.Any(x => x.Manual) ? "trip override" : "route fallback";
            return new Row
            {
                ["schedule_id"] = s.Id, ["date"] = s.Date, ["departure_time"] = s.Dep, ["service"] = r.Service, ["route"] = r.Id == 0 ? "—" : City(c, r.Origin) + " → " + City(c, r.Dest),
                ["vehicle_id"] = s.VehicleId, ["vehicle"] = v?.RegistrationNumber ?? "", ["vehicle_role"] = v?.VehicleRole ?? "",
                ["drivers"] = CrewInfo(s, true), ["crew"] = CrewInfo(s, false), ["km"] = km ?? 0, ["km_reported"] = km is > 0, ["km_route"] = R1(r.DistanceKm ?? 0),
                ["fuel_l"] = fuel ?? 0, ["fuel_reported"] = fuel is > 0, ["kmpl"] = km > 0 && fuel > 0 ? Ratio(km.Value, fuel.Value) : null, ["diesel"] = dieselAmt, ["diesel_source"] = source,
            };
        }).ToList();
        (decimal km, decimal fuel, decimal? kmpl) Pair(IEnumerable<Row> items)
        {
            decimal km = 0, fuel = 0;
            foreach (var r in items) if ((bool)r["km_reported"]! && (bool)r["fuel_reported"]!) { km += D(r, "km"); fuel += D(r, "fuel_l"); }
            return (R(km), R(fuel), Ratio(km, fuel));
        }
        long? Vid(Row r) => r["vehicle_id"] as long?;
        var members = rows.Select(Vid).Where(x => x is not null).Select(x => x!.Value).Distinct().ToList();
        var allMain = vehicles.Where(IsMain).ToList();
        var usedMain = rows.Where(r => Vid(r) is { } v && IsMain(c.Veh.GetValueOrDefault(v))).Select(r => S(r, "date") + "|" + Vid(r)).ToHashSet();
        bool Eligible(Vehicle v, string day) => !IsTemp(v) || usedMain.Contains(day + "|" + v.Id);
        List<Vehicle> FleetForDay(string day) => allMain.Where(v => (c.BusId is null || v.Id == c.BusId) && Eligible(v, day)).ToList();
        var allFleetBusDays = days.Sum(d => FleetForDay(d).Count);
        var tripsWithMain = rows.Count(r => Vid(r) is { } v && IsMain(c.Veh.GetValueOrDefault(v)));
        decimal? utilization = c.StaffId is not null ? null : allFleetBusDays > 0 ? R1(tripsWithMain / (decimal)allFleetBusDays * 100) : null;
        var busRows = vehicles.Where(v => c.BusId is null || v.Id == c.BusId).Where(v => c.StaffId is null || members.Contains(v.Id)).Where(v => IsMain(v) || rows.Any(r => Vid(r) == v.Id)).ToList();
        var byBus = busRows.Select(v =>
        {
            var own = rows.Where(r => Vid(r) == v.Id).ToList(); var ran = own.Select(r => S(r, "date")).Distinct().Count();
            var eligibleDays = IsMain(v) ? days.Count(d => Eligible(v, d)) : ran;
            var p = Pair(own); var km = Sum(own, "km"); var diesel = Sum(own, "diesel");
            return new Row
            {
                ["vehicle_id"] = v.Id, ["vehicle"] = v.RegistrationNumber, ["trips"] = own.Count, ["days_ran"] = ran, ["days_idle"] = Math.Max(0, eligibleDays - ran),
                ["util_pct"] = c.StaffId is not null ? null : eligibleDays > 0 ? R1(ran / (decimal)eligibleDays * 100) : null,
                ["km"] = R1(km), ["km_route"] = R1(Sum(own, "km_route")), ["fuel_l"] = R1(Sum(own, "fuel_l")), ["kmpl"] = p.kmpl, ["diesel"] = R(diesel), ["rs_per_km"] = km > 0 ? R(diesel / km) : null,
                ["drivers"] = string.Join(", ", own.SelectMany(r => ((List<Row>)r["drivers"]!).Select(d => S(d, "name"))).Where(x => x != "").Distinct().OrderBy(x => x, Comparer<string>.Create(LC))),
            };
        }).OrderBy(x => S(x, "vehicle"), Comparer<string>.Create(LC)).ToList();
        var baseByBus = new Dictionary<long, (decimal km, decimal fuel)>();
        foreach (var s in c.AllSchedules.Where(s => s.Status == "active"))
        {
            var km = KmOf(s); var f = FuelOf(s);
            if (!(km > 0 && f > 0) || s.VehicleId is null) continue;
            var b = baseByBus.GetValueOrDefault(s.VehicleId.Value); baseByBus[s.VehicleId.Value] = (b.km + km!.Value, b.fuel + f!.Value);
        }
        decimal? BusAvg(long? id) => id is { } i && baseByBus.TryGetValue(i, out var b) ? Ratio(b.km, b.fuel) : null;
        static decimal? Delta(decimal? actual, decimal? b) => actual is not null && b is > 0 ? R1((actual.Value / b.Value - 1) * 100) : null;
        var dData = new Dictionary<long, (Row d, int trips, HashSet<string> dates, HashSet<string> buses, List<Row> samples)>(); var dOrder = new List<long>();
        var byPair = new Dictionary<string, (Row d, long? vid, string vehicle, List<Row> samples)>(); var pOrder = new List<string>();
        foreach (var r in rows)
            foreach (var d in (List<Row>)r["drivers"]!)
            {
                var id = (long)d["id"]!;
                if (!dData.TryGetValue(id, out var a)) { a = (d, 0, [], [], []); dOrder.Add(id); }
                a.trips++; a.dates.Add(S(r, "date")); if (Vid(r) is not null) a.buses.Add(S(r, "vehicle")); a.samples.Add(r); dData[id] = a;
                var key = id + "|" + Vid(r);
                if (!byPair.TryGetValue(key, out var x)) { x = (d, Vid(r), S(r, "vehicle"), []); pOrder.Add(key); }
                x.samples.Add(r); byPair[key] = x;
            }
        var byDriver = dOrder.Select(id =>
        {
            var x = dData[id]; var p = Pair(x.samples);
            var vids = x.samples.Select(Vid).Where(v => v is not null).Distinct().ToList();
            decimal bk = 0, bf = 0; foreach (var v in vids) if (baseByBus.TryGetValue(v!.Value, out var it)) { bk += it.km; bf += it.fuel; }
            var avg = bf != 0 ? Ratio(bk, bf) : null;
            return new Row
            {
                ["driver_id"] = id, ["driver"] = x.d["name"], ["phone"] = x.d["phone"], ["trips"] = x.trips, ["days"] = x.dates.Count, ["km"] = R1(Sum(x.samples, "km")),
                ["fuel_l"] = R1(Sum(x.samples, "fuel_l")), ["kmpl"] = p.kmpl, ["vs_bus_avg_pct"] = Delta(p.kmpl, avg), ["buses"] = string.Join(", ", x.buses.OrderBy(b => b, Comparer<string>.Create(LC))),
            };
        }).OrderByDescending(x => D(x, "trips")).ThenBy(x => S(x, "driver"), Comparer<string>.Create(LC)).ToList();
        var driverByBus = pOrder.Select(k =>
        {
            var x = byPair[k]; var p = Pair(x.samples); var avg = BusAvg(x.vid);
            return new Row
            {
                ["driver_id"] = x.d["id"], ["driver"] = x.d["name"], ["vehicle"] = x.vehicle, ["vehicle_id"] = x.vid, ["trips"] = x.samples.Count, ["km"] = R1(Sum(x.samples, "km")),
                ["fuel_l"] = R1(Sum(x.samples, "fuel_l")), ["kmpl"] = p.kmpl, ["bus_avg_kmpl"] = avg, ["vs_bus_avg_pct"] = Delta(p.kmpl, avg),
            };
        }).OrderBy(x => S(x, "driver"), Comparer<string>.Create(LC)).ThenBy(x => S(x, "vehicle"), Comparer<string>.Create(LC)).ToList();
        var daily = days.Select(day =>
        {
            var a = rows.Where(r => S(r, "date") == day).ToList(); var turned = disabled.Count(s => s.Date == day);
            var fleetDay = FleetForDay(day); var mainTrips = a.Where(r => Vid(r) is { } v && IsMain(c.Veh.GetValueOrDefault(v))).ToList();
            var used = mainTrips.Select(Vid).ToHashSet();
            var idle = fleetDay.Where(v => !used.Contains(v.Id)).Select(v => v.RegistrationNumber).ToList();
            var p = Pair(a);
            return new Row
            {
                ["date"] = day, ["fleet"] = fleetDay.Count, ["used"] = used.Count, ["trips"] = a.Count,
                ["util_pct"] = c.StaffId is not null ? null : fleetDay.Count > 0 ? R1(mainTrips.Count / (decimal)fleetDay.Count * 100) : null,
                ["no_bus"] = a.Count(r => Vid(r) is null || S(r, "vehicle") == ""), ["turned_off"] = turned, ["km"] = R1(Sum(a, "km")), ["fuel_l"] = R1(Sum(a, "fuel_l")), ["kmpl"] = p.kmpl,
                ["diesel"] = R(Sum(a, "diesel")), ["idle_buses"] = string.Join(", ", idle), ["idle_count"] = idle.Count,
            };
        }).ToList();
        var pAll = Pair(rows); var dieselAll = R(Sum(rows, "diesel"));
        var summary = new Row
        {
            ["fleet_util_pct"] = utilization, ["trips"] = rows.Count, ["buses"] = members.Count(id => c.Veh.ContainsKey(id)), ["drivers"] = dData.Count,
            ["km"] = R1(Sum(rows, "km")), ["fuel_l"] = R1(Sum(rows, "fuel_l")), ["kmpl"] = pAll.kmpl, ["diesel"] = dieselAll, ["idle_bus_days"] = ISum(daily, "idle_count"),
            ["trips_without_bus"] = rows.Count(r => Vid(r) is null || S(r, "vehicle") == ""), ["trips_turned_off"] = disabled.Count,
            ["trips_without_driver"] = rows.Count(r => ((List<Row>)r["drivers"]!).Count == 0), ["fleet_bus_days"] = allFleetBusDays, ["all_buses"] = byBus.Count,
            ["diesel_route_fallback_trips"] = rows.Count(r => S(r, "diesel_source") == "route fallback"), ["gps_fuel_paired_trips"] = rows.Count(r => (bool)r["km_reported"]! && (bool)r["fuel_reported"]!),
        };
        var sKm = D(summary, "km");
        var totals = new Row
        {
            ["by_bus"] = new Row { ["vehicle"] = byBus.Count + " buses", ["trips"] = ISum(byBus, "trips"), ["days_ran"] = ISum(byBus, "days_ran"), ["days_idle"] = ISum(byBus, "days_idle"), ["util_pct"] = utilization,
                ["km"] = R1(Sum(byBus, "km")), ["km_route"] = R1(Sum(byBus, "km_route")), ["fuel_l"] = R1(Sum(byBus, "fuel_l")), ["kmpl"] = pAll.kmpl, ["diesel"] = dieselAll, ["rs_per_km"] = sKm != 0 ? R(dieselAll / sKm) : null },
            ["by_driver"] = new Row { ["driver"] = byDriver.Count + " drivers", ["trips"] = ISum(byDriver, "trips"), ["days"] = ISum(byDriver, "days"), ["km"] = R1(Sum(byDriver, "km")),
                ["fuel_l"] = R1(Sum(byDriver, "fuel_l")), ["kmpl"] = Ratio(Sum(byDriver, "km"), Sum(byDriver, "fuel_l")) },
            ["driver_by_bus"] = new Row { ["driver"] = "Total", ["trips"] = ISum(driverByBus, "trips"), ["km"] = R1(Sum(driverByBus, "km")), ["fuel_l"] = R1(Sum(driverByBus, "fuel_l")) },
            ["daily"] = new Row { ["date"] = days.Count + " days", ["fleet"] = allFleetBusDays + " bus-days", ["used"] = ISum(daily, "used"), ["trips"] = ISum(daily, "trips"), ["util_pct"] = utilization,
                ["no_bus"] = ISum(daily, "no_bus"), ["turned_off"] = ISum(daily, "turned_off"), ["km"] = summary["km"], ["fuel_l"] = summary["fuel_l"], ["kmpl"] = summary["kmpl"], ["diesel"] = dieselAll,
                ["idle_buses"] = summary["idle_bus_days"] + " idle bus-days" },
            ["rows"] = new Row { ["date"] = rows.Count + " trips", ["drivers"] = summary["trips_without_driver"] + " without driver", ["km"] = summary["km"], ["fuel_l"] = summary["fuel_l"], ["kmpl"] = summary["kmpl"], ["diesel"] = dieselAll },
        };
        return new Row
        {
            ["report"] = "fleet-operations", ["from"] = c.From, ["to"] = c.To, ["staff_id"] = c.StaffId, ["bus_id"] = c.BusId, ["operator_name"] = c.Operator,
            ["summary"] = summary, ["by_bus"] = byBus, ["by_driver"] = byDriver, ["driver_by_bus"] = driverByBus, ["daily"] = daily, ["rows"] = rows, ["totals"] = totals,
            ["methodology"] = new Row
            {
                ["fleet_util"] = "Trips ÷ eligible main-bus days; temporary buses count only on days operated",
                ["measurements"] = "Km / fuel use recorded trip readings; km/L uses only trips with both measurements",
                ["driver"] = "Both drivers receive full trip credit; driver totals can exceed fleet totals",
                ["diesel"] = "Reported diesel cost, then trip override; otherwise configured route diesel estimate",
                ["caveat"] = "GPS readings are unverified unless connected to a real tracking provider",
            },
        };
    }

    /// <summary>CSV of one section (legacy ?format=csv&amp;section=…): scalar columns only, BOM-prefixed, all values quoted.</summary>
    public static string Csv(IEnumerable<Row> rows)
    {
        var list = rows.ToList(); if (list.Count == 0) return "\uFEFF";
        var cols = list.SelectMany(r => r.Keys).Distinct().Where(k => !k.StartsWith('_') && list.All(r => r.GetValueOrDefault(k) is null or string or int or long or decimal or bool or double)).ToList();
        static string F(object? v) => v switch { null => "", bool b => b ? "true" : "false", decimal d => d.ToString(CultureInfo.InvariantCulture), _ => Convert.ToString(v, CultureInfo.InvariantCulture) ?? "" };
        return "\uFEFF" + string.Join("\r\n", new[] { cols.Select(c => (object?)c) }.Concat(list.Select(r => cols.Select(c => r.GetValueOrDefault(c))))
            .Select(row => string.Join(",", row.Select(v => "\"" + F(v).Replace("\"", "\"\"") + "\""))));
    }
}
