using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Reports;

/// <summary>
/// Reporting over authoritative modern data (port of legacy server/reports.js). Differences from legacy are deliberate:
/// <list type="bullet">
/// <item>Net sales are the GST-exclusive passenger base fares actually captured at booking; nothing is re-derived from ratios.</item>
/// <item>Expense per trip = route expense template (legacy route.expenses: fixed items every scheduled day, running items only when
/// the trip runs) with any recorded trip expense of the same key superseding its estimate (actual beats estimate), plus other
/// recorded expenses. Every figure carries its basis (actual / estimate) so profit is never silently presented as fact.</item>
/// <item>OTA commission is unknown until the OTA invoice is reconciled; it is not deducted here.</item>
/// </list>
/// </summary>
public sealed class ReportsService(GdsDbContext db, TimeProvider clock)
{
    public const int MaxRangeDays = 93;

    public sealed record Day(DateOnly Date, int Bookings, int Seats, decimal Gross, decimal NetSales, decimal CancelCharges, int CancelledPnrs, int CancelledSeats,
        decimal Refunds, decimal Expense, decimal ExpenseActual, decimal ExpenseEstimated, int Capacity, int Trips, decimal Asp, decimal OccupancyPct, decimal Profit);

    public sealed record CostLine(string Type, string Key, string Label, decimal Amount, string Basis, decimal? Estimate);
    public sealed record TripCost(List<CostLine> Lines, decimal Total, decimal Actual, decimal Estimated, string Basis);

    /// <summary>Stable key for matching recorded expenses to template items ("Driver Bata" ≡ "driver_bata").</summary>
    public static string ExpenseKey(string s) => string.Join('_', new string((s ?? "").ToLowerInvariant().Select(c => char.IsLetterOrDigit(c) ? c : ' ').ToArray())
        .Split(' ', StringSplitOptions.RemoveEmptyEntries));

    /// <summary>Pure cost model (unit-tested). Cancelled trips keep fixed costs only; recorded expenses always count.</summary>
    public static TripCost Cost(bool running, IEnumerable<RouteExpenseItem> template, IEnumerable<TripExpense> recorded)
    {
        var actualByKey = recorded.GroupBy(e => ExpenseKey(e.Category)).ToDictionary(g => g.Key, g => (Amount: g.Sum(x => x.Amount), Label: g.First().Category));
        var lines = new List<CostLine>();
        foreach (var t in template.Where(t => running || t.Type == "fixed").OrderBy(t => t.Type))
        {
            var k = ExpenseKey(t.Key); var lk = ExpenseKey(t.Label);
            var hit = actualByKey.ContainsKey(k) ? k : actualByKey.ContainsKey(lk) ? lk : null;
            if (hit is not null) { lines.Add(new(t.Type, k, t.Label, actualByKey[hit].Amount, "actual", t.PerTrip)); actualByKey.Remove(hit); }
            else lines.Add(new(t.Type, k, t.Label, t.PerTrip, "estimate", t.PerTrip));
        }
        foreach (var (k, v) in actualByKey) lines.Add(new("other", k, v.Label, v.Amount, "actual", null));
        var actual = lines.Where(l => l.Basis == "actual").Sum(l => l.Amount);
        var est = lines.Where(l => l.Basis == "estimate").Sum(l => l.Amount);
        var basis = lines.Count == 0 ? "none" : est == 0 && lines.All(l => l.Basis == "actual") ? "actual" : actual == 0 ? "estimate" : "mixed";
        return new(lines, R2(actual + est), R2(actual), R2(est), basis);
    }

    private async Task<Dictionary<long, TripCost>> CostsAsync(Dictionary<long, (DateOnly Date, int Capacity, string Service, string Route, string Status, long RouteId)> trips)
    {
        var tripIds = trips.Keys.ToList();
        var routeIds = trips.Values.Select(t => t.RouteId).Distinct().ToList();
        var tmpl = (await db.Set<RouteExpenseItem>().AsNoTracking().Where(x => routeIds.Contains(x.RouteId)).ToListAsync()).GroupBy(x => x.RouteId).ToDictionary(g => g.Key, g => g.ToList());
        var rec = (await db.TripExpenses.AsNoTracking().Where(e => tripIds.Contains(e.TripId)).ToListAsync()).GroupBy(e => e.TripId).ToDictionary(g => g.Key, g => g.ToList());
        return trips.ToDictionary(t => t.Key, t => Cost(t.Value.Status == "active", tmpl.GetValueOrDefault(t.Value.RouteId) ?? [], rec.GetValueOrDefault(t.Key) ?? []));
    }

    private static object Basis(IEnumerable<TripCost> costs) { var c = costs.ToList(); return new { actual = c.Count(x => x.Basis == "actual"), mixed = c.Count(x => x.Basis == "mixed"), estimate = c.Count(x => x.Basis == "estimate"), none = c.Count(x => x.Basis == "none"), trips = c.Count }; }

    private sealed record Bk(long Id, string Pnr, long TripId, DateOnly TravelDate, string ServiceNumber, string RouteName, string Channel, string Status,
        string? Mobile, string? Email, DateTime IssuedAt, long BoardingStageId, string? AgentPhone, string? BookedBy, List<BookingPassenger> Pax);

    public async Task<Tenant> TenantAsync() => await db.Tenants.AsNoTracking().FirstAsync(t => t.Id == db.CurrentTenantId);

    public async Task<DateOnly> TodayAsync()
    {
        var t = await TenantAsync();
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(clock.GetUtcNow().UtcDateTime, TimeZoneInfo.FindSystemTimeZoneById(t.TimeZone)));
    }

    public static void ValidateRange(DateOnly from, DateOnly to)
    {
        if (to < from) throw new GdsException("VALIDATION", "'to' must not be before 'from'");
        if (to.DayNumber - from.DayNumber >= MaxRangeDays) throw new GdsException("VALIDATION", $"Range is limited to {MaxRangeDays} days");
    }

    private async Task<List<Bk>> BookingsAsync(DateOnly start, DateOnly end, string? channel = null)
    {
        var q = from b in db.Bookings.AsNoTracking()
                join t in db.Trips on b.TripId equals t.Id
                where t.TravelDate >= start && t.TravelDate <= end
                select new { b, t.TravelDate, t.Route!.ServiceNumber, t.Route.Name };
        if (!string.IsNullOrEmpty(channel)) q = q.Where(x => x.b.Channel == channel);
        var rows = await q.ToListAsync();
        var ids = rows.Select(r => r.b.Id).ToList();
        var pax = (await db.BookingPassengers.AsNoTracking().Where(p => ids.Contains(p.BookingId)).ToListAsync()).GroupBy(p => p.BookingId).ToDictionary(g => g.Key, g => g.ToList());
        return rows.Select(r => new Bk(r.b.Id, r.b.Pnr, r.b.TripId, r.TravelDate, r.ServiceNumber, r.Name, r.b.Channel, r.b.Status, r.b.ContactMobile, r.b.ContactEmail,
            r.b.DateOfIssue, r.b.BoardingStageId, r.b.AgentPhone, r.b.BookedBy, pax.GetValueOrDefault(r.b.Id) ?? [])).ToList();
    }

    private static bool Live(Bk b) => b.Status != "CANCELLED";
    private static IEnumerable<BookingPassenger> LivePax(Bk b) => b.Pax.Where(p => p.Status == "CONFIRMED");
    private static decimal R2(decimal d) => Math.Round(d, 2, MidpointRounding.AwayFromZero);

    private async Task<Dictionary<long, (DateOnly Date, int Capacity, string Service, string Route, string Status, long RouteId)>> TripsAsync(DateOnly from, DateOnly to)
    {
        var trips = await db.Trips.AsNoTracking().Where(t => t.TravelDate >= from && t.TravelDate <= to && t.DeletedAt == null)
            .Select(t => new { t.Id, t.TravelDate, t.Status, t.RouteId, t.Route!.ServiceNumber, t.Route.Name, Capacity = t.Route.CoachTemplate!.Seats.Count }).ToListAsync();
        return trips.ToDictionary(t => t.Id, t => (t.TravelDate, t.Capacity, t.ServiceNumber, t.Name, t.Status, t.RouteId));
    }

    private async Task<List<(Cancellation C, Bk B)>> CancellationsAsync(List<Bk> bookings)
    {
        var byId = bookings.ToDictionary(b => b.Id);
        var ids = byId.Keys.ToList();
        var cs = await db.Cancellations.AsNoTracking().Where(c => ids.Contains(c.BookingId)).ToListAsync();
        return cs.Select(c => (c, byId[c.BookingId])).ToList();
    }

    // ---------------- analytics ----------------
    public async Task<object> AnalyticsAsync(DateOnly from, DateOnly to, string? channel)
    {
        ValidateRange(from, to);
        var tenant = await TenantAsync();
        var bks = await BookingsAsync(from, to, channel);
        var trips = await TripsAsync(from, to);
        var cxl = await CancellationsAsync(bks);
        var costs = await CostsAsync(trips);
        var gstDiv = 1 + tenant.GstPercent / 100m;

        var rows = new List<Day>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var live = bks.Where(b => b.TravelDate == d && Live(b)).ToList();
            var seats = live.Sum(b => LivePax(b).Count());
            var net = live.Sum(b => LivePax(b).Sum(p => p.BaseFare));
            var gross = live.Sum(b => LivePax(b).Sum(p => p.Fare));
            var dc = cxl.Where(x => x.B.TravelDate == d).ToList();
            var charges = dc.Sum(x => x.C.Charge) / gstDiv;
            var activeTrips = trips.Where(t => t.Value.Date == d && t.Value.Status == "active").ToList();
            var cap = activeTrips.Sum(t => t.Value.Capacity);
            var dayCosts = trips.Where(t => t.Value.Date == d).Select(t => costs[t.Key]).ToList();
            var exp = dayCosts.Sum(c => c.Total);
            rows.Add(new Day(d, live.Count, seats, R2(gross), R2(net), R2(charges), dc.Select(x => x.B.Id).Distinct().Count(), dc.Sum(x => x.C.Seats.Length),
                R2(dc.Sum(x => x.C.Refund)), R2(exp), R2(dayCosts.Sum(c => c.Actual)), R2(dayCosts.Sum(c => c.Estimated)), cap, activeTrips.Count,
                seats > 0 ? R2(net / seats) : 0, cap > 0 ? R2(seats * 100m / cap) : 0, R2(net + charges - exp)));
        }
        int tSeats = rows.Sum(r => r.Seats), tCap = rows.Sum(r => r.Capacity), tTrips = rows.Sum(r => r.Trips);
        var tNet = rows.Sum(r => r.NetSales);
        var totals = new
        {
            bookings = rows.Sum(r => r.Bookings), seats = tSeats, gross = rows.Sum(r => r.Gross), netSales = tNet, asp = tSeats > 0 ? R2(tNet / tSeats) : 0,
            occupancyPct = tCap > 0 ? R2(tSeats * 100m / tCap) : 0, trips = tTrips, cancelCharges = rows.Sum(r => r.CancelCharges), cancelledPnrs = rows.Sum(r => r.CancelledPnrs),
            cancelledSeats = rows.Sum(r => r.CancelledSeats), refunds = rows.Sum(r => r.Refunds), gst = R2(tNet * tenant.GstPercent / 100m), expense = rows.Sum(r => r.Expense),
            profit = rows.Sum(r => r.Profit), expenseActual = rows.Sum(r => r.ExpenseActual), expenseEstimated = rows.Sum(r => r.ExpenseEstimated),
            expenseBasis = Basis(costs.Values),
        };
        var liveAll = bks.Where(Live).ToList();
        var channels = liveAll.GroupBy(b => b.Channel).Select(g => new { channel = g.Key, bookings = g.Count(), seats = g.Sum(b => LivePax(b).Count()), netSales = R2(g.Sum(b => LivePax(b).Sum(p => p.BaseFare))) })
            .OrderByDescending(x => x.netSales).ToList();
        var services = liveAll.GroupBy(b => b.ServiceNumber).Select(g => new { service = g.Key, name = g.First().RouteName, bookings = g.Count(), seats = g.Sum(b => LivePax(b).Count()), netSales = R2(g.Sum(b => LivePax(b).Sum(p => p.BaseFare))) })
            .OrderByDescending(x => x.netSales).ToList();
        return new { from, to, channel = channel ?? "all", totals, rows, channels, services,
            notes = new[] { "Net sales = GST-exclusive base fares of confirmed passengers by travel date.", "Expense = recorded actuals where entered, otherwise the route expense template estimate; see expenseActual / expenseEstimated / expenseBasis.", "OTA commission is not deducted until reconciled." } };
    }

    // ---------------- catalogue ----------------
    public async Task<object> CancellationsReportAsync(DateOnly from, DateOnly to)
    {
        ValidateRange(from, to);
        var cxl = await CancellationsAsync(await BookingsAsync(from, to));
        var rows = cxl.OrderBy(x => x.C.CreatedAt).Select(x => new { travelDate = x.B.TravelDate, cancelledAt = x.C.CreatedAt, pnr = x.B.Pnr, service = x.B.ServiceNumber, channel = x.B.Channel,
            seats = x.C.Seats, charge = x.C.Charge, refund = x.C.Refund, reason = x.C.Reason, contact = x.B.Mobile }).ToList();
        return new { rows, summary = new { cancelledPnrs = rows.Select(r => r.pnr).Distinct().Count(), seats = rows.Sum(r => r.seats.Length), refunds = rows.Sum(r => r.refund), charges = rows.Sum(r => r.charge) } };
    }

    public async Task<object> NoShowsAsync(DateOnly from, DateOnly to)
    {
        ValidateRange(from, to);
        var bks = await BookingsAsync(from, to);
        var rows = bks.SelectMany(b => b.Pax.Where(p => p.Status == "CONFIRMED" && p.BoardingStatus == "No-Show").Select(p => new
            { travelDate = b.TravelDate, pnr = b.Pnr, service = b.ServiceNumber, seat = p.SeatCode, passenger = p.Name, contact = b.Mobile, channel = b.Channel, fare = p.Fare })).ToList();
        return new { rows, summary = new { noShows = rows.Count, fare = rows.Sum(r => r.fare) } };
    }

    public async Task<object> FrequentTravellersAsync(DateOnly from, DateOnly to, int minTrips)
    {
        ValidateRange(from, to);
        var bks = (await BookingsAsync(from, to)).Where(b => !string.IsNullOrEmpty(b.Mobile)).ToList();
        var tiers = await db.Customers.AsNoTracking().ToDictionaryAsync(c => c.Phone, c => c.Tier);
        var all = bks.GroupBy(b => b.Mobile!).Select(g => new
        {
            phone = g.Key, name = g.SelectMany(b => b.Pax).FirstOrDefault(p => p.IsPrimary)?.Name ?? "", trips = g.Count(Live), seats = g.Where(Live).Sum(b => LivePax(b).Count()),
            spend = g.Where(Live).Sum(b => LivePax(b).Sum(p => p.Fare)), cancelled = g.Count(b => !Live(b)), firstTrip = g.Min(b => b.TravelDate), lastTrip = g.Max(b => b.TravelDate),
            tier = tiers.GetValueOrDefault(g.Key) ?? "Bronze",
        }).ToList();
        var repeat = all.Count(x => x.trips >= 2);
        return new { rows = all.Where(x => x.trips >= minTrips).OrderByDescending(x => x.trips).ThenByDescending(x => x.spend).Take(200),
            summary = new { customers = all.Count, repeatCustomers = repeat, repeatPct = all.Count > 0 ? R2(repeat * 100m / all.Count) : 0 } };
    }

    public async Task<object> TripPnlAsync(DateOnly from, DateOnly to)
    {
        ValidateRange(from, to);
        var tenant = await TenantAsync();
        var bks = await BookingsAsync(from, to);
        var trips = await TripsAsync(from, to);
        var cxl = await CancellationsAsync(bks);
        var costs = await CostsAsync(trips);
        var gstDiv = 1 + tenant.GstPercent / 100m;
        var rows = trips.OrderBy(t => t.Value.Date).ThenBy(t => t.Value.Service).Select(t =>
        {
            var live = bks.Where(b => b.TripId == t.Key && Live(b)).ToList();
            var seats = live.Sum(b => LivePax(b).Count());
            var net = live.Sum(b => LivePax(b).Sum(p => p.BaseFare));
            var charges = cxl.Where(x => x.B.TripId == t.Key).Sum(x => x.C.Charge) / gstDiv;
            var c = costs[t.Key];
            return new { tripId = t.Key, routeId = t.Value.RouteId, date = t.Value.Date, service = t.Value.Service, route = t.Value.Route, running = t.Value.Status == "active", capacity = t.Value.Capacity, seats,
                occupancyPct = t.Value.Capacity > 0 ? R2(seats * 100m / t.Value.Capacity) : 0, netSales = R2(net), cancellationCharges = R2(charges), expense = c.Total,
                expenseActual = c.Actual, expenseEstimated = c.Estimated, expenseBasis = c.Basis, profit = R2(net + charges - c.Total), expenses = c.Lines };
        }).ToList();
        return new { rows, summary = new { trips = rows.Count, netSales = rows.Sum(r => r.netSales), expense = rows.Sum(r => r.expense), expenseActual = rows.Sum(r => r.expenseActual),
            expenseEstimated = rows.Sum(r => r.expenseEstimated), profit = rows.Sum(r => r.profit), lossTrips = rows.Count(r => r.profit < 0 && r.expenseBasis != "none"),
            expenseBasis = Basis(costs.Values) } };
    }

    public sealed record TripMoney(int Seats, decimal Net, decimal Gross, decimal Expense, decimal Profit, string Basis);

    /// <summary>Per-trip sale / expense / profit for the schedule list — same arithmetic as <see cref="TripPnlAsync"/>.</summary>
    public async Task<Dictionary<long, TripMoney>> TripMoneyAsync(DateOnly from, DateOnly to)
    {
        ValidateRange(from, to);
        var tenant = await TenantAsync();
        var bks = await BookingsAsync(from, to);
        var trips = await TripsAsync(from, to);
        var cxl = await CancellationsAsync(bks);
        var costs = await CostsAsync(trips);
        var gstDiv = 1 + tenant.GstPercent / 100m;
        return trips.ToDictionary(t => t.Key, t =>
        {
            var live = bks.Where(b => b.TripId == t.Key && Live(b)).ToList();
            var net = live.Sum(b => LivePax(b).Sum(p => p.BaseFare));
            var charges = cxl.Where(x => x.B.TripId == t.Key).Sum(x => x.C.Charge) / gstDiv;
            var c = costs[t.Key];
            return new TripMoney(live.Sum(b => LivePax(b).Count()), R2(net), R2(net * gstDiv), c.Total, R2(net + charges - c.Total), c.Basis);
        });
    }

    // ---------------- daily ops ----------------
    public async Task<object> DailyOpsAsync(DateOnly date)
    {
        var tenant = await TenantAsync();
        var tz = TimeZoneInfo.FindSystemTimeZoneById(tenant.TimeZone);
        var bks = await BookingsAsync(date.AddDays(-1), date.AddDays(6));
        var trips = await TripsAsync(date, date.AddDays(6));
        var todays = trips.Where(t => t.Value.Date == date).Select(t => t.Key).ToList();
        var asg = await db.TripAssignments.AsNoTracking().Where(a => todays.Contains(a.TripId) && a.IsActive).ToListAsync();
        var vehicles = await db.Vehicles.AsNoTracking().ToDictionaryAsync(v => v.Id, v => v.RegistrationNumber);
        var staff = await db.Staff.AsNoTracking().ToDictionaryAsync(s => s.Id);
        var fleet = trips.Where(t => t.Value.Date == date).OrderBy(t => t.Value.Service).Select(t =>
        {
            var live = bks.Where(b => b.TripId == t.Key && Live(b)).ToList();
            var seats = live.Sum(b => LivePax(b).Count());
            var a = asg.Where(x => x.TripId == t.Key).ToList();
            return new { tripId = t.Key, service = t.Value.Service, route = t.Value.Route, status = t.Value.Status,
                vehicle = a.Where(x => x.VehicleId != null).Select(x => vehicles.GetValueOrDefault(x.VehicleId!.Value)).FirstOrDefault(),
                crew = a.Where(x => x.StaffId != null && staff.ContainsKey(x.StaffId.Value)).Select(x => new { role = x.Role, name = staff[x.StaffId!.Value].Name, phone = staff[x.StaffId.Value].Phone }),
                seats, capacity = t.Value.Capacity, occupancyPct = t.Value.Capacity > 0 ? R2(seats * 100m / t.Value.Capacity) : 0, netSales = R2(live.Sum(b => LivePax(b).Sum(p => p.BaseFare))) };
        }).ToList();

        var dayStart = TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(TimeOnly.MinValue), tz);
        var dayEnd = dayStart.AddDays(1);
        var issued = await db.Bookings.AsNoTracking().Where(b => b.DateOfIssue >= dayStart && b.DateOfIssue < dayEnd).Include(b => b.Passengers).ToListAsync();
        var issuedLive = issued.Where(b => b.Status != "CANCELLED").ToList();
        var next7 = Enumerable.Range(0, 7).Select(i => date.AddDays(i)).Select(d =>
        {
            var ts = trips.Where(t => t.Value.Date == d && t.Value.Status == "active").ToList();
            var seats = bks.Where(b => b.TravelDate == d && Live(b)).Sum(b => LivePax(b).Count());
            var cap = ts.Sum(t => t.Value.Capacity);
            return new { date = d, trips = ts.Count, seats, capacity = cap, occupancyPct = cap > 0 ? R2(seats * 100m / cap) : 0 };
        });
        var yesterday = date.AddDays(-1);
        var noShows = bks.Where(b => b.TravelDate == yesterday).SelectMany(b => b.Pax.Where(p => p.BoardingStatus == "No-Show" && p.Status == "CONFIRMED")
            .Select(p => new { pnr = b.Pnr, service = b.ServiceNumber, seat = p.SeatCode, passenger = p.Name, contact = b.Mobile })).ToList();
        var in30 = date.AddDays(30);
        var docs = await db.ComplianceDocuments.AsNoTracking().Where(d => d.ExpiryDate != null && d.ExpiryDate <= in30).ToListAsync();
        var vehDocs = docs.Where(d => d.OwnerType == "vehicle").Select(d => new { vehicle = vehicles.GetValueOrDefault(d.OwnerId), document = d.DocumentName, expiryDate = d.ExpiryDate, state = d.ExpiryDate < date ? "EXPIRED" : "EXPIRING_SOON" });
        var vehField = await db.Vehicles.AsNoTracking().ToListAsync();
        var vehExpiry = vehField.SelectMany(v => new[] { ("Insurance", v.InsuranceExpiry), ("Permit", v.PermitExpiry), ("Fitness", v.FitnessExpiry), ("PUC", v.PucExpiry) }
            .Where(x => x.Item2 is { } e && e <= in30).Select(x => new { vehicle = (string?)v.RegistrationNumber, document = x.Item1, expiryDate = x.Item2, state = x.Item2 < date ? "EXPIRED" : "EXPIRING_SOON" }));
        var licences = staff.Values.Where(s => s.LicenseExpiry is { } e && e <= in30).Select(s => new { s.Name, s.Role, s.Phone, licenseExpiry = s.LicenseExpiry, state = s.LicenseExpiry < date ? "EXPIRED" : "EXPIRING_SOON" });
        var since = date.AddDays(-14);
        var ratings = await db.OtaRatings.AsNoTracking().Where(r => r.RatedAt >= since && r.RatedAt <= date).ToListAsync();
        return new
        {
            date,
            fleet = new { trips = fleet, summary = new { trips = fleet.Count, running = fleet.Count(f => f.status == "active"), withoutBus = fleet.Count(f => f.status == "active" && f.vehicle is null),
                seats = fleet.Sum(f => f.seats), capacity = fleet.Sum(f => f.capacity) } },
            earnings = new { bookings = issuedLive.Count, seats = issuedLive.Sum(b => b.Passengers.Count(p => p.Status == "CONFIRMED")), amount = issuedLive.Sum(b => b.TotalFare),
                cancelledToday = issued.Count - issuedLive.Count,
                byChannel = issuedLive.GroupBy(b => b.Channel).Select(g => new { channel = g.Key, bookings = g.Count(), amount = g.Sum(b => b.TotalFare) }), next7 },
            passengers = new { noShowsYesterday = noShows },
            compliance = new { vehicleDocuments = vehDocs.Concat(vehExpiry).OrderBy(x => x.expiryDate), licences },
            ratings = new { average = ratings.Count > 0 ? R2((decimal)ratings.Average(r => r.Rating)) : (decimal?)null, count = ratings.Count,
                low = ratings.Where(r => r.Rating <= 2).Select(r => new { r.Id, r.Ota, r.Pnr, r.Rating, r.Review, r.RatedAt, r.OperatorReply }) },
        };
    }

    // ---------------- channel ledger ----------------
    /// <summary>
    /// Running balance per channel: debit = amount the channel owes (ticket value net of agent commission),
    /// credit = money received / refunds owed back. Positive balance ⇒ channel owes the operator.
    /// </summary>
    public async Task<object> LedgerAsync(string channelKey)
    {
        var parts = channelKey.Split(':', 2);
        if (channelKey == "website") parts = ["website", "-"]; // operator's own channel: manual entries only (legacy)
        if (parts.Length != 2 || parts[0] is not ("agent" or "ota" or "branch" or "website") || parts[1].Length == 0)
            throw new GdsException("VALIDATION", "channelKey must be website, agent:{phone}, branch:{name} or ota:{name}");
        var (type, id) = (parts[0], parts[1]);
        var q = db.Bookings.AsNoTracking().Include(b => b.Passengers).AsQueryable();
        q = type switch
        {
            "agent" => q.Where(b => b.AgentPhone == id),
            "ota" => q.Where(b => b.Channel == id),
            "website" => q.Where(b => false),
            _ => q.Where(b => b.Channel == "branch" && b.BookedBy == id),
        };
        var bookings = await q.OrderBy(b => b.Pnr).ToListAsync();
        var ids = bookings.Select(b => b.Id).ToList();
        var pays = (await db.Payments.AsNoTracking().Where(p => ids.Contains(p.BookingId)).ToListAsync()).GroupBy(p => p.BookingId).ToDictionary(g => g.Key, g => g.ToList());
        var cxl = (await db.Cancellations.AsNoTracking().Where(c => ids.Contains(c.BookingId)).OrderBy(c => c.CreatedAt).ToListAsync()).GroupBy(c => c.BookingId).ToDictionary(g => g.Key, g => g.ToList());
        var otaCom = await db.BookingFinances.AsNoTracking().Where(f => ids.Contains(f.BookingId) && f.OtaCommission != null).ToDictionaryAsync(f => f.BookingId, f => f.OtaCommission!.Value);
        var travel = await db.Trips.AsNoTracking().Where(t => bookings.Select(b => b.TripId).Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.TravelDate);
        var pct = type == "agent" ? await db.Users.AsNoTracking().Where(u => u.Phone == id && u.Role == "agent").Select(u => u.CommissionPct).FirstOrDefaultAsync() ?? 0 : 0;
        var tz = TimeZoneInfo.FindSystemTimeZoneById((await TenantAsync()).TimeZone);
        DateOnly Local(DateTime utc) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), tz));

        // Same entries as legacy ledger(): a ticket line for every live booking or one with cancellations (amount due net of the recorded
        // commission, else the agent's commission %), each cancellation as a refund credit, then manual entries; stable order by date.
        var entries = new List<(DateOnly Date, string Kind, string Ref, decimal Debit, decimal Credit, string Note, long? Id)>();
        foreach (var b in bookings)
        {
            var cs = cxl.GetValueOrDefault(b.Id) ?? [];
            if (b.Status == "CANCELLED" && cs.Count == 0) continue;
            var commission = otaCom.TryGetValue(b.Id, out var oc) ? oc : R2(b.Passengers.Sum(p => p.BaseFare) * pct / 100m);
            var due = R2(b.TotalFare - commission);
            var paid = type != "ota" && (pays.GetValueOrDefault(b.Id) ?? []).Any(p => p.Status == "PAID") ? due : 0;
            entries.Add((Local(b.DateOfIssue), "ticket", b.Pnr, due, paid, $"{b.Passengers.Count} seat(s) · {travel[b.TripId]:yyyy-MM-dd}", null));
            foreach (var c in cs)
                entries.Add((Local(c.CreatedAt), "cancellation", b.Pnr, 0, c.Refund, $"Refund {(c.Refund + c.Charge > 0 ? Math.Round(c.Refund / (c.Refund + c.Charge) * 100, MidpointRounding.AwayFromZero) : 0)}%", null));
        }
        foreach (var e in await db.LedgerEntries.AsNoTracking().Where(e => e.ChannelKey == channelKey && !e.Voided).ToListAsync())
            entries.Add((e.Date, "manual", e.Note, e.Type == "debit" ? e.Amount : 0, e.Type == "credit" ? e.Amount : 0, $"by {e.By}", e.Id));
        decimal bal = 0;
        var rows = entries.OrderBy(e => e.Date).Select(e => { bal += e.Debit - e.Credit; return new { e.Date, e.Kind, e.Ref, e.Debit, e.Credit, e.Note, e.Id, balance = R2(bal) }; }).ToList();
        return new { channelKey, entries = rows, totalDebits = R2(rows.Sum(r => r.Debit)), totalCredits = R2(rows.Sum(r => r.Credit)), balance = R2(bal) };
    }

    // ---------------- accounts / receivables (legacy reports.js receivables) ----------------
    public sealed record ReceivableRow(string ChannelKey, string ChannelType, string DisplayName, int Bookings, decimal Total, decimal Commission, decimal GstOnCommission,
        decimal Tds, decimal Deductions, decimal Paid, decimal Receivable);

    /// <summary>
    /// Per channel for live bookings travelling in [from, to]: fare collected, deductions (commission + GST on it + OTA TDS 0.1% of net),
    /// paid (non-OTA bookings already paid + manual ledger credits − debits dated in the range) and the receivable remainder.
    /// Commission is the recorded OTA commission, else the agent's configured commission % of base fare (never guessed otherwise).
    /// </summary>
    public async Task<List<ReceivableRow>> ReceivablesAsync(DateOnly from, DateOnly to)
    {
        ValidateRange(from, to);
        var bs = await db.Bookings.AsNoTracking().Join(db.Trips, b => b.TripId, t => t.Id, (b, t) => new { b, t.TravelDate })
            .Where(x => x.TravelDate >= from && x.TravelDate <= to && x.b.Status == "CONFIRMED").OrderBy(x => x.b.Pnr).Select(x => x.b).ToListAsync();
        var ids = bs.Select(b => b.Id).ToList();
        var fin = await db.BookingFinances.AsNoTracking().Where(f => ids.Contains(f.BookingId)).ToDictionaryAsync(f => f.BookingId);
        var paid = (await db.Payments.AsNoTracking().Where(p => ids.Contains(p.BookingId) && p.Status == "PAID").Select(p => p.BookingId).ToListAsync()).ToHashSet();
        var basef = (await db.BookingPassengers.AsNoTracking().Where(p => ids.Contains(p.BookingId) && p.Status == "CONFIRMED").GroupBy(p => p.BookingId)
            .Select(g => new { g.Key, s = g.Sum(p => p.BaseFare) }).ToListAsync()).ToDictionary(x => x.Key, x => x.s);
        var agents = await db.Users.AsNoTracking().Where(u => u.Role == "agent").Select(u => new { u.Phone, u.Name, u.CommissionPct }).ToListAsync();
        var agg = new Dictionary<string, (string Type, string Name, int N, decimal Total, decimal Com, decimal Gst, decimal Tds, decimal Paid)>();
        foreach (var b in bs)
        {
            string key, type, name;
            if (b.Channel == "agent") { key = $"agent:{b.AgentPhone}"; type = "agent"; name = agents.FirstOrDefault(a => a.Phone == b.AgentPhone)?.Name ?? b.AgentPhone ?? "Agent"; }
            else if (b.Channel is "redbus" or "abhibus" or "paytm") { key = $"ota:{b.Channel}"; type = "ota"; name = b.Channel; }
            else if (b.Channel == "branch") { key = $"branch:{b.BookedBy}"; type = "branch"; name = b.BookedBy ?? "Branch"; }
            else { key = "website"; type = "operator"; name = "Website"; }
            var f = fin.GetValueOrDefault(b.Id);
            var net = f?.NetFare ?? basef.GetValueOrDefault(b.Id);
            var com = f?.OtaCommission ?? (type == "agent" ? R2(basef.GetValueOrDefault(b.Id) * (agents.FirstOrDefault(a => a.Phone == b.AgentPhone)?.CommissionPct ?? 0) / 100m) : 0);
            if (!agg.TryGetValue(key, out var a)) a = (type, name, 0, 0m, 0m, 0m, 0m, 0m);
            agg[key] = (type, name, a.N + 1, a.Total + b.TotalFare, a.Com + com, a.Gst + (f?.OtaCommissionGst ?? 0), a.Tds + (type == "ota" ? net * 0.001m : 0),
                a.Paid + (type != "ota" && paid.Contains(b.Id) ? b.TotalFare : 0));
        }
        foreach (var e in await db.LedgerEntries.AsNoTracking().Where(e => !e.Voided && e.Date >= from && e.Date <= to).ToListAsync())
            if (agg.TryGetValue(e.ChannelKey, out var a)) agg[e.ChannelKey] = a with { Paid = a.Paid + (e.Type == "credit" ? e.Amount : -e.Amount) };
        return agg.Select(kv =>
        {
            var a = kv.Value; var ded = a.Com + a.Gst + a.Tds;
            return new ReceivableRow(kv.Key, a.Type, a.Name, a.N, R2(a.Total), R2(a.Com), R2(a.Gst), R2(a.Tds), R2(ded), R2(a.Paid), R2(a.Total - ded - a.Paid));
        }).ToList();
    }

    // ---------------- accounts / sales (legacy reports.js analytics + /accounts/sales-facets) ----------------
    private sealed record RouteInfo(long Id, string Service, string Name, long Origin, long Destination, string OriginName, string DestinationName)
    {
        public string Sector => $"{Origin}:{Destination}";
        public string SectorLabel => $"{OriginName} → {DestinationName}";
        public string Label => Service + (!string.IsNullOrEmpty(Name) && Name != Service ? " · " + Name : "");
    }

    private async Task<Dictionary<long, RouteInfo>> RouteInfoAsync()
    {
        var routes = await db.Routes.AsNoTracking().Where(r => r.Status != "deleted")
            .Select(r => new { r.Id, r.ServiceNumber, r.Name, Stops = r.Stops.OrderBy(s => s.Sequence).Select(s => new { s.CityId, s.City!.Name }).ToList() }).ToListAsync();
        return routes.Where(r => r.Stops.Count > 0).ToDictionary(r => r.Id, r => new RouteInfo(r.Id, r.ServiceNumber, r.Name,
            r.Stops[0].CityId, r.Stops[^1].CityId, r.Stops[0].Name, r.Stops[^1].Name));
    }

    // ---------------- accounts / transactions (legacy reports.js transactions) ----------------
    public sealed record TxRow(string Pnr, string Ticket, DateOnly TravelDate, string Service, string Source, string? Passenger, string? Phone, string Seats,
        string? Payment, string? Method, string BookedBy, string Type, DateTime Date, decimal Total, decimal Refund, decimal Charge, string Status);

    /// <summary>
    /// One row per booking (credit, + total) and per cancellation event (debit, − refund), newest first. basis travel_date filters both by
    /// date of journey; booked filters bookings by issue date and cancellations by cancellation date (local tenant day). Legacy rendered a
    /// "Travel Date / Booked On" toggle that did nothing and always filtered by booking date; here both bases are real.
    /// </summary>
    public async Task<List<TxRow>> TransactionsAsync(DateOnly from, DateOnly to, string basis, string source, string service, string search)
    {
        ValidateRange(from, to);
        if (basis is not ("travel_date" or "booked")) throw new GdsException("VALIDATION", "basis must be travel_date or booked");
        var tz = TimeZoneInfo.FindSystemTimeZoneById((await TenantAsync()).TimeZone);
        DateOnly Local(DateTime utc) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), tz));
        var routes = await RouteInfoAsync();
        var lo = DateTime.SpecifyKind(from.AddDays(-1).ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
        var hi = DateTime.SpecifyKind(to.AddDays(2).ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
        var q = from b in db.Bookings.AsNoTracking() join t in db.Trips on b.TripId equals t.Id select new { b, t.TravelDate, t.RouteId };
        q = basis == "travel_date" ? q.Where(x => x.TravelDate >= from && x.TravelDate <= to)
            : q.Where(x => (x.b.DateOfIssue >= lo && x.b.DateOfIssue < hi) || db.Cancellations.Any(c => c.BookingId == x.b.Id && c.CreatedAt >= lo && c.CreatedAt < hi));
        if (source != "all") q = q.Where(x => x.b.Channel == source);
        var raw = (await q.ToListAsync()).Where(x => routes.ContainsKey(x.RouteId) && (service == "all" || routes[x.RouteId].Service == service)).ToList();
        var ids = raw.Select(x => x.b.Id).ToList();
        var pax = (await db.BookingPassengers.AsNoTracking().Where(p => ids.Contains(p.BookingId)).OrderBy(p => p.Id).ToListAsync()).GroupBy(p => p.BookingId).ToDictionary(g => g.Key, g => g.ToList());
        var cxl = (await db.Cancellations.AsNoTracking().Where(c => ids.Contains(c.BookingId)).ToListAsync()).GroupBy(c => c.BookingId).ToDictionary(g => g.Key, g => g.ToList());
        var pay = (await db.Payments.AsNoTracking().Where(p => ids.Contains(p.BookingId)).OrderBy(p => p.Id).ToListAsync()).GroupBy(p => p.BookingId).ToDictionary(g => g.Key, g => g.First());
        bool In(DateOnly d) => d >= from && d <= to;
        var needle = search.Trim().ToLowerInvariant();
        var rows = new List<TxRow>();
        foreach (var x in raw)
        {
            var b = x.b; var ps = pax.GetValueOrDefault(b.Id) ?? []; var p = pay.GetValueOrDefault(b.Id); var primary = ps.FirstOrDefault(z => z.IsPrimary) ?? ps.FirstOrDefault();
            var ticket = b.Pnr.Length > 6 ? b.Pnr[^6..] : b.Pnr;
            var payment = p?.Status switch { "PAID" => "paid", "PENDING" => "pending", "RECEIVABLE" => "receivable", null => null, var s => s.ToLowerInvariant() };
            TxRow Row(string type, DateTime at, decimal total, decimal refund, decimal charge, string status, string seats) =>
                new(b.Pnr, ticket, x.TravelDate, routes[x.RouteId].Service, b.Channel, primary?.Name, b.ContactMobile, seats, payment, p?.Method, b.BookedBy ?? "Operator", type, at, total, refund, charge, status);
            if (basis == "travel_date" || In(Local(b.DateOfIssue)))
                rows.Add(Row("booking", b.DateOfIssue, b.TotalFare, 0, 0, b.Status.ToLowerInvariant(), string.Join(", ", ps.Select(z => z.SeatCode))));
            foreach (var c in cxl.GetValueOrDefault(b.Id) ?? [])
                if (basis == "travel_date" || In(Local(c.CreatedAt)))
                    rows.Add(Row("cancellation", c.CreatedAt, -c.Refund, c.Refund, c.Charge, "cancelled", string.Join(", ", c.Seats)));
        }
        return rows.Where(r => needle == "" || $"{r.Pnr} {r.Passenger} {r.Phone}".ToLowerInvariant().Contains(needle))
            .OrderByDescending(r => r.Date).ThenBy(r => r.Pnr, StringComparer.Ordinal).ToList();
    }

    /// <summary>Service numbers in route order (legacy G.serviceList over /routes?status=all).</summary>
    public async Task<List<object>> ServiceListAsync() =>
        (await db.Routes.AsNoTracking().OrderBy(r => r.Id).Select(r => new { r.ServiceNumber, r.Name }).ToListAsync())
            .Select(r => (object)new { value = r.ServiceNumber, label = r.ServiceNumber + (string.IsNullOrEmpty(r.Name) ? "" : " · " + r.Name) }).ToList();

    public async Task<object> SalesFacetsAsync()
    {
        var routes = (await RouteInfoAsync()).Values.ToList();
        var channels = await db.Bookings.AsNoTracking().Select(b => b.Channel).Distinct().ToListAsync();
        return new
        {
            sectors = routes.GroupBy(r => r.Sector).Select(g => new { value = g.Key, label = g.First().SectorLabel }).OrderBy(x => x.label, StringComparer.Ordinal).ToList(),
            services = routes.Select(r => new { value = r.Id.ToString(), sector = r.Sector, label = r.Label }).OrderBy(x => x.label, StringComparer.Ordinal).ToList(),
            channels = channels.Where(c => !string.IsNullOrEmpty(c)).OrderBy(c => c, StringComparer.Ordinal).ToList(),
        };
    }

    /// <summary>
    /// Accounts → Sales. Same semantics as legacy analytics(): basis travel_date | booking_date (local issue date), source / sector
    /// (origin:destination city ids) / service (route id) filters scope bookings, capacity and expenses alike; fleet utilisation =
    /// running trips ÷ active main vehicles. Offers are always 0: no discount is captured at booking (legacy data has none either).
    /// Per-channel daily net sales are returned inline (legacy issued one analytics call per channel).
    /// </summary>
    public async Task<object> SalesAsync(DateOnly from, DateOnly to, string basis, string source, string sector, string service)
    {
        ValidateRange(from, to);
        if (basis is not ("travel_date" or "booking_date")) throw new GdsException("VALIDATION", "basis must be travel_date or booking_date");
        var tenant = await TenantAsync();
        var tz = TimeZoneInfo.FindSystemTimeZoneById(tenant.TimeZone);
        var routes = await RouteInfoAsync();
        bool Selected(long routeId) => routes.TryGetValue(routeId, out var r) && (service == "all" || r.Id.ToString() == service) && (sector == "all" || r.Sector == sector);
        var fleet = Math.Max(1, await db.Vehicles.AsNoTracking().CountAsync(v => v.VehicleRole == "main" && v.Status == "active"));

        // Booking-date basis needs a wider travel window: fetch by issue date (UTC window padded by a day, filtered locally).
        var q = from b in db.Bookings.AsNoTracking() join t in db.Trips on b.TripId equals t.Id select new { b, t.TravelDate, t.RouteId };
        if (basis == "travel_date") q = q.Where(x => x.TravelDate >= from && x.TravelDate <= to);
        else
        {
            var lo = DateTime.SpecifyKind(from.AddDays(-1).ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc); var hi = DateTime.SpecifyKind(to.AddDays(2).ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
            q = q.Where(x => x.b.DateOfIssue >= lo && x.b.DateOfIssue < hi);
        }
        if (source != "all") q = q.Where(x => x.b.Channel == source);
        // PNR order = legacy creation order (legacy groups channels by first appearance in its bookings array).
        var raw = (await q.OrderBy(x => x.b.Pnr).ToListAsync()).Where(x => Selected(x.RouteId)).ToList();
        DateOnly Key(DateTime issued, DateOnly travel) => basis == "booking_date" ? DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(issued, DateTimeKind.Utc), tz)) : travel;
        raw = raw.Where(x => { var d = Key(x.b.DateOfIssue, x.TravelDate); return d >= from && d <= to; }).ToList();
        var ids = raw.Select(x => x.b.Id).ToList();
        var pax = (await db.BookingPassengers.AsNoTracking().Where(p => ids.Contains(p.BookingId)).ToListAsync()).GroupBy(p => p.BookingId).ToDictionary(g => g.Key, g => g.ToList());
        var cxl = (await db.Cancellations.AsNoTracking().Where(c => ids.Contains(c.BookingId)).ToListAsync()).GroupBy(c => c.BookingId).ToDictionary(g => g.Key, g => g.ToList());
        var gstDiv = 1 + tenant.GstPercent / 100m;
        var bks = raw.Select(x =>
        {
            var live = (pax.GetValueOrDefault(x.b.Id) ?? []).Where(p => p.Status == "CONFIRMED").ToList();
            return new { x.b.Id, x.b.Channel, x.RouteId, Date = Key(x.b.DateOfIssue, x.TravelDate), Live = x.b.Status != "CANCELLED", Seats = live.Count, Net = live.Sum(p => p.BaseFare), Cxl = cxl.GetValueOrDefault(x.b.Id) ?? [] };
        }).ToList();

        var trips = (await TripsAsync(from, to)).Where(t => t.Value.Status == "active" && Selected(t.Value.RouteId)).ToDictionary(t => t.Key, t => t.Value);
        var costs = await CostsAsync(trips);
        // Legacy tripExpense(): recorded OTA commission of every live booking on a running trip is a running cost (independent of the source filter).
        var tripIdList = trips.Keys.ToList();
        var commission = (await (from f in db.BookingFinances.AsNoTracking() join b in db.Bookings on f.BookingId equals b.Id
                                 where tripIdList.Contains(b.TripId) && b.Status != "CANCELLED" && f.OtaCommission != null
                                 select new { b.TripId, c = f.OtaCommission!.Value }).ToListAsync())
            .GroupBy(x => x.TripId).ToDictionary(g => g.Key, g => g.Sum(x => x.c));
        var liveBks = bks.Where(b => b.Live).ToList();
        var channelKeys = liveBks.Select(b => b.Channel).Distinct().ToList();

        var rows = new List<Dictionary<string, object>>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var live = liveBks.Where(b => b.Date == d).ToList();
            var cx = bks.Where(b => b.Date == d && b.Cxl.Count > 0).ToList();
            var dayTrips = trips.Where(t => t.Value.Date == d).ToList();
            int seats = live.Sum(b => b.Seats), cap = dayTrips.Sum(t => t.Value.Capacity);
            decimal net = live.Sum(b => b.Net), gst95 = live.Where(b => b.Channel is "redbus" or "abhibus").Sum(b => b.Net) * tenant.GstPercent / 100m, gstOwn = net * tenant.GstPercent / 100m - gst95;
            decimal dayCommission = dayTrips.Sum(t => commission.GetValueOrDefault(t.Key));
            decimal charges = cx.Sum(b => b.Cxl.Sum(c => c.Charge)) / gstDiv, expense = dayTrips.Sum(t => costs[t.Key].Total) + dayCommission;
            rows.Add(new()
            {
                ["date"] = d, ["bookings"] = live.Count, ["seats"] = seats, ["sales"] = R2(net), ["offers"] = 0m, ["netSales"] = R2(net), ["gstOwn"] = R2(gstOwn), ["gst95"] = R2(gst95),
                ["gst"] = R2(gstOwn) + R2(gst95), ["cancelCharges"] = R2(charges), ["cancelledPnrs"] = cx.Count, ["cancelledSeats"] = cx.Sum(b => b.Cxl.Sum(c => c.Seats.Length)),
                ["refunds"] = R2(cx.Sum(b => b.Cxl.Sum(c => c.Refund))), ["expense"] = R2(expense), ["commission"] = R2(dayCommission), ["capacity"] = cap, ["trips"] = dayTrips.Count,
                ["asp"] = seats > 0 ? R2(net / seats) : 0m, ["occupancyPct"] = cap > 0 ? R2(seats * 100m / cap) : 0m, ["fleetUtilPct"] = R2(dayTrips.Count * 100m / fleet),
                ["profit"] = R2(R2(net) + R2(charges) - R2(expense)),
                ["byChannel"] = channelKeys.ToDictionary(c => c, c => (object)R2(live.Where(b => b.Channel == c).Sum(b => b.Net))),
            });
        }
        decimal T(string k) => rows.Sum(r => Convert.ToDecimal(r[k]));
        var tSeats = T("seats"); var tCap = T("capacity"); var tNet = T("netSales");
        var totals = new
        {
            bookings = (int)T("bookings"), seats = (int)tSeats, sales = T("sales"), offers = 0m, netSales = tNet, asp = tSeats > 0 ? R2(tNet / tSeats) : 0,
            occupancyPct = tCap > 0 ? R2(tSeats * 100 / tCap) : 0, fleetUtilPct = R2(T("trips") * 100 / (fleet * rows.Count)), cancelCharges = T("cancelCharges"),
            cancelledPnrs = (int)T("cancelledPnrs"), cancelledSeats = (int)T("cancelledSeats"), refunds = T("refunds"), gst = T("gstOwn") + T("gst95"), gstOwn = T("gstOwn"), gst95 = T("gst95"),
            expense = T("expense"), commission = T("commission"), profit = T("profit"), expenseBasis = Basis(costs.Values),
        };
        object Breakdown(Func<RouteInfo, string> key, Func<RouteInfo, string> name) => liveBks.GroupBy(b => key(routes[b.RouteId])).Select(g =>
        {
            var net = R2(g.Sum(b => b.Net));
            return new { value = g.Key, name = name(routes[g.First().RouteId]), bookings = g.Count(), seats = g.Sum(b => b.Seats), netSales = net, avgFare = R2(net / g.Count()) };
        }).OrderBy(x => x.name, StringComparer.Ordinal).ToList();
        return new
        {
            from, to, basis, source, sector, service, totals, rows,
            channels = liveBks.GroupBy(b => b.Channel).Select(g => new { source = g.Key, bookings = g.Count(), seats = g.Sum(b => b.Seats), netSales = R2(g.Sum(b => b.Net)) }).ToList(),
            sectorBreakdown = Breakdown(r => r.Sector, r => r.SectorLabel),
            serviceBreakdown = Breakdown(r => r.Id.ToString(), r => r.Label),
        };
    }

    public async Task<object> ChannelsAsync()
    {
        var agents = await db.Users.AsNoTracking().Where(u => u.Role == "agent").OrderBy(u => u.Name)
            .Select(u => new { channelKey = "agent:" + u.Phone, u.Name, u.Phone, u.CommissionPct, u.CreditLimit, active = u.Status == "ACTIVE" }).ToListAsync();
        var otas = await db.Bookings.AsNoTracking().Where(b => b.Channel == "redbus" || b.Channel == "abhibus" || b.Channel == "paytm").Select(b => b.Channel).Distinct().ToListAsync();
        if (!otas.Contains("redbus")) otas.Insert(0, "redbus");
        var branches = await db.Bookings.AsNoTracking().Where(b => b.Channel == "branch" && b.BookedBy != null).Select(b => b.BookedBy!).Distinct().ToListAsync();
        return new { agents, otas = otas.Select(o => new { channelKey = "ota:" + o, name = o }), branches = branches.Select(b => new { channelKey = "branch:" + b, name = b }) };
    }
}
