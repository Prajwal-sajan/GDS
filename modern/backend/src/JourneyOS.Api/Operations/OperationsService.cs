using JourneyOS.Api.Caching;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Outbox;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.RedBus;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace JourneyOS.Api.Operations;

public sealed record VehicleInput(string RegistrationNumber, long? CoachTemplateId, string? Status, string? ModelName, int? ManufactureYear,
    string? OwnershipType, string? PhoneNumber, bool GpsEnabled, DateOnly? InsuranceExpiry, DateOnly? PermitExpiry, DateOnly? FitnessExpiry, DateOnly? PucExpiry);
public sealed record StaffInput(string Name, string Phone, string Role, string? Status, string? Designation, string? LicenseNumber, DateOnly? LicenseExpiry,
    string? SalaryType, decimal? SalaryAmount, decimal? BataPerTrip);
public sealed record AssignInput(string Role, long? VehicleId, long? StaffId, string? Reason);
public sealed record FareInput(int FromSequence, int ToSequence, decimal Seater, decimal SleeperLower, decimal SleeperUpper);
public sealed record BlockInput(List<string> Seats, int? FromSequence, int? ToSequence, string? Reason);
public sealed record GenerateInput(DateOnly From, DateOnly To);
public sealed record CounterPassenger(string Seat, string Name, int Age, string Gender, string? Mobile, string? Email, bool Primary);
public sealed record CounterBookingInput(long TripId, long BoardingPointId, long DroppingPointId, List<CounterPassenger> Passengers,
    string PaymentMethod, string? PaymentReference, string Channel = "counter", string? AgentPhone = null);

/// <summary>Operator-side master data and operations. Every mutation is transactional, audited and cache-invalidating.</summary>
public sealed class OperationsService(GdsDbContext db, InventoryService inventory, RedBusQueryService rbq, RedBusNotifier notifier,
    IGdsCache cache, TimeProvider clock)
{
    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    private long T => db.CurrentTenantId;

    private async Task<long> NextIdAsync() =>
        await db.Database.SqlQueryRaw<long>("SELECT nextval('master_ids') AS \"Value\"").SingleAsync();

    private void Audit(string actor, string action, string entity, string id, object data) =>
        db.AuditLogs.Add(new AuditLog { TenantId = T, Actor = actor, Action = action, Entity = entity, EntityId = id, DataJson = System.Text.Json.JsonSerializer.Serialize(data), At = Now });

    // ---------------- vehicles ----------------
    public async Task<Vehicle> SaveVehicleAsync(long? id, VehicleInput i, string actor)
    {
        if (string.IsNullOrWhiteSpace(i.RegistrationNumber)) throw new GdsException("VALIDATION", "Registration number is required");
        if (i.Status is not (null or "active" or "maintenance" or "retired")) throw new GdsException("VALIDATION", "Invalid vehicle status");
        if (i.CoachTemplateId is { } ct && !await db.CoachTemplates.AnyAsync(c => c.Id == ct)) throw new GdsException("VALIDATION", "Unknown coach template");
        var reg = i.RegistrationNumber.Trim().ToUpperInvariant();
        if (await db.Vehicles.AnyAsync(v => v.RegistrationNumber == reg && v.Id != id)) throw new GdsException("DUPLICATE", "Registration number already exists", 409);
        Vehicle v;
        if (id is null) { v = new Vehicle { Id = await NextIdAsync(), TenantId = T }; db.Vehicles.Add(v); }
        else v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "Vehicle not found", 404);
        v.RegistrationNumber = reg; v.CoachTemplateId = i.CoachTemplateId; v.Status = i.Status ?? v.Status; v.ModelName = i.ModelName; v.ManufactureYear = i.ManufactureYear;
        v.OwnershipType = i.OwnershipType; v.PhoneNumber = i.PhoneNumber; v.GpsEnabled = i.GpsEnabled;
        v.InsuranceExpiry = i.InsuranceExpiry; v.PermitExpiry = i.PermitExpiry; v.FitnessExpiry = i.FitnessExpiry; v.PucExpiry = i.PucExpiry;
        Audit(actor, id is null ? "VEHICLE_CREATE" : "VEHICLE_UPDATE", "vehicle", v.Id.ToString(), i);
        await db.SaveChangesAsync();
        return v;
    }

    // ---------------- staff ----------------
    public async Task<Staff> SaveStaffAsync(long? id, StaffInput i, string actor)
    {
        if (string.IsNullOrWhiteSpace(i.Name)) throw new GdsException("VALIDATION", "Name is required");
        if (i.Phone is null || i.Phone.Length is < 10 or > 13 || !i.Phone.All(char.IsDigit)) throw new GdsException("VALIDATION", "Invalid phone number");
        if (i.SalaryAmount is < 0 || i.BataPerTrip is < 0) throw new GdsException("VALIDATION", "Amounts cannot be negative");
        Staff s;
        if (id is null) { s = new Staff { Id = await NextIdAsync(), TenantId = T }; db.Staff.Add(s); }
        else s = await db.Staff.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "Staff not found", 404);
        s.Name = i.Name.Trim(); s.Phone = i.Phone; s.Role = i.Role; s.Status = i.Status ?? s.Status; s.Designation = i.Designation; s.LicenseNumber = i.LicenseNumber;
        s.LicenseExpiry = i.LicenseExpiry; s.SalaryType = i.SalaryType; s.SalaryAmount = i.SalaryAmount; s.BataPerTrip = i.BataPerTrip;
        Audit(actor, id is null ? "STAFF_CREATE" : "STAFF_UPDATE", "staff", s.Id.ToString(), new { i.Name, i.Role, i.Status });
        await db.SaveChangesAsync();
        return s;
    }

    // ---------------- trip assignments (bus change / driver replacement) ----------------
    public async Task<TripAssignment> AssignAsync(long tripId, AssignInput i, string actor)
    {
        if (string.IsNullOrWhiteSpace(i.Role) || (i.VehicleId is null) == (i.StaffId is null))
            throw new GdsException("VALIDATION", "Provide a role and exactly one of vehicleId / staffId");
        await using var tx = await db.Database.BeginTransactionAsync();
        var trip = await db.Trips.FromSqlInterpolated($"SELECT * FROM trips WHERE id = {tripId} AND tenant_id = {T} FOR UPDATE").IgnoreQueryFilters().FirstOrDefaultAsync()
                   ?? throw new GdsException("SERVICE_NOT_FOUND", "Service not found", 404);
        if (trip.Status != "active") throw new GdsException("SERVICE_NOT_ACTIVE", "Service is not active", 409);
        var route = await db.Routes.AsNoTracking().FirstAsync(r => r.Id == trip.RouteId);
        var sameDayTrips = db.Trips.Where(t => t.TravelDate == trip.TravelDate && t.Id != tripId && t.Status == "active").Select(t => t.Id);
        if (i.VehicleId is { } vid)
        {
            var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == vid) ?? throw new GdsException("NOT_FOUND", "Vehicle not found", 404);
            if (v.Status != "active") throw new GdsException("VEHICLE_UNAVAILABLE", "Vehicle is not active", 409);
            // Bus change after bookings: seat codes must remain valid, so the coach layout must match.
            if (v.CoachTemplateId != route.CoachTemplateId)
                throw new GdsException("COACH_MISMATCH", "Vehicle coach layout differs from the service layout; shift passengers instead", 409);
            if (await db.TripAssignments.AnyAsync(a => a.IsActive && a.VehicleId == vid && sameDayTrips.Contains(a.TripId)))
                throw new GdsException("VEHICLE_CONFLICT", "Vehicle is already assigned to another service on this date", 409);
        }
        if (i.StaffId is { } sid)
        {
            var s = await db.Staff.FirstOrDefaultAsync(x => x.Id == sid) ?? throw new GdsException("NOT_FOUND", "Staff not found", 404);
            if (s.Status != "active") throw new GdsException("STAFF_UNAVAILABLE", "Staff member is not active", 409);
            if (s.Role == "driver" && s.LicenseExpiry is { } exp && exp < trip.TravelDate)
                throw new GdsException("LICENSE_EXPIRED", "Driver licence expires before the travel date", 409);
            if (await db.TripAssignments.AnyAsync(a => a.IsActive && a.StaffId == sid && sameDayTrips.Contains(a.TripId)))
                throw new GdsException("STAFF_CONFLICT", "Staff member is already assigned to another service on this date", 409);
            if (await db.TripAssignments.AnyAsync(a => a.IsActive && a.StaffId == sid && a.TripId == tripId && a.Role != i.Role))
                throw new GdsException("STAFF_CONFLICT", "Staff member already holds another role on this service", 409);
        }
        var current = await db.TripAssignments.FirstOrDefaultAsync(a => a.TripId == tripId && a.Role == i.Role && a.IsActive);
        if (current is not null)
        {
            current.IsActive = false; current.ReplacedAt = Now; current.ReplacedReason = i.Reason;
            await db.SaveChangesAsync();
        }
        var a = new TripAssignment
        {
            TenantId = T, TripId = tripId, Kind = i.VehicleId is null ? "staff" : "vehicle", VehicleId = i.VehicleId, StaffId = i.StaffId,
            Role = i.Role, AssignedAt = Now,
        };
        db.TripAssignments.Add(a);
        Audit(actor, current is null ? "ASSIGN" : "REASSIGN", "trip", tripId.ToString(), new { i.Role, i.VehicleId, i.StaffId, previous = current?.VehicleId ?? current?.StaffId, i.Reason });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await inventory.InvalidateTripAsync(tripId);
        return a;
    }

    // ---------------- fares ----------------
    public async Task<int> UpdateFaresAsync(long routeId, List<FareInput> fares, string actor)
    {
        if (fares.Count == 0) throw new GdsException("VALIDATION", "At least one fare is required");
        await using var tx = await db.Database.BeginTransactionAsync();
        var route = await db.Routes.Include(r => r.Stops).Include(r => r.Fares).FirstOrDefaultAsync(r => r.Id == routeId)
                    ?? throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);
        var seqs = route.Stops.Select(s => s.Sequence).ToHashSet();
        foreach (var f in fares)
        {
            if (!seqs.Contains(f.FromSequence) || !seqs.Contains(f.ToSequence) || f.FromSequence >= f.ToSequence)
                throw new GdsException("VALIDATION", $"Invalid segment {f.FromSequence}->{f.ToSequence}");
            if (f.Seater < 0 || f.SleeperLower < 0 || f.SleeperUpper < 0) throw new GdsException("VALIDATION", "Fares cannot be negative");
            var row = route.Fares.FirstOrDefault(x => x.FromSequence == f.FromSequence && x.ToSequence == f.ToSequence);
            if (row is null) route.Fares.Add(row = new RouteFare { RouteId = routeId, FromSequence = f.FromSequence, ToSequence = f.ToSequence });
            row.Seater = f.Seater; row.SleeperLower = f.SleeperLower; row.SleeperUpper = f.SleeperUpper;
        }
        Audit(actor, "FARE_UPDATE", "route", routeId.ToString(), fares);
        await db.SaveChangesAsync();
        // Existing holds keep their quoted fare (confirm validates against the hold); future searches see new fares.
        var today = DateOnly.FromDateTime(Now);
        var trips = await db.Trips.Where(t => t.RouteId == routeId && t.TravelDate >= today && t.Status == "active").ToListAsync();
        foreach (var t in trips) await notifier.ServiceChangedAsync(t, 0, int.MaxValue);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        foreach (var t in trips) await inventory.InvalidateTripAsync(t.Id);
        return trips.Count;
    }

    // ---------------- seat blocks ----------------
    public async Task<List<string>> BlockSeatsAsync(long tripId, BlockInput i, string actor)
    {
        if (i.Seats is not { Count: > 0 }) throw new GdsException("VALIDATION", "Seats are required");
        await using var tx = await db.Database.BeginTransactionAsync();
        var trip = await db.Trips.FromSqlInterpolated($"SELECT * FROM trips WHERE id = {tripId} AND tenant_id = {T} FOR UPDATE").IgnoreQueryFilters().FirstOrDefaultAsync()
                   ?? throw new GdsException("SERVICE_NOT_FOUND", "Service not found", 404);
        var route = await inventory.LoadRouteAsync(trip.RouteId);
        var from = i.FromSequence ?? route.Stops.Min(s => s.Sequence);
        var to = i.ToSequence ?? route.Stops.Max(s => s.Sequence);
        if (from >= to) throw new GdsException("VALIDATION", "Invalid segment");
        var seats = route.CoachTemplate!.Seats.ToDictionary(s => s.Code, StringComparer.OrdinalIgnoreCase);
        foreach (var code in i.Seats.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (!seats.TryGetValue(code, out var seat)) throw new GdsException("INVALID_SEAT", $"Seat {code} does not exist");
            db.SeatAllocations.Add(new SeatAllocation { TenantId = T, TripId = tripId, CoachSeatId = seat.Id, SeatCode = seat.Code, FromSeq = from, ToSeq = to, Kind = AllocationKind.Blocked, Reason = i.Reason ?? "operator_block", CreatedAt = Now });
        }
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23P01" })
        { throw new GdsException("SEAT_UNAVAILABLE", "One or more seats are held, booked or already blocked on this segment", 409); }
        await notifier.ServiceChangedAsync(trip, from, to);
        Audit(actor, "SEAT_BLOCK", "trip", tripId.ToString(), new { i.Seats, from, to, i.Reason });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await inventory.InvalidateTripAsync(tripId);
        return i.Seats;
    }

    public async Task<int> UnblockSeatAsync(long tripId, string seat, string actor)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var trip = await db.Trips.FromSqlInterpolated($"SELECT * FROM trips WHERE id = {tripId} AND tenant_id = {T} FOR UPDATE").IgnoreQueryFilters().FirstOrDefaultAsync()
                   ?? throw new GdsException("SERVICE_NOT_FOUND", "Service not found", 404);
        var rows = await db.SeatAllocations.Where(a => a.TripId == tripId && a.IsActive && a.Kind == AllocationKind.Blocked && a.SeatCode == seat).ToListAsync();
        if (rows.Count == 0) throw new GdsException("NOT_BLOCKED", "Seat is not blocked", 404);
        foreach (var r in rows) { r.IsActive = false; r.ReleasedAt = Now; r.Reason = "unblocked"; }
        await notifier.ServiceChangedAsync(trip, rows.Min(r => r.FromSeq), rows.Max(r => r.ToSeq));
        Audit(actor, "SEAT_UNBLOCK", "trip", tripId.ToString(), new { seat });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await inventory.InvalidateTripAsync(tripId);
        return rows.Count;
    }

    // ---------------- trip generation ----------------
    public async Task<int> GenerateTripsAsync(long routeId, GenerateInput i, string actor)
    {
        if (i.To < i.From || i.To.DayNumber - i.From.DayNumber > 120) throw new GdsException("VALIDATION", "Range must be 0–120 days");
        var route = await db.Routes.FirstOrDefaultAsync(r => r.Id == routeId) ?? throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);
        if (route.Status != "active") throw new GdsException("ROUTE_INACTIVE", "Route is not active", 409);
        if (routeId > 999) throw new GdsException("VALIDATION", "Route id exceeds trip id scheme");
        var created = 0;
        await using var tx = await db.Database.BeginTransactionAsync();
        for (var d = i.From; d <= i.To; d = d.AddDays(1))
        {
            var id = long.Parse($"1000{d:yyMMdd}{routeId:000}"); // legacy schedule id scheme
            created += await db.Database.ExecuteSqlInterpolatedAsync($@"
INSERT INTO trips (id, tenant_id, route_id, travel_date, status, bookable) VALUES ({id}, {T}, {routeId}, {d}, 'active', true)
ON CONFLICT DO NOTHING");
        }
        Audit(actor, "TRIPS_GENERATE", "route", routeId.ToString(), new { i.From, i.To, created });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await cache.BumpAsync(CacheKeys.SearchScope(T));
        return created;
    }

    // ---------------- counter / agent booking ----------------
    public async Task<Booking> CounterBookAsync(CounterBookingInput i, string actor)
    {
        if (i.Channel is not ("counter" or "agent" or "branch" or "website")) throw new GdsException("VALIDATION", "Unsupported channel");
        if (i.PaymentMethod is not ("cash" or "card" or "upi" or "agent_credit")) throw new GdsException("VALIDATION", "Unsupported payment method");
        if (i.PaymentMethod == "agent_credit" && i.Channel != "agent") throw new GdsException("VALIDATION", "agent_credit is only valid for the agent channel");
        if (i.Channel == "agent")
        {
            if (string.IsNullOrWhiteSpace(i.AgentPhone)) throw new GdsException("VALIDATION", "agentPhone is required for agent bookings");
            var agent = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Phone == i.AgentPhone && u.Role == "agent")
                        ?? throw new GdsException("VALIDATION", "Unknown agent");
            if (agent.Status != "ACTIVE") throw new GdsException("AGENT_INACTIVE", "Agent is inactive", 409);
        }
        else if (i.AgentPhone is not null) throw new GdsException("VALIDATION", "agentPhone is only valid for agent bookings");
        var trip = await db.Trips.AsNoTracking().FirstOrDefaultAsync(t => t.Id == i.TripId) ?? throw new GdsException("SERVICE_NOT_FOUND", "Service not found", 404);
        var route = await inventory.LoadRouteAsync(trip.RouteId);
        var bp = route.Stages.FirstOrDefault(s => s.Id == i.BoardingPointId && s.Kind == "pickup") ?? throw new GdsException("INVALID_BOARDING_POINT", "Unknown boarding point");
        var dp = route.Stages.FirstOrDefault(s => s.Id == i.DroppingPointId && s.Kind == "drop") ?? throw new GdsException("INVALID_DROPPING_POINT", "Unknown dropping point");
        if (bp.StopSequence >= dp.StopSequence) throw new GdsException("STAGE_ORDER", "Dropping point must be after boarding point");
        var inv = await rbq.EnsureInventoryAsync(trip.Id, bp.StopSequence, dp.StopSequence);
        var states = (await inventory.SeatStatesAsync(trip, route, bp.StopSequence, dp.StopSequence)).ToDictionary(s => s.Seat.Code, StringComparer.OrdinalIgnoreCase);
        var src = route.Stops.Single(s => s.Sequence == bp.StopSequence);
        var dst = route.Stops.Single(s => s.Sequence == dp.StopSequence);
        var items = i.Passengers.Select(p => new HoldPassengerInput(p.Seat, states.TryGetValue(p.Seat, out var st) ? st.Price?.Fare ?? 0 : 0, false, p.Name,
            p.Mobile, null, p.Email, p.Age, p.Gender, null, null, null, p.Primary)).ToList();
        var hold = await inventory.HoldAsync(new HoldInput(inv.Id, bp.Id, dp.Id, src.CityId, dst.CityId, items, i.Channel));
        var paid = i.PaymentMethod == "agent_credit" ? "RECEIVABLE" : "PAID";
        return await inventory.ConfirmAsync(hold.BlockKey, hold.TotalFare, new PaymentInput(i.PaymentMethod, paid, i.PaymentReference, actor, i.AgentPhone));
    }
}
