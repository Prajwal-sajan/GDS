using JourneyOS.Api.Caching;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Outbox;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.RedBus;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace JourneyOS.Api.Operations;

public sealed record VehicleInput(string RegistrationNumber, long? CoachTemplateId, string? Status, string? ModelName, int? ManufactureYear,
    string? OwnershipType, string? PhoneNumber, bool GpsEnabled, DateOnly? InsuranceExpiry, DateOnly? PermitExpiry, DateOnly? FitnessExpiry, DateOnly? PucExpiry, string? VehicleRole = null);
public sealed record StaffInput(string Name, string Phone, string Role, string? Status, string? Designation, string? LicenseNumber, DateOnly? LicenseExpiry,
    string? SalaryType, decimal? SalaryAmount, decimal? BataPerTrip, string? Email = null, string? BloodGroup = null, DateOnly? JoiningDate = null,
    System.Text.Json.Nodes.JsonObject? Profile = null);
public sealed record AssignInput(string Role, long? VehicleId, long? StaffId, string? Reason);
public sealed record FareInput(int FromSequence, int ToSequence, decimal Seater, decimal SleeperLower, decimal SleeperUpper);
public sealed record BlockInput(List<string> Seats, int? FromSequence, int? ToSequence, string? Reason);
public sealed record GenerateInput(DateOnly From, DateOnly To);
public sealed record RefundSlabInput(int HoursBefore, decimal RefundPercent);
public sealed record RouteSettingsInput(string? Name = null, string? AltName = null, TimeOnly? DepartureTime = null,
    TimeOnly? ArrivalTime = null, int? ArrivalDay = null, DateOnly? StartDate = null, DateOnly? EndDate = null, bool? PartialCancellationAllowed = null,
    bool? PrimaryPaxCancellable = null, int? MaxSeatsPerTicket = null, int? UpdateCutoffMinutes = null, List<RefundSlabInput>? RefundSlabs = null,
    decimal? DistanceKm = null, System.Text.Json.Nodes.JsonObject? Settings = null);
public sealed record CounterPassenger(string Seat, string Name, int Age, string Gender, string? Mobile, string? Email, bool Primary);
public sealed record CounterBookingInput(long TripId, long BoardingPointId, long DroppingPointId, List<CounterPassenger> Passengers,
    string PaymentMethod, string? PaymentReference, string Channel = "counter", string? AgentPhone = null);

/// <summary>Operator-side master data and operations. Every mutation is transactional, audited and cache-invalidating.</summary>
public sealed class OperationsService(GdsDbContext db, InventoryService inventory, RedBusQueryService rbq, RedBusNotifier notifier,
    IGdsCache cache, TimeProvider clock, RouteEditService routeEdit)
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
        if (i.Status is not (null or "active" or "inactive" or "maintenance" or "retired")) throw new GdsException("VALIDATION", "Invalid vehicle status");
        if (i.CoachTemplateId is { } ct && !await db.CoachTemplates.AnyAsync(c => c.Id == ct)) throw new GdsException("VALIDATION", "Unknown coach template");
        var reg = i.RegistrationNumber.Trim().ToUpperInvariant();
        if (await db.Vehicles.AnyAsync(v => v.RegistrationNumber == reg && v.Id != id)) throw new GdsException("DUPLICATE", "Registration number already exists", 409);
        Vehicle v;
        if (id is null) { v = new Vehicle { Id = await NextIdAsync(), TenantId = T }; db.Vehicles.Add(v); }
        else v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "Vehicle not found", 404);
        v.RegistrationNumber = reg; v.CoachTemplateId = i.CoachTemplateId; v.Status = i.Status ?? v.Status; v.ModelName = i.ModelName; v.ManufactureYear = i.ManufactureYear;
        v.OwnershipType = i.OwnershipType; v.PhoneNumber = i.PhoneNumber; v.GpsEnabled = i.GpsEnabled;
        v.InsuranceExpiry = i.InsuranceExpiry; v.PermitExpiry = i.PermitExpiry; v.FitnessExpiry = i.FitnessExpiry; v.PucExpiry = i.PucExpiry;
        if (i.VehicleRole is not null)
        {
            if (i.VehicleRole is not ("main" or "pickup_van" or "spare")) throw new GdsException("VALIDATION", "Invalid vehicle role");
            v.VehicleRole = i.VehicleRole;
        }
        Audit(actor, id is null ? "VEHICLE_CREATE" : "VEHICLE_UPDATE", "vehicle", v.Id.ToString(), i);
        await db.SaveChangesAsync();
        return v;
    }

    /// <summary>Legacy fleet on/off switch (<c>PUT /vehicles/:id {status}</c>).</summary>
    public async Task<string> SetVehicleStatusAsync(long id, string status, string actor)
    {
        if (status is not ("active" or "inactive" or "maintenance")) throw new GdsException("VALIDATION", "Status must be active, inactive or maintenance");
        var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "Vehicle not found", 404);
        Audit(actor, "VEHICLE_STATUS", "vehicle", id.ToString(), new { from = v.Status, to = status });
        v.Status = status;
        await db.SaveChangesAsync();
        return status;
    }

    /// <summary>Legacy coach on/off switch (<c>PUT /coaches/:id {status}</c>).</summary>
    public async Task<string> SetCoachStatusAsync(long id, string status, string actor)
    {
        if (status is not ("active" or "inactive")) throw new GdsException("VALIDATION", "Status must be active or inactive");
        var c = await db.CoachTemplates.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "Coach not found", 404);
        Audit(actor, "COACH_STATUS", "coach", id.ToString(), new { from = c.Status, to = status });
        c.Status = status;
        await db.SaveChangesAsync();
        return status;
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
        if (i.Email is not null) s.Email = i.Email.Trim() is { Length: > 0 } em ? em : null;
        if (i.BloodGroup is not null) s.BloodGroup = i.BloodGroup is "" ? null : i.BloodGroup;
        if (i.JoiningDate is not null) s.JoiningDate = i.JoiningDate;
        if (i.Profile is not null) s.ProfileJson = CleanStaffProfile(i.Profile);
        Audit(actor, id is null ? "STAFF_CREATE" : "STAFF_UPDATE", "staff", s.Id.ToString(), new { i.Name, i.Role, i.Status, profile = i.Profile is not null });
        await db.SaveChangesAsync();
        return s;
    }

    /// <summary>Legacy staff-parity-v11 save validation (Aadhaar 12 digits, PAN, IFSC, account 9-18 digits, non-negative rates); whitelists keys.</summary>
    private static string CleanStaffProfile(System.Text.Json.Nodes.JsonObject p)
    {
        static string Str(System.Text.Json.Nodes.JsonNode? n, int max) { var s = n is System.Text.Json.Nodes.JsonValue v ? v.ToString().Trim() : ""; return s.Length > max ? s[..max] : s; }
        static decimal Num(System.Text.Json.Nodes.JsonNode? n, string label)
        {
            if (n is null) return 0;
            if (!decimal.TryParse(n.ToString(), System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var d) || d < 0 || d > 10_000_000) throw new GdsException("VALIDATION", label);
            return d;
        }
        var o = new System.Text.Json.Nodes.JsonObject
        {
            ["address"] = Str(p["address"], 300),
            ["aadhaar"] = Str(p["aadhaar"], 12),
            ["pan"] = Str(p["pan"], 10).ToUpperInvariant(),
            ["employment_type"] = Str(p["employment_type"], 20),
            ["retention_per_day"] = Num(p["retention_per_day"], "Rates cannot be negative"),
            ["overtime_rate"] = Num(p["overtime_rate"] ?? 100, "Rates cannot be negative"),
        };
        var aad = o["aadhaar"]!.ToString(); if (aad != "" && !System.Text.RegularExpressions.Regex.IsMatch(aad, @"^\d{12}$")) throw new GdsException("VALIDATION", "Aadhaar must have 12 digits");
        var pan = o["pan"]!.ToString(); if (pan != "" && !System.Text.RegularExpressions.Regex.IsMatch(pan, @"^[A-Z]{5}\d{4}[A-Z]$")) throw new GdsException("VALIDATION", "Invalid PAN format");
        if (o["employment_type"]!.ToString() is not ("" or "Full-time" or "Part-time" or "Contract")) throw new GdsException("VALIDATION", "Invalid employment type");
        var ec = p["emergency_contact"] as System.Text.Json.Nodes.JsonObject;
        var ecPhone = Str(ec?["phone"], 10);
        if (ecPhone != "" && !System.Text.RegularExpressions.Regex.IsMatch(ecPhone, @"^\d{10}$")) throw new GdsException("VALIDATION", "Emergency contact phone must have 10 digits");
        o["emergency_contact"] = new System.Text.Json.Nodes.JsonObject { ["name"] = Str(ec?["name"], 100), ["phone"] = ecPhone };
        var b = p["bank"] as System.Text.Json.Nodes.JsonObject;
        var bank = new System.Text.Json.Nodes.JsonObject();
        foreach (var k in new[] { "account_name", "bank_name", "branch", "account_number", "ifsc", "upi" }) bank[k] = Str(b?[k], 120);
        var ifsc = bank["ifsc"]!.ToString().ToUpperInvariant(); bank["ifsc"] = ifsc;
        if (ifsc != "" && !System.Text.RegularExpressions.Regex.IsMatch(ifsc, @"^[A-Z]{4}0[A-Z0-9]{6}$")) throw new GdsException("VALIDATION", "Invalid IFSC code");
        var acc = bank["account_number"]!.ToString();
        if (acc != "" && !System.Text.RegularExpressions.Regex.IsMatch(acc, @"^\d{9,18}$")) throw new GdsException("VALIDATION", "Bank account number must be 9–18 digits");
        o["bank"] = bank;
        foreach (var key in new[] { "payroll_bonus_rules", "payroll_deduction_rules" })
        {
            var arr = new System.Text.Json.Nodes.JsonArray();
            if (p[key] is System.Text.Json.Nodes.JsonArray src)
            {
                if (src.Count > 20) throw new GdsException("VALIDATION", "Too many payroll rules");
                foreach (var r in src.OfType<System.Text.Json.Nodes.JsonObject>())
                {
                    var name = Str(r["name"], 100); if (name == "") throw new GdsException("VALIDATION", "Rule name is required");
                    var freq = Str(r["frequency"], 20); if (freq is not ("" or "Every trip" or "Monthly" or "One-time")) throw new GdsException("VALIDATION", "Invalid rule frequency");
                    arr.Add(new System.Text.Json.Nodes.JsonObject { ["name"] = name, ["amount"] = Num(r["amount"], "Rule amount must be a non-negative number"), ["frequency"] = freq == "" ? "Every trip" : freq });
                }
            }
            o[key] = arr;
        }
        return o.ToJsonString();
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
            // An all-zero row would put the city pair on sale for free.
            if (f.Seater + f.SleeperLower + f.SleeperUpper == 0) throw new GdsException("VALIDATION", $"Enter a fare for segment {f.FromSequence}->{f.ToSequence}");
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

    /// <summary>Legacy PUT /schedules/:id/fares: per-trip fare override (null = follow route). Holds keep their quoted fare.</summary>
    public async Task SetTripFaresAsync(long tripId, List<TripFare>? fares, string actor)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var trip = await db.Trips.FromSqlInterpolated($"SELECT * FROM trips WHERE id = {tripId} AND tenant_id = {T} FOR UPDATE").IgnoreQueryFilters().FirstOrDefaultAsync(t => t.DeletedAt == null)
                   ?? throw new GdsException("NOT_FOUND", "Schedule not found", 404);
        trip.FareOverrideJson = fares is null ? null : System.Text.Json.JsonSerializer.Serialize(fares);
        trip.FareOverrideAt = fares is null ? null : Now;
        if (trip.Status == "active") await notifier.ServiceChangedAsync(trip, 0, int.MaxValue);
        Audit(actor, "fares", "schedule", tripId.ToString(), new { sync_fares_with_route = fares is null, fares });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await inventory.InvalidateTripAsync(tripId);
    }

    /// <summary>Legacy DELETE /schedules/:id: refused while live bookings exist; otherwise the departure is withdrawn (kept for audit).</summary>
    public async Task DeleteTripAsync(long tripId, string actor)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var trip = await db.Trips.FromSqlInterpolated($"SELECT * FROM trips WHERE id = {tripId} AND tenant_id = {T} FOR UPDATE").IgnoreQueryFilters().FirstOrDefaultAsync(t => t.DeletedAt == null)
                   ?? throw new GdsException("NOT_FOUND", "Schedule not found", 404);
        if (await db.Bookings.AnyAsync(b => b.TripId == tripId && b.Status != "CANCELLED"))
            throw new GdsException("CONFLICT", "Schedule has confirmed bookings — cancel or shift them first", 409);
        foreach (var a in await db.SeatAllocations.Where(a => a.TripId == tripId && a.IsActive).ToListAsync()) { a.IsActive = false; a.ReleasedAt = Now; }
        var wasActive = trip.Status == "active";
        trip.Status = "deleted"; trip.Bookable = false; trip.DeletedAt = Now;
        if (wasActive) await notifier.ServiceChangedAsync(trip, 0, int.MaxValue);
        Audit(actor, "block", "schedule", tripId.ToString(), new { op = "delete" });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await inventory.InvalidateTripAsync(tripId);
    }

    /// <summary>Legacy POST /schedules/restore: brings a deleted departure back on sale (standing route seat blocks re-applied).</summary>
    public async Task RestoreTripAsync(long tripId, string actor)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var trip = await db.Trips.FromSqlInterpolated($"SELECT * FROM trips WHERE id = {tripId} AND tenant_id = {T} FOR UPDATE").IgnoreQueryFilters().FirstOrDefaultAsync(t => t.DeletedAt != null)
                   ?? throw new GdsException("NOT_FOUND", "Deleted trip not found", 404);
        var route = await db.Routes.FirstAsync(r => r.Id == trip.RouteId);
        if (route.Status != "active") throw new GdsException("ROUTE_INACTIVE", "Activate the route before restoring its trips", 409);
        trip.Status = "active"; trip.Bookable = true; trip.DeletedAt = null;
        await notifier.ServiceChangedAsync(trip, 0, int.MaxValue);
        Audit(actor, "block", "schedule", tripId.ToString(), new { op = "restore" });
        await db.SaveChangesAsync();
        await routeEdit.ApplyBlocksToNewTripsAsync(trip.RouteId);
        await tx.CommitAsync();
        await inventory.InvalidateTripAsync(tripId);
        await cache.BumpAsync(CacheKeys.SearchScope(T));
    }

    /// <summary>Legacy "Disable / Activate schedule" switch: opens or closes sales for one departure. Existing bookings are untouched.</summary>
    public async Task<bool> SetBookableAsync(long tripId, bool active, string actor)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var trip = await db.Trips.FromSqlInterpolated($"SELECT * FROM trips WHERE id = {tripId} AND tenant_id = {T} FOR UPDATE").IgnoreQueryFilters().FirstOrDefaultAsync()
                   ?? throw new GdsException("SERVICE_NOT_FOUND", "Service not found", 404);
        if (trip.Status != "active") throw new GdsException("SERVICE_NOT_ACTIVE", $"This schedule is {trip.Status} and cannot be switched on or off", 409);
        if (trip.Bookable == active) { await tx.CommitAsync(); return trip.Bookable; }
        trip.Bookable = active;
        var route = await inventory.LoadRouteAsync(trip.RouteId);
        await notifier.ServiceChangedAsync(trip, route.Stops.Min(s => s.Sequence), route.Stops.Max(s => s.Sequence));
        Audit(actor, active ? "SCHEDULE_ENABLED" : "SCHEDULE_DISABLED", "trip", tripId.ToString(), new { active });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await inventory.InvalidateTripAsync(tripId);
        return trip.Bookable;
    }

    /// <summary>Legacy route list on/off switch (PUT /routes/:id {status}). Inactive routes drop out of OTA search and refuse new
    /// bookings (InventoryService / RedBusQueryService gate on route status); existing bookings and trips are untouched.</summary>
    public async Task<string> SetRouteStatusAsync(long routeId, string status, string actor)
    {
        if (status is not ("active" or "inactive")) throw new GdsException("VALIDATION", "Status must be active or inactive");
        var route = await db.Routes.Include(r => r.Stops).FirstOrDefaultAsync(r => r.Id == routeId) ?? throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);
        if (route.Status == status) return status;
        var previous = route.Status;
        route.Status = status;
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(5.5));
        var trips = await db.Trips.Where(t => t.RouteId == routeId && t.TravelDate >= today && t.Status == "active").ToListAsync();
        if (route.Stops.Count > 0)
            foreach (var t in trips) await notifier.ServiceChangedAsync(t, route.Stops.Min(s => s.Sequence), route.Stops.Max(s => s.Sequence));
        Audit(actor, status == "active" ? "ROUTE_ACTIVATED" : "ROUTE_DEACTIVATED", "route", routeId.ToString(), new { previous, status });
        await db.SaveChangesAsync();
        foreach (var t in trips) await inventory.InvalidateTripAsync(t.Id);
        return status;
    }

    /// <summary>Legacy route editor General / Update / Cancellation sections (PUT /routes/:id with those fields). Only the supplied
    /// fields change. Refund slabs replace the route's slab set. Future trips are invalidated so the OTA sees the new policy / times.</summary>
    public async Task<Route> UpdateRouteSettingsAsync(long routeId, RouteSettingsInput i, string actor)
    {
        var route = await db.Routes.Include(r => r.RefundSlabs).FirstOrDefaultAsync(r => r.Id == routeId) ?? throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);
        var changes = new Dictionary<string, object?>();
        void Set(string k, object? v, object? cur, Action apply) { if (v is null || Equals(cur, v)) return; changes[k] = new { from = cur, to = v }; apply(); }
        if (i.Name is not null && string.IsNullOrWhiteSpace(i.Name)) throw new GdsException("VALIDATION", "Route name is required");
        if (i.MaxSeatsPerTicket is < 1 or > 50) throw new GdsException("VALIDATION", "Max seats per ticket must be 1-50");
        if (i.UpdateCutoffMinutes is < 0 or > 10080) throw new GdsException("VALIDATION", "Update cutoff must be 0-10080 minutes");
        if (i.ArrivalDay is < 1 or > 7) throw new GdsException("VALIDATION", "Arrival day must be 1-7");
        if ((i.StartDate ?? route.StartDate) is DateOnly sd && (i.EndDate ?? route.EndDate) is DateOnly ed && ed < sd) throw new GdsException("VALIDATION", "End date is before start date");
        Set("name", i.Name?.Trim(), route.Name, () => route.Name = i.Name!.Trim());
        Set("alt_name", i.AltName, route.AltName ?? "", () => route.AltName = i.AltName == "" ? null : i.AltName);
        Set("departure_time", i.DepartureTime, route.DepartureTime, () => route.DepartureTime = i.DepartureTime!.Value);
        Set("arrival_time", i.ArrivalTime, route.ArrivalTime, () => route.ArrivalTime = i.ArrivalTime);
        Set("arrival_day", i.ArrivalDay, route.ArrivalDay, () => route.ArrivalDay = i.ArrivalDay);
        Set("start_date", i.StartDate, route.StartDate, () => route.StartDate = i.StartDate);
        Set("end_date", i.EndDate, route.EndDate, () => route.EndDate = i.EndDate);
        Set("partial_cancellation_allowed", i.PartialCancellationAllowed, route.PartialCancellationAllowed, () => route.PartialCancellationAllowed = i.PartialCancellationAllowed!.Value);
        Set("primary_pax_cancellable", i.PrimaryPaxCancellable, route.PrimaryPaxCancellable, () => route.PrimaryPaxCancellable = i.PrimaryPaxCancellable!.Value);
        Set("max_seats_per_ticket", i.MaxSeatsPerTicket, route.MaxSeatsPerTicket, () => route.MaxSeatsPerTicket = i.MaxSeatsPerTicket!.Value);
        Set("update_cutoff_minutes", i.UpdateCutoffMinutes, route.UpdateCutoffMinutes, () => route.UpdateCutoffMinutes = i.UpdateCutoffMinutes!.Value);
        if (i.DistanceKm is < 0 or > 10000) throw new GdsException("VALIDATION", "KMs must be 0-10000");
        Set("distance_km", i.DistanceKm, route.DistanceKm, () => route.DistanceKm = i.DistanceKm);
        if (i.Settings is not null)
        {
            var merged = RouteSettings.Merge(route.SettingsJson, i.Settings, out var settingErrors);
            if (settingErrors.Count > 0) throw new GdsException("VALIDATION", string.Join("; ", settingErrors));
            if (merged != route.SettingsJson) { changes["settings"] = new { changed = i.Settings.Select(p => p.Key).ToList() }; route.SettingsJson = merged; }
        }
        if (i.RefundSlabs is not null)
        {
            if (i.RefundSlabs.Any(s => s.HoursBefore < 0 || s.RefundPercent is < 0 or > 100)) throw new GdsException("VALIDATION", "Refund slabs need hours >= 0 and refund 0-100%");
            if (i.RefundSlabs.GroupBy(s => s.HoursBefore).Any(g => g.Count() > 1)) throw new GdsException("VALIDATION", "Duplicate refund slab hours");
            db.RefundSlabs.RemoveRange(route.RefundSlabs);
            route.RefundSlabs = i.RefundSlabs.Select(s => new RefundSlab { RouteId = routeId, HoursBefore = s.HoursBefore, RefundPercent = s.RefundPercent }).ToList();
            changes["refund_slabs"] = new { changed = true };
        }
        if (changes.Count == 0) return route;
        Audit(actor, "ROUTE_UPDATE", "route", routeId.ToString(), changes);
        await db.SaveChangesAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(5.5));
        foreach (var id in await db.Trips.Where(t => t.RouteId == routeId && t.TravelDate >= today).Select(t => t.Id).ToListAsync())
            await inventory.InvalidateTripAsync(id);
        return route;
    }

    public async Task<int> UnblockSeatAsync(long tripId, string seat, string actor)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var trip = await db.Trips.FromSqlInterpolated($"SELECT * FROM trips WHERE id = {tripId} AND tenant_id = {T} FOR UPDATE").IgnoreQueryFilters().FirstOrDefaultAsync()
                   ?? throw new GdsException("SERVICE_NOT_FOUND", "Service not found", 404);
        var rows = await db.SeatAllocations.Where(a => a.TripId == tripId && a.IsActive && a.Kind == AllocationKind.Blocked && a.SeatCode == seat).ToListAsync();
        if (rows.Count == 0) throw new GdsException("NOT_BLOCKED", "Seat is not blocked", 404);
        // A standing route block released on one departure stays released there (legacy schedule.unblocked).
        foreach (var r in rows) { r.IsActive = false; r.ReleasedAt = Now; r.Reason = r.Reason?.StartsWith(RouteEditService.BlockReasonPrefix) == true ? r.Reason + ":unblocked" : "unblocked"; }
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
            if (!RouteSettings.Runs(route.SettingsJson, d, route.StartDate)) continue;
            var id = long.Parse($"1000{d:yyMMdd}{routeId:000}"); // legacy schedule id scheme
            created += await db.Database.ExecuteSqlInterpolatedAsync($@"
INSERT INTO trips (id, tenant_id, route_id, travel_date, status, bookable) VALUES ({id}, {T}, {routeId}, {d}, 'active', true)
ON CONFLICT DO NOTHING");
        }
        Audit(actor, "TRIPS_GENERATE", "route", routeId.ToString(), new { i.From, i.To, created });
        await db.SaveChangesAsync();
        if (created > 0) await routeEdit.ApplyBlocksToNewTripsAsync(routeId);
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
