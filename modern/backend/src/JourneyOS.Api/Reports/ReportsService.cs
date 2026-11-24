using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Reports;

/// <summary>
/// Reporting over authoritative modern data (port of legacy server/reports.js). Differences from legacy are deliberate:
/// <list type="bullet">
/// <item>Net sales are the GST-exclusive passenger base fares actually captured at booking; nothing is re-derived from ratios.</item>
/// <item>Expenses are only recorded trip expenses. Legacy route expense templates / telematics diesel are not migrated, so
/// <c>expenseCoverage</c> reports how many trips have any recorded expense — profit is not meaningful where coverage is low.</item>
/// <item>OTA commission is unknown until the OTA invoice is reconciled; it is not deducted here.</item>
/// </list>
/// </summary>
public sealed class ReportsService(GdsDbContext db, TimeProvider clock)
{
    public const int MaxRangeDays = 93;

    public sealed record Day(DateOnly Date, int Bookings, int Seats, decimal Gross, decimal NetSales, decimal CancelCharges, int CancelledPnrs, int CancelledSeats,
        decimal Refunds, decimal Expense, int Capacity, int Trips, int TripsWithExpense, decimal Asp, decimal OccupancyPct, decimal Profit);

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

    private async Task<Dictionary<long, (DateOnly Date, int Capacity, string Service, string Route, string Status)>> TripsAsync(DateOnly from, DateOnly to)
    {
        var trips = await db.Trips.AsNoTracking().Where(t => t.TravelDate >= from && t.TravelDate <= to)
            .Select(t => new { t.Id, t.TravelDate, t.Status, t.Route!.ServiceNumber, t.Route.Name, Capacity = t.Route.CoachTemplate!.Seats.Count }).ToListAsync();
        return trips.ToDictionary(t => t.Id, t => (t.TravelDate, t.Capacity, t.ServiceNumber, t.Name, t.Status));
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
        var tripIds = trips.Keys.ToList();
        var expenses = (await db.TripExpenses.AsNoTracking().Where(e => tripIds.Contains(e.TripId)).ToListAsync()).GroupBy(e => e.TripId).ToDictionary(g => g.Key, g => g.Sum(e => e.Amount));
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
            var exp = activeTrips.Sum(t => expenses.GetValueOrDefault(t.Key));
            rows.Add(new Day(d, live.Count, seats, R2(gross), R2(net), R2(charges), dc.Select(x => x.B.Id).Distinct().Count(), dc.Sum(x => x.C.Seats.Length),
                R2(dc.Sum(x => x.C.Refund)), R2(exp), cap, activeTrips.Count, activeTrips.Count(t => expenses.ContainsKey(t.Key)),
                seats > 0 ? R2(net / seats) : 0, cap > 0 ? R2(seats * 100m / cap) : 0, R2(net + charges - exp)));
        }
        int tSeats = rows.Sum(r => r.Seats), tCap = rows.Sum(r => r.Capacity), tTrips = rows.Sum(r => r.Trips);
        var tNet = rows.Sum(r => r.NetSales);
        var totals = new
        {
            bookings = rows.Sum(r => r.Bookings), seats = tSeats, gross = rows.Sum(r => r.Gross), netSales = tNet, asp = tSeats > 0 ? R2(tNet / tSeats) : 0,
            occupancyPct = tCap > 0 ? R2(tSeats * 100m / tCap) : 0, trips = tTrips, cancelCharges = rows.Sum(r => r.CancelCharges), cancelledPnrs = rows.Sum(r => r.CancelledPnrs),
            cancelledSeats = rows.Sum(r => r.CancelledSeats), refunds = rows.Sum(r => r.Refunds), gst = R2(tNet * tenant.GstPercent / 100m), expense = rows.Sum(r => r.Expense),
            profit = rows.Sum(r => r.Profit), expenseCoverage = new { tripsWithExpense = rows.Sum(r => r.TripsWithExpense), trips = tTrips },
        };
        var liveAll = bks.Where(Live).ToList();
        var channels = liveAll.GroupBy(b => b.Channel).Select(g => new { channel = g.Key, bookings = g.Count(), seats = g.Sum(b => LivePax(b).Count()), netSales = R2(g.Sum(b => LivePax(b).Sum(p => p.BaseFare))) })
            .OrderByDescending(x => x.netSales).ToList();
        var services = liveAll.GroupBy(b => b.ServiceNumber).Select(g => new { service = g.Key, name = g.First().RouteName, bookings = g.Count(), seats = g.Sum(b => LivePax(b).Count()), netSales = R2(g.Sum(b => LivePax(b).Sum(p => p.BaseFare))) })
            .OrderByDescending(x => x.netSales).ToList();
        return new { from, to, channel = channel ?? "all", totals, rows, channels, services,
            notes = new[] { "Net sales = GST-exclusive base fares of confirmed passengers by travel date.", "Expense = recorded trip expenses only; see expenseCoverage.", "OTA commission is not deducted until reconciled." } };
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
        var tripIds = trips.Keys.ToList();
        var exp = (await db.TripExpenses.AsNoTracking().Where(e => tripIds.Contains(e.TripId)).ToListAsync()).GroupBy(e => e.TripId).ToDictionary(g => g.Key, g => g.ToList());
        var gstDiv = 1 + tenant.GstPercent / 100m;
        var rows = trips.OrderBy(t => t.Value.Date).ThenBy(t => t.Value.Service).Select(t =>
        {
            var live = bks.Where(b => b.TripId == t.Key && Live(b)).ToList();
            var seats = live.Sum(b => LivePax(b).Count());
            var net = live.Sum(b => LivePax(b).Sum(p => p.BaseFare));
            var charges = cxl.Where(x => x.B.TripId == t.Key).Sum(x => x.C.Charge) / gstDiv;
            var e = exp.GetValueOrDefault(t.Key) ?? [];
            var expense = t.Value.Status == "active" ? e.Sum(x => x.Amount) : 0;
            return new { tripId = t.Key, date = t.Value.Date, service = t.Value.Service, route = t.Value.Route, running = t.Value.Status == "active", capacity = t.Value.Capacity, seats,
                occupancyPct = t.Value.Capacity > 0 ? R2(seats * 100m / t.Value.Capacity) : 0, netSales = R2(net), cancellationCharges = R2(charges), expense = R2(expense),
                expenseRecorded = e.Count > 0, profit = R2(net + charges - expense),
                expenses = e.Select(x => new { x.Id, x.Category, x.Amount, x.Note, x.By, x.At }) };
        }).ToList();
        return new { rows, summary = new { trips = rows.Count, netSales = rows.Sum(r => r.netSales), expense = rows.Sum(r => r.expense), profit = rows.Sum(r => r.profit),
            lossTrips = rows.Count(r => r.running && r.expenseRecorded && r.profit < 0), tripsWithoutExpense = rows.Count(r => r.running && !r.expenseRecorded) } };
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
        if (parts.Length != 2 || parts[0] is not ("agent" or "ota" or "branch") || parts[1].Length == 0)
            throw new GdsException("VALIDATION", "channelKey must be agent:{phone}, branch:{name} or ota:{name}");
        var (type, id) = (parts[0], parts[1]);
        var q = db.Bookings.AsNoTracking().Include(b => b.Passengers).AsQueryable();
        q = type switch
        {
            "agent" => q.Where(b => b.AgentPhone == id),
            "ota" => q.Where(b => b.Channel == id),
            _ => q.Where(b => b.Channel == "branch" && b.BookedBy == id),
        };
        var bookings = await q.ToListAsync();
        var ids = bookings.Select(b => b.Id).ToList();
        var pays = (await db.Payments.AsNoTracking().Where(p => ids.Contains(p.BookingId)).ToListAsync()).GroupBy(p => p.BookingId).ToDictionary(g => g.Key, g => g.ToList());
        var cxl = await db.Cancellations.AsNoTracking().Where(c => ids.Contains(c.BookingId)).ToListAsync();
        var pct = type == "agent" ? await db.Users.AsNoTracking().Where(u => u.Phone == id && u.Role == "agent").Select(u => u.CommissionPct).FirstOrDefaultAsync() ?? 0 : 0;
        var tz = TimeZoneInfo.FindSystemTimeZoneById((await TenantAsync()).TimeZone);
        DateOnly Local(DateTime utc) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utc, tz));

        var entries = new List<(DateOnly Date, string Kind, string Ref, decimal Debit, decimal Credit, string Note, long? Id)>();
        foreach (var b in bookings)
        {
            var commission = R2(b.Passengers.Sum(p => p.BaseFare) * pct / 100m);
            var due = b.TotalFare - commission;
            var paid = type != "ota" && (pays.GetValueOrDefault(b.Id) ?? []).Any(p => p.Status == "PAID") ? due : 0;
            entries.Add((Local(b.DateOfIssue), "ticket", b.Pnr, due, paid, $"{b.Passengers.Count} seat(s){(commission > 0 ? $" · commission {commission}" : "")}", null));
        }
        foreach (var c in cxl) entries.Add((Local(c.CreatedAt), "cancellation", bookings.First(b => b.Id == c.BookingId).Pnr, 0, c.Refund, $"Refund for {string.Join(",", c.Seats)}", null));
        foreach (var e in await db.LedgerEntries.AsNoTracking().Where(e => e.ChannelKey == channelKey && !e.Voided).ToListAsync())
            entries.Add((e.Date, "manual", e.Note, e.Type == "debit" ? e.Amount : 0, e.Type == "credit" ? e.Amount : 0, $"by {e.By}", e.Id));
        decimal bal = 0;
        var rows = entries.OrderBy(e => e.Date).ThenBy(e => e.Kind).Select(e => { bal += e.Debit - e.Credit; return new { e.Date, e.Kind, e.Ref, e.Debit, e.Credit, e.Note, e.Id, balance = R2(bal) }; }).ToList();
        return new { channelKey, entries = rows, totalDebits = rows.Sum(r => r.Debit), totalCredits = rows.Sum(r => r.Credit), balance = R2(bal) };
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
