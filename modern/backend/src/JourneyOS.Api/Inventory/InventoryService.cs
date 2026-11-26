using System.Security.Cryptography;
using JourneyOS.Api.Caching;
using JourneyOS.Api.Outbox;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Realtime;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace JourneyOS.Api.Inventory;

public sealed class GdsException(string code, string message, int httpStatus = 400) : Exception(message)
{
    public string Code { get; } = code;
    public int HttpStatus { get; } = httpStatus;
}

public sealed class InventoryOptions
{
    public int HoldMinutes { get; set; } = 10;
}

public sealed record SeatState(CoachSeat Seat, bool Available, bool LadiesOnly, bool MalesOnly, SeatPrice? Price);

public sealed record HoldPassengerInput(string SeatName, decimal Fare, bool LadiesSeat, string Name, string? Mobile, string? Title,
    string? Email, int Age, string Gender, string? Address, string? IdType, string? IdNumber, bool Primary);

public sealed record HoldInput(long InventoryId, long BoardingPointId, long DroppingPointId, long Source, long Destination,
    IReadOnlyList<HoldPassengerInput> Items, string Channel = "redbus");

public sealed record CancelResult(Booking Booking, decimal Charge, decimal Refund, DateTime At);

public sealed record PaymentInput(string Method, string Status, string? Reference, string? BookedBy = null, string? AgentPhone = null);

/// <summary>
/// Authoritative seat-inventory engine. Every mutation runs inside a PostgreSQL transaction that
/// (1) locks the trip row to serialise gender/adjacency decisions, (2) relies on the
/// ex_seat_allocations_no_overlap exclusion constraint as the final double-allocation guard,
/// (3) writes outbox events atomically, and (4) bumps cache generations only after commit.
/// </summary>
public sealed class InventoryService(GdsDbContext db, IGdsCache cache, RedBusNotifier notifier, TimeProvider clock,
    Microsoft.Extensions.Options.IOptions<InventoryOptions> options, ILogger<InventoryService> log, ITripEvents events)
{
    private DateTime UtcNow => clock.GetUtcNow().UtcDateTime;

    // ---------------- queries ----------------

    public async Task<Route> LoadRouteAsync(long routeId) =>
        await db.Routes
            .Include(r => r.CoachTemplate!).ThenInclude(c => c.Seats)
            .Include(r => r.Stops).ThenInclude(s => s.City).Include(r => r.Stages).Include(r => r.Fares)
            .Include(r => r.RefundSlabs).Include(r => r.SeatFareRules)
            .AsSplitQuery()
            .FirstOrDefaultAsync(r => r.Id == routeId)
        ?? throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);

    public async Task<Tenant> TenantAsync() => await db.Tenants.FirstAsync(t => t.Id == db.CurrentTenantId);

    public static string Gender(string? g) => (g ?? "").Trim().ToUpperInvariant() switch
    {
        "M" or "MALE" => "M",
        "F" or "FEMALE" => "F",
        _ => throw new GdsException("INVALID_GENDER", $"Unsupported gender '{g}'")
    };

    public async Task<List<SeatState>> SeatStatesAsync(Trip trip, Route route, int fromSeq, int toSeq)
    {
        var tenant = await TenantAsync();
        await ExpireTripHoldsAsync(trip.Id); // cheap, keeps reads truthful even if the sweeper lags
        var allocs = await db.SeatAllocations.AsNoTracking()
            .Where(a => a.TripId == trip.Id && a.IsActive && a.FromSeq < toSeq && fromSeq < a.ToSeq)
            .ToListAsync();
        return ComputeStates(route, trip, allocs, fromSeq, toSeq, tenant.GstPercent);
    }

    private static List<SeatState> ComputeStates(Route route, Trip trip, List<SeatAllocation> overlapping, int fromSeq, int toSeq, decimal gstPct)
    {
        var seats = route.CoachTemplate!.Seats;
        var bySeat = overlapping.GroupBy(a => a.CoachSeatId).ToDictionary(g => g.Key, g => g.ToList());
        var result = new List<SeatState>(seats.Count);
        foreach (var s in seats)
        {
            var taken = bySeat.ContainsKey(s.Id);
            bool ladies = false, males = false;
            if (!taken)
            {
                foreach (var n in seats.Where(n => n.Deck == s.Deck && n.Row == s.Row && Math.Abs(n.Col - s.Col) == 1))
                {
                    if (!bySeat.TryGetValue(n.Id, out var occ)) continue;
                    if (occ.Any(o => o.Gender == "F")) ladies = true;
                    if (occ.Any(o => o.Gender == "M")) males = true;
                }
            }
            var listed = FareCalculator.ListedFare(route, s, fromSeq, toSeq, trip.TravelDate, trip);
            result.Add(new SeatState(s, !taken && listed is not null, ladies, males, listed is null ? null : FareCalculator.Price(listed.Value, gstPct)));
        }
        return result;
    }

    // ---------------- holds ----------------

    public async Task<SeatHold> HoldAsync(HoldInput input)
    {
        if (input.Items is null || input.Items.Count == 0) throw new GdsException("NO_SEATS", "inventoryItems is required");
        var inv = await db.OtaInventories.FirstOrDefaultAsync(i => i.Id == input.InventoryId)
                  ?? throw new GdsException("INVENTORY_NOT_FOUND", "Unknown inventory id", 404);

        await using var tx = await db.Database.BeginTransactionAsync();
        var trip = await LockTripAsync(inv.TripId);
        var route = await LoadRouteAsync(trip.RouteId);
        var tenant = await TenantAsync();
        ValidateBookable(trip, route);

        var src = route.Stops.Single(s => s.Sequence == inv.FromSeq);
        var dst = route.Stops.Single(s => s.Sequence == inv.ToSeq);
        if (src.CityId != input.Source || dst.CityId != input.Destination)
            throw new GdsException("SD_MISMATCH", "source/destination do not match the inventory id");
        var bp = route.Stages.FirstOrDefault(s => s.Id == input.BoardingPointId && s.Kind == "pickup" && s.StopSequence == inv.FromSeq)
                 ?? throw new GdsException("INVALID_BOARDING_POINT", "Boarding point is not valid for this source");
        var dp = route.Stages.FirstOrDefault(s => s.Id == input.DroppingPointId && s.Kind == "drop" && s.StopSequence == inv.ToSeq)
                 ?? throw new GdsException("INVALID_DROPPING_POINT", "Dropping point is not valid for this destination");
        if (TripClock.ToUtc(TripClock.Local(trip.TravelDate, bp.Day, bp.Time), tenant.TimeZone) <= UtcNow)
            throw new GdsException("BOARDING_TIME_PASSED", "Boarding time has passed");

        if (input.Items.Count > route.MaxSeatsPerTicket)
            throw new GdsException("MAX_SEATS_EXCEEDED", $"Maximum {route.MaxSeatsPerTicket} seats per ticket");
        if (input.Items.Select(i => i.SeatName).Distinct(StringComparer.OrdinalIgnoreCase).Count() != input.Items.Count)
            throw new GdsException("DUPLICATE_SEAT", "Duplicate seat in request");
        if (input.Items.Count(i => i.Primary) != 1)
            throw new GdsException("PRIMARY_PASSENGER", "Exactly one primary passenger is required");

        await ExpireTripHoldsAsync(trip.Id);
        var overlapping = await db.SeatAllocations
            .Where(a => a.TripId == trip.Id && a.IsActive && a.FromSeq < inv.ToSeq && inv.FromSeq < a.ToSeq).ToListAsync();
        var states = ComputeStates(route, trip, overlapping, inv.FromSeq, inv.ToSeq, tenant.GstPercent)
            .ToDictionary(s => s.Seat.Code, StringComparer.OrdinalIgnoreCase);

        var now = UtcNow;
        var hold = new SeatHold
        {
            TenantId = db.CurrentTenantId, BlockKey = NewBlockKey(), Channel = input.Channel, TripId = trip.Id, InventoryId = inv.Id,
            BoardingStageId = bp.Id, DroppingStageId = dp.Id, FromSeq = inv.FromSeq, ToSeq = inv.ToSeq,
            ExpiresAt = now.AddMinutes(options.Value.HoldMinutes), CreatedAt = now, Currency = "INR",
        };
        foreach (var item in input.Items)
        {
            if (!states.TryGetValue(item.SeatName ?? "", out var st)) throw new GdsException("INVALID_SEAT", $"Seat {item.SeatName} does not exist");
            if (!st.Available || st.Price is null) throw new GdsException("SEAT_UNAVAILABLE", $"Seat {st.Seat.Code} is not available", 409);
            var g = Gender(item.Gender);
            if (st.LadiesOnly && g != "F") throw new GdsException("LADIES_SEAT", $"Seat {st.Seat.Code} is reserved for ladies", 409);
            if (st.MalesOnly && g != "M") throw new GdsException("MALES_SEAT", $"Seat {st.Seat.Code} is reserved for males", 409);
            if (item.Fare != st.Price.Fare) throw new GdsException("FARE_MISMATCH", $"Fare for {st.Seat.Code} changed to {st.Price.Fare}", 409);
            if (string.IsNullOrWhiteSpace(item.Name)) throw new GdsException("PASSENGER_NAME", "Passenger name is required");
            if (item.Age is < 1 or > 120) throw new GdsException("PASSENGER_AGE", "Passenger age is invalid");
            hold.Passengers.Add(new HoldPassenger
            {
                CoachSeatId = st.Seat.Id, SeatCode = st.Seat.Code, Fare = st.Price.Fare, BaseFare = st.Price.BaseFare, Gst = st.Price.Gst,
                LadiesSeat = st.LadiesOnly, Name = item.Name.Trim(), Mobile = item.Mobile, Title = item.Title, Email = item.Email, Age = item.Age,
                Gender = g, Address = item.Address, IdType = item.IdType, IdNumber = item.IdNumber, IsPrimary = item.Primary,
            });
        }
        hold.TotalFare = hold.Passengers.Sum(p => p.Fare);
        db.SeatHolds.Add(hold);
        await db.SaveChangesAsync();
        foreach (var p in hold.Passengers)
            db.SeatAllocations.Add(new SeatAllocation
            {
                TenantId = db.CurrentTenantId, TripId = trip.Id, CoachSeatId = p.CoachSeatId, SeatCode = p.SeatCode, FromSeq = hold.FromSeq,
                ToSeq = hold.ToSeq, Kind = AllocationKind.Hold, Gender = p.Gender, HoldId = hold.Id, CreatedAt = now,
            });
        await SaveGuardedAsync();
        await notifier.ServiceChangedAsync(trip, hold.FromSeq, hold.ToSeq);
        Audit(input.Channel, "HOLD", "seat_hold", hold.BlockKey, new { hold.TripId, seats = hold.Passengers.Select(p => p.SeatCode), hold.TotalFare });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await InvalidateAsync(trip.Id);
        return hold;
    }

    // ---------------- confirmation ----------------

    /// <summary>Idempotent: re-confirming a confirmed blockKey with the same fare returns the same booking.</summary>
    public async Task<Booking> ConfirmAsync(string blockKey, decimal fare, PaymentInput? payment = null)
    {
        if (string.IsNullOrWhiteSpace(blockKey)) throw new GdsException("BLOCK_KEY", "Blockkey is required");
        await using var tx = await db.Database.BeginTransactionAsync();
        var hold = await LockHoldAsync(blockKey);
        if (hold.Status == HoldStatus.Confirmed)
        {
            var existing = await db.Bookings.Include(b => b.Passengers).FirstAsync(b => b.HoldId == hold.Id);
            if (existing.TotalFare != fare) throw new GdsException("FARE_MISMATCH", "Fare does not match the confirmed booking", 409);
            await tx.CommitAsync();
            return existing;
        }
        if (hold.Status != HoldStatus.Held || hold.ExpiresAt <= UtcNow)
            throw new GdsException("HOLD_EXPIRED", "Block key has expired or been released", 410);
        if (hold.TotalFare != fare) throw new GdsException("FARE_MISMATCH", $"Expected fare {hold.TotalFare}", 409);

        var trip = await LockTripAsync(hold.TripId);
        var route = await LoadRouteAsync(trip.RouteId);
        ValidateBookable(trip, route);
        await db.Entry(hold).Collection(h => h.Passengers).LoadAsync();
        var now = UtcNow;
        var primary = hold.Passengers.First(p => p.IsPrimary);
        var booking = new Booking
        {
            TenantId = db.CurrentTenantId, Pnr = NewPnr(now), TripId = trip.Id, HoldId = hold.Id, InventoryId = hold.InventoryId, Channel = hold.Channel,
            BoardingStageId = hold.BoardingStageId, DroppingStageId = hold.DroppingStageId, FromSeq = hold.FromSeq, ToSeq = hold.ToSeq,
            ContactMobile = primary.Mobile, ContactEmail = primary.Email, TotalFare = hold.TotalFare, Currency = hold.Currency,
            CancellationPolicy = CancellationPolicy.FromRefundSlabs(route.RefundSlabs), DateOfIssue = now,
            BookedBy = payment?.BookedBy, AgentPhone = payment?.AgentPhone,
            Passengers = hold.Passengers.Select(p => new BookingPassenger
            {
                CoachSeatId = p.CoachSeatId, SeatCode = p.SeatCode, Fare = p.Fare, BaseFare = p.BaseFare, Gst = p.Gst, LadiesSeat = p.LadiesSeat,
                Name = p.Name, Mobile = p.Mobile, Title = p.Title, Email = p.Email, Age = p.Age, Gender = p.Gender, Address = p.Address,
                IdType = p.IdType, IdNumber = p.IdNumber, IsPrimary = p.IsPrimary,
            }).ToList(),
        };
        db.Bookings.Add(booking);
        hold.Status = HoldStatus.Confirmed;
        hold.ClosedAt = now;
        await db.SaveChangesAsync();
        var isOta = booking.Channel is "redbus";
        db.Payments.Add(new Payment
        {
            TenantId = db.CurrentTenantId, BookingId = booking.Id, Amount = booking.TotalFare, CreatedAt = now,
            Method = payment?.Method ?? (isOta ? "ota_receivable" : "cash"),
            Status = payment?.Status ?? (isOta ? "RECEIVABLE" : "PAID"), Reference = payment?.Reference,
        });
        // Captured evidence only: OTA commission/offer are unknown at booking time and stay null.
        db.BookingFinances.Add(new BookingFinance { BookingId = booking.Id, NetFare = booking.Passengers.Sum(p => p.BaseFare), Gst = booking.Passengers.Sum(p => p.Gst) });

        var allocs = await db.SeatAllocations.Where(a => a.HoldId == hold.Id && a.IsActive).ToListAsync();
        if (allocs.Count != booking.Passengers.Count) throw new GdsException("HOLD_INCONSISTENT", "Held seats are no longer allocated", 409);
        foreach (var a in allocs)
        {
            a.Kind = AllocationKind.Booked;
            a.BookingPassengerId = booking.Passengers.First(p => p.CoachSeatId == a.CoachSeatId).Id;
        }
        Audit(booking.Channel, "CONFIRM", "booking", booking.Pnr, new { blockKey, booking.TotalFare });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await InvalidateAsync(trip.Id);
        return booking;
    }

    /// <summary>Check PNR: never creates a booking; reports whether the blockKey was confirmed.</summary>
    public async Task<(SeatHold Hold, Booking? Booking)> CheckPnrAsync(string blockKey)
    {
        var hold = await db.SeatHolds.AsNoTracking().FirstOrDefaultAsync(h => h.BlockKey == blockKey)
                   ?? throw new GdsException("BLOCK_KEY_NOT_FOUND", "Unknown block key", 404);
        var booking = await db.Bookings.AsNoTracking().FirstOrDefaultAsync(b => b.HoldId == hold.Id);
        return (hold, booking);
    }

    // ---------------- release / expiry ----------------

    public async Task ReleaseAsync(string blockKey, IReadOnlyCollection<string>? seats)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var hold = await LockHoldAsync(blockKey);
        if (hold.Status == HoldStatus.Confirmed) throw new GdsException("ALREADY_CONFIRMED", "Block key is already confirmed; use cancelticket", 409);
        if (hold.Status != HoldStatus.Held) { await tx.CommitAsync(); return; } // idempotent
        await db.Entry(hold).Collection(h => h.Passengers).LoadAsync();
        var release = seats is { Count: > 0 }
            ? hold.Passengers.Where(p => seats.Contains(p.SeatCode, StringComparer.OrdinalIgnoreCase)).ToList()
            : hold.Passengers.ToList();
        if (seats is { Count: > 0 } && release.Count != seats.Count) throw new GdsException("INVALID_SEAT", "Seat is not part of this block");
        var now = UtcNow;
        var ids = release.Select(p => p.CoachSeatId).ToHashSet();
        foreach (var a in await db.SeatAllocations.Where(a => a.HoldId == hold.Id && a.IsActive).ToListAsync())
            if (ids.Contains(a.CoachSeatId)) { a.IsActive = false; a.ReleasedAt = now; a.Reason = "released"; }
        foreach (var p in release) hold.Passengers.Remove(p);
        db.HoldPassengers.RemoveRange(release);
        hold.TotalFare = hold.Passengers.Sum(p => p.Fare);
        if (hold.Passengers.Count == 0) { hold.Status = HoldStatus.Released; hold.ClosedAt = now; }
        var trip = await db.Trips.FirstAsync(t => t.Id == hold.TripId);
        await notifier.ServiceChangedAsync(trip, hold.FromSeq, hold.ToSeq);
        Audit("redbus", "RELEASE", "seat_hold", blockKey, new { seats = release.Select(r => r.SeatCode) });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await InvalidateAsync(hold.TripId);
    }

    /// <summary>Releases expired holds for one trip, in the caller's transaction if any.</summary>
    public async Task<int> ExpireTripHoldsAsync(long tripId)
    {
        var now = UtcNow;
        var n = await db.Database.ExecuteSqlInterpolatedAsync($@"
WITH expired AS (
  UPDATE seat_holds SET status = {(int)HoldStatus.Expired}, closed_at = {now}
  WHERE trip_id = {tripId} AND tenant_id = {db.CurrentTenantId} AND status = {(int)HoldStatus.Held} AND expires_at <= {now}
  RETURNING id)
UPDATE seat_allocations SET is_active = false, released_at = {now}, reason = 'hold_expired'
WHERE hold_id IN (SELECT id FROM expired) AND is_active");
        return n;
    }

    // ---------------- cancellation ----------------

    public async Task<CancelResult> CancelAsync(string pnr, IReadOnlyCollection<string> seats, string? notes, string reason = "customer", bool fullRefund = false)
    {
        if (seats.Count == 0) throw new GdsException("NO_SEATS", "seatsToCancel is required");
        await using var tx = await db.Database.BeginTransactionAsync();
        var booking = await LockBookingAsync(pnr);
        var trip = await LockTripAsync(booking.TripId);
        var route = await LoadRouteAsync(trip.RouteId);
        var tenant = await TenantAsync();
        var active = booking.Passengers.Where(p => p.Status == "CONFIRMED").ToList();
        var targets = active.Where(p => seats.Contains(p.SeatCode, StringComparer.OrdinalIgnoreCase)).ToList();
        if (targets.Count != seats.Count)
            throw new GdsException("SEAT_NOT_CANCELLABLE", "One or more seats are not confirmed on this PNR", 409);
        var partial = targets.Count < active.Count;
        // Legacy business_rules.allow_cancellation = false: passengers/OTAs cannot cancel; operator cancellations (trip cancelled, refunds) still run.
        if (reason == "customer" && !fullRefund && JourneyOS.Api.Operations.RouteSettings.CancellationAllowed(route.SettingsJson) is false)
            throw new GdsException("CANCELLATION_NOT_ALLOWED", "Cancellation is not allowed on this service", 409);
        if (partial && !route.PartialCancellationAllowed) throw new GdsException("PARTIAL_NOT_ALLOWED", "Partial cancellation is not allowed", 409);
        if (partial && targets.Any(t => t.IsPrimary) && !route.PrimaryPaxCancellable)
            throw new GdsException("PRIMARY_NOT_CANCELLABLE", "Primary passenger cannot be cancelled alone", 409);

        var bp = route.Stages.First(s => s.Id == booking.BoardingStageId);
        var now = UtcNow;
        var boardUtc = TripClock.ToUtc(TripClock.Local(trip.TravelDate, bp.Day, bp.Time), tenant.TimeZone);
        if (!fullRefund && boardUtc <= now) throw new GdsException("DEPARTED", "Cannot cancel after boarding time", 409);
        var pct = fullRefund ? 0m : CancellationPolicy.ChargePercent(booking.CancellationPolicy, (boardUtc - now).TotalHours);

        decimal charge = 0, refund = 0;
        foreach (var p in targets)
        {
            var c = Math.Round(p.Fare * pct / 100m, 2, MidpointRounding.AwayFromZero);
            p.Status = "CANCELLED"; p.CancellationCharge = c; p.RefundAmount = p.Fare - c; p.CancelledAt = now;
            charge += c; refund += p.Fare - c;
        }
        var paxIds = targets.Select(t => (long?)t.Id).ToHashSet();
        foreach (var a in await db.SeatAllocations.Where(a => a.TripId == trip.Id && a.IsActive && a.BookingPassengerId != null).ToListAsync())
            if (paxIds.Contains(a.BookingPassengerId)) { a.IsActive = false; a.ReleasedAt = now; a.Reason = "cancelled"; }

        booking.Status = booking.Passengers.All(p => p.Status == "CANCELLED") ? "CANCELLED" : "PARTIALLY_CANCELLED";
        booking.DateOfCancellation = now;
        var cancellation = new Cancellation { TenantId = db.CurrentTenantId, BookingId = booking.Id, Seats = targets.Select(t => t.SeatCode).ToArray(), Charge = charge, Refund = refund, Reason = reason, Notes = notes, CreatedAt = now };
        db.Cancellations.Add(cancellation);
        await db.SaveChangesAsync();
        db.Refunds.Add(new Refund { TenantId = db.CurrentTenantId, CancellationId = cancellation.Id, Amount = refund, CreatedAt = now });
        if (reason != "bus_cancellation") await notifier.ServiceChangedAsync(trip, booking.FromSeq, booking.ToSeq);
        Audit(booking.Channel, "CANCEL", "booking", booking.Pnr, new { seats = cancellation.Seats, charge, refund, reason });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await InvalidateAsync(trip.Id);
        return new CancelResult(booking, charge, refund, now);
    }

    // ---------------- update ----------------

    public async Task UpdateAsync(string pnr, string? mobile, long? boardingAt, long? dropOff)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var booking = await LockBookingAsync(pnr);
        if (booking.Status == "CANCELLED") throw new GdsException("CANCELLED", "Ticket is cancelled", 409);
        var trip = await db.Trips.FirstAsync(t => t.Id == booking.TripId);
        var route = await LoadRouteAsync(trip.RouteId);
        var tenant = await TenantAsync();
        var bp = route.Stages.First(s => s.Id == booking.BoardingStageId);
        var cutoff = TripClock.ToUtc(TripClock.Local(trip.TravelDate, bp.Day, bp.Time), tenant.TimeZone).AddMinutes(-route.UpdateCutoffMinutes);
        if (UtcNow >= cutoff) throw new GdsException("UPDATE_CUTOFF", "Update cutoff has passed", 409);

        if (!string.IsNullOrWhiteSpace(mobile))
        {
            if (mobile.Length is < 10 or > 13 || !mobile.All(char.IsDigit)) throw new GdsException("INVALID_MOBILE", "Invalid mobile number");
            booking.ContactMobile = mobile;
            var primary = booking.Passengers.FirstOrDefault(p => p.IsPrimary);
            if (primary is not null) primary.Mobile = mobile;
        }
        // Boarding/dropping changes may not alter the travelled segment (and hence fare or inventory).
        if (boardingAt is { } b && b != booking.BoardingStageId)
        {
            var nb = route.Stages.FirstOrDefault(s => s.Id == b && s.Kind == "pickup")
                     ?? throw new GdsException("INVALID_BOARDING_POINT", "Unknown boarding point");
            if (nb.StopSequence != booking.FromSeq) throw new GdsException("SEGMENT_CHANGE", "New boarding point must be in the booked source city", 409);
            booking.BoardingStageId = nb.Id;
        }
        if (dropOff is { } d && d != booking.DroppingStageId)
        {
            var nd = route.Stages.FirstOrDefault(s => s.Id == d && s.Kind == "drop")
                     ?? throw new GdsException("INVALID_DROPPING_POINT", "Unknown dropping point");
            if (nd.StopSequence != booking.ToSeq) throw new GdsException("SEGMENT_CHANGE", "New dropping point must be in the booked destination city", 409);
            booking.DroppingStageId = nd.Id;
        }
        Audit(booking.Channel, "UPDATE", "booking", pnr, new { mobile, boardingAt, dropOff });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
    }

    // ---------------- boarding ----------------

    public async Task SetBoardingStatusAsync(string pnr, string seat, string status, string actor)
    {
        if (status is not ("Boarded" or "No-Show" or "Yet-To-Board")) throw new GdsException("INVALID_STATUS", "Invalid boarding status");
        var booking = await db.Bookings.Include(b => b.Passengers).FirstOrDefaultAsync(b => b.Pnr == pnr)
                      ?? throw new GdsException("PNR_NOT_FOUND", "PNR not found", 404);
        var p = booking.Passengers.FirstOrDefault(x => x.SeatCode == seat && x.Status == "CONFIRMED")
                ?? throw new GdsException("INVALID_SEAT", "Seat not on this PNR", 404);
        p.BoardingStatus = status;
        p.BoardingStatusAt = UtcNow;
        Audit(actor, "BOARDING", "booking", pnr, new { seat, status });
        await db.SaveChangesAsync();
    }

    // ---------------- operator actions ----------------

    public async Task<int> CancelTripAsync(long tripId, string actor)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var trip = await LockTripAsync(tripId);
        if (trip.Status == "cancelled") { await tx.CommitAsync(); return 0; }
        var route = await LoadRouteAsync(trip.RouteId);
        var tenant = await TenantAsync();
        trip.Status = "cancelled"; trip.Bookable = false;
        await db.SaveChangesAsync();
        var bookings = await db.Bookings.Include(b => b.Passengers).Where(b => b.TripId == tripId && b.Status != "CANCELLED").ToListAsync();
        var now = UtcNow;
        foreach (var bk in bookings)
        {
            var seats = bk.Passengers.Where(p => p.Status == "CONFIRMED").ToList();
            foreach (var p in seats) { p.Status = "CANCELLED"; p.CancellationCharge = 0; p.RefundAmount = p.Fare; p.CancelledAt = now; }
            bk.Status = "CANCELLED"; bk.DateOfCancellation = now;
            var c = new Cancellation { TenantId = db.CurrentTenantId, BookingId = bk.Id, Seats = seats.Select(s => s.SeatCode).ToArray(), Charge = 0, Refund = seats.Sum(s => s.Fare), Reason = "bus_cancellation", CreatedAt = now };
            db.Cancellations.Add(c);
            await db.SaveChangesAsync();
            db.Refunds.Add(new Refund { TenantId = db.CurrentTenantId, CancellationId = c.Id, Amount = c.Refund, CreatedAt = now });
            var o = route.Stops.Single(s => s.Sequence == bk.FromSeq); var d = route.Stops.Single(s => s.Sequence == bk.ToSeq);
            await notifier.BusCancelledAsync(bk, trip, tenant.OperatorId, o.CityId, d.CityId, c.Seats);
        }
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE seat_allocations SET is_active = false, released_at = {now}, reason = 'bus_cancelled' WHERE trip_id = {tripId} AND is_active");
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE seat_holds SET status = {(int)HoldStatus.Released}, closed_at = {now} WHERE trip_id = {tripId} AND status = {(int)HoldStatus.Held}");
        await notifier.ServiceRemovedAsync(trip);
        Audit(actor, "BUS_CANCEL", "trip", tripId.ToString(), new { bookings = bookings.Count });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await InvalidateAsync(tripId);
        return bookings.Count;
    }

    /// <summary>Shift all confirmed passengers of a PNR to new seats on another trip of the same route pair.</summary>
    public async Task<Booking> ShiftAsync(string pnr, long newTripId, IReadOnlyList<string> newSeats, string actor)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var booking = await LockBookingAsync(pnr);
        var pax = booking.Passengers.Where(p => p.Status == "CONFIRMED").OrderBy(p => p.Id).ToList();
        if (pax.Count == 0 || pax.Count != newSeats.Count) throw new GdsException("SEAT_COUNT", "New seat count must match confirmed passengers");
        var oldTripId = booking.TripId;
        // Lock both trips in id order to avoid deadlocks.
        foreach (var id in new[] { oldTripId, newTripId }.Distinct().Order()) await LockTripAsync(id);
        var oldTrip = await db.Trips.FirstAsync(t => t.Id == oldTripId);
        var newTrip = await db.Trips.FirstAsync(t => t.Id == newTripId);
        var oldRoute = await LoadRouteAsync(oldTrip.RouteId);
        var newRoute = newTrip.RouteId == oldRoute.Id ? oldRoute : await LoadRouteAsync(newTrip.RouteId);
        ValidateBookable(newTrip, newRoute);
        long oCity = oldRoute.Stops.Single(s => s.Sequence == booking.FromSeq).CityId, dCity = oldRoute.Stops.Single(s => s.Sequence == booking.ToSeq).CityId;
        var nFrom = newRoute.Stops.FirstOrDefault(s => s.CityId == oCity) ?? throw new GdsException("SHIFT_ROUTE", "Target service does not serve the source city");
        var nTo = newRoute.Stops.FirstOrDefault(s => s.CityId == dCity && s.Sequence > nFrom.Sequence) ?? throw new GdsException("SHIFT_ROUTE", "Target service does not serve the destination city");
        var nbp = newRoute.Stages.Where(s => s.Kind == "pickup" && s.StopSequence == nFrom.Sequence).OrderByDescending(s => s.Prime).First();
        var ndp = newRoute.Stages.Where(s => s.Kind == "drop" && s.StopSequence == nTo.Sequence).OrderByDescending(s => s.Prime).First();

        var now = UtcNow;
        var pIds = pax.Select(p => (long?)p.Id).ToHashSet();
        foreach (var a in await db.SeatAllocations.Where(a => a.TripId == oldTripId && a.IsActive && a.BookingPassengerId != null).ToListAsync())
            if (pIds.Contains(a.BookingPassengerId)) { a.IsActive = false; a.ReleasedAt = now; a.Reason = "shifted"; }
        await db.SaveChangesAsync();

        var oldSeats = pax.Select(p => p.SeatCode).ToArray();
        var seatMap = newRoute.CoachTemplate!.Seats.ToDictionary(s => s.Code, StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < pax.Count; i++)
        {
            if (!seatMap.TryGetValue(newSeats[i], out var seat)) throw new GdsException("INVALID_SEAT", $"Seat {newSeats[i]} does not exist");
            pax[i].SeatCode = seat.Code; pax[i].CoachSeatId = seat.Id;
            db.SeatAllocations.Add(new SeatAllocation
            {
                TenantId = db.CurrentTenantId, TripId = newTripId, CoachSeatId = seat.Id, SeatCode = seat.Code, FromSeq = nFrom.Sequence, ToSeq = nTo.Sequence,
                Kind = AllocationKind.Booked, Gender = pax[i].Gender, BookingPassengerId = pax[i].Id, CreatedAt = now,
            });
        }
        booking.TripId = newTripId; booking.FromSeq = nFrom.Sequence; booking.ToSeq = nTo.Sequence;
        booking.BoardingStageId = nbp.Id; booking.DroppingStageId = ndp.Id;
        await SaveGuardedAsync();

        var cities = await db.Cities.Where(c => c.Id == oCity || c.Id == dCity).ToDictionaryAsync(c => c.Id);
        string Fmt(int day, TimeOnly t) => TripClock.Fmt(TripClock.Local(newTrip.TravelDate, day, t));
        var provider = await db.OtaProviders.FirstOrDefaultAsync(p => p.Provider == "REDBUS");
        if (booking.Channel == "redbus" && provider is not null)
            await notifier.ShiftedAsync(new
            {
                PNR = (string?)null, // RedBus PNR not supplied by the documented booking contract (see ambiguity register)
                email = booking.ContactEmail ?? "",
                phoneNo = booking.ContactMobile ?? "",
                doj = newTrip.TravelDate.AddDays(nFrom.Day - 1).ToString("yyyy-MM-dd"),
                operatorcode = provider.OperatorCode,
                schedule = new { code = newTrip.Id.ToString(), serviceNumber = newRoute.ServiceNumber },
                busType = newRoute.CoachTemplate.Name,
                cancellationReferenceTime = Fmt(nbp.Day, nbp.Time),
                sourceCode = oCity.ToString(), sourceName = cities[oCity].Name,
                destinationCode = dCity.ToString(), destinationName = cities[dCity].Name,
                boardingPoint = new { code = nbp.Id.ToString(), name = nbp.Name, number = nbp.ContactNumber ?? "", dateTime = Fmt(nbp.Day, nbp.Time) },
                droppingPoint = new { code = ndp.Id.ToString(), name = ndp.Name, number = ndp.ContactNumber ?? "", dateTime = Fmt(ndp.Day, ndp.Time) },
                oldSeatNumbers = oldSeats,
                newSeatNumbers = pax.Select(p => p.SeatCode).ToArray(),
                operator_pnr_number = booking.Pnr,
            }, booking.Pnr, newTripId);
        await notifier.ServiceChangedAsync(oldTrip, 0, int.MaxValue);
        await notifier.ServiceChangedAsync(newTrip, nFrom.Sequence, nTo.Sequence);
        Audit(actor, "SHIFT", "booking", pnr, new { oldTripId, newTripId, oldSeats, newSeats });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await InvalidateAsync(oldTripId);
        await InvalidateAsync(newTripId);
        return booking;
    }

    // ---------------- helpers ----------------

    private static void ValidateBookable(Trip trip, Route route)
    {
        if (trip.Status != "active" || !trip.Bookable) throw new GdsException("SERVICE_NOT_BOOKABLE", "Service is not bookable", 409);
        if (route.Status != "active") throw new GdsException("SERVICE_NOT_BOOKABLE", "Route is not active", 409);
    }

    private async Task<Trip> LockTripAsync(long tripId)
    {
        var trip = await db.Trips.FromSqlInterpolated($"SELECT * FROM trips WHERE id = {tripId} AND tenant_id = {db.CurrentTenantId} FOR UPDATE")
            .IgnoreQueryFilters().FirstOrDefaultAsync();
        return trip ?? throw new GdsException("SERVICE_NOT_FOUND", "Service not found", 404);
    }

    private async Task<SeatHold> LockHoldAsync(string blockKey)
    {
        var hold = await db.SeatHolds.FromSqlInterpolated($"SELECT * FROM seat_holds WHERE block_key = {blockKey} AND tenant_id = {db.CurrentTenantId} FOR UPDATE")
            .IgnoreQueryFilters().FirstOrDefaultAsync();
        return hold ?? throw new GdsException("BLOCK_KEY_NOT_FOUND", "Unknown block key", 404);
    }

    private async Task<Booking> LockBookingAsync(string pnr)
    {
        var booking = await db.Bookings.FromSqlInterpolated($"SELECT * FROM bookings WHERE pnr = {pnr} AND tenant_id = {db.CurrentTenantId} FOR UPDATE")
            .IgnoreQueryFilters().FirstOrDefaultAsync() ?? throw new GdsException("PNR_NOT_FOUND", "PNR not found", 404);
        await db.Entry(booking).Collection(b => b.Passengers).LoadAsync();
        return booking;
    }

    private async Task SaveGuardedAsync()
    {
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23P01" })
        {
            log.LogInformation("Seat overlap rejected by exclusion constraint");
            throw new GdsException("SEAT_UNAVAILABLE", "One or more seats were just taken", 409);
        }
    }

    private void Audit(string actor, string action, string entity, string id, object data) =>
        db.AuditLogs.Add(new AuditLog
        {
            TenantId = db.CurrentTenantId, Actor = actor, Action = action, Entity = entity, EntityId = id,
            DataJson = System.Text.Json.JsonSerializer.Serialize(data), At = UtcNow,
        });

    private async Task InvalidateAsync(long tripId)
    {
        await cache.BumpAsync(CacheKeys.TripScope(db.CurrentTenantId, tripId), CacheKeys.SearchScope(db.CurrentTenantId));
        await events.TripChangedAsync(db.CurrentTenantId, tripId);
    }

    public Task InvalidateTripAsync(long tripId) => InvalidateAsync(tripId);

    private static string NewBlockKey() => "BK" + Convert.ToHexString(RandomNumberGenerator.GetBytes(12));

    private static string NewPnr(DateTime now)
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        Span<byte> b = stackalloc byte[8];
        RandomNumberGenerator.Fill(b);
        var chars = new char[8];
        for (var i = 0; i < 8; i++) chars[i] = alphabet[b[i] % alphabet.Length];
        return $"JOS{now:yyMMdd}{new string(chars)}";
    }
}
