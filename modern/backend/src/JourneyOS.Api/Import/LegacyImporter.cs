using System.Text.Json;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Import;

/// <summary>
/// Idempotent, non-destructive import of the legacy JSON store (data/db.json) into PostgreSQL for a
/// development / cutover-rehearsal tenant. Master data is upserted; trips from <c>fromDate</c> onward
/// are imported with their confirmed seats so availability is truthful. The legacy file is only read.
/// </summary>
public sealed class LegacyImporter(GdsDbContext db, TenantContext tenantCtx, ILogger<LegacyImporter> log)
{
    public sealed record Report(int Cities, int Coaches, int Routes, int Trips, int Bookings, int Passengers, int SkippedConflicts);

    public async Task<Report> ImportAsync(string path, string tenantCode, DateOnly fromDate, string? redbusOperatorCode)
    {
        using var doc = JsonDocument.Parse(await File.ReadAllBytesAsync(path));
        var root = doc.RootElement;
        var op = root.GetProperty("_meta").GetProperty("operator");

        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Code == tenantCode);
        if (tenant is null)
        {
            tenant = new Tenant { Code = tenantCode, Name = Str(op, "operator_name") ?? tenantCode, OperatorId = op.GetProperty("operator_id").GetInt64() };
            db.Tenants.Add(tenant);
            await db.SaveChangesAsync();
        }
        tenantCtx.TenantId = tenant.Id;
        if (redbusOperatorCode is not null && !await db.OtaProviders.AnyAsync())
            db.OtaProviders.Add(new OtaProviderConfig { TenantId = tenant.Id, Provider = "REDBUS", OperatorCode = redbusOperatorCode, OutboundEnabled = false });

        // Cities
        var existingCities = await db.Cities.Select(c => c.Id).ToHashSetAsync();
        var cityCount = 0;
        foreach (var c in root.GetProperty("cities").EnumerateArray())
        {
            var id = c.GetProperty("id").GetInt64();
            if (existingCities.Contains(id)) continue;
            db.Cities.Add(new City { Id = id, TenantId = tenant.Id, Name = Str(c, "name")!, State = Str(c, "state"), Lat = Dec(c, "lat"), Lng = Dec(c, "lng") });
            cityCount++;
        }

        // Coach templates
        var existingCoaches = await db.CoachTemplates.Select(c => c.Id).ToHashSetAsync();
        var coachCount = 0;
        foreach (var c in root.GetProperty("coaches").EnumerateArray())
        {
            var id = c.GetProperty("id").GetInt64();
            if (existingCoaches.Contains(id)) continue;
            var busType = Str(c, "bus_type") ?? "";
            var t = new CoachTemplate
            {
                Id = id, TenantId = tenant.Id, Name = Str(c, "name") ?? "", BusType = busType, Pattern = Str(c, "pattern") ?? "",
                IsAc = busType.Contains("A/C", StringComparison.OrdinalIgnoreCase) && !busType.Contains("Non", StringComparison.OrdinalIgnoreCase),
            };
            foreach (var deck in c.GetProperty("layout").GetProperty("decks").EnumerateArray())
            {
                var deckName = Str(deck, "deck") ?? "LOWER";
                var seats = deck.GetProperty("seats").EnumerateArray().ToList();
                var maxCol = seats.Max(s => s.GetProperty("col").GetInt32());
                foreach (var s in seats)
                {
                    var col = s.GetProperty("col").GetInt32();
                    t.Seats.Add(new CoachSeat
                    {
                        Code = Str(s, "code")!, Deck = deckName, Row = s.GetProperty("row").GetInt32(), Col = col,
                        Width = Int(s, "w") ?? 1, Length = Int(s, "h") ?? 1, SeatType = Str(s, "type") ?? "seater", IsWindow = col == 0 || col == maxCol,
                    });
                }
            }
            db.CoachTemplates.Add(t);
            coachCount++;
        }
        await db.SaveChangesAsync();

        // Routes
        var existingRoutes = await db.Routes.Select(r => r.Id).ToHashSetAsync();
        var routeCount = 0;
        var routeSeatBlocks = new Dictionary<long, List<string>>();
        foreach (var r in root.GetProperty("routes").EnumerateArray())
        {
            var id = r.GetProperty("id").GetInt64();
            routeSeatBlocks[id] = r.TryGetProperty("seat_blocks", out var sb)
                ? sb.EnumerateArray().Where(b => b.GetProperty("from").ValueKind == JsonValueKind.Null).SelectMany(b => b.GetProperty("seats").EnumerateArray().Select(x => x.GetString()!)).ToList()
                : [];
            if (existingRoutes.Contains(id)) continue;
            var route = new Route
            {
                Id = id, TenantId = tenant.Id, ServiceNumber = Str(r, "service_number") ?? id.ToString(), Name = Str(r, "name") ?? "",
                CoachTemplateId = r.GetProperty("coach_template_id").GetInt64(), DepartureTime = TimeOnly.Parse(Str(r, "departure_time")!),
                Status = Str(r, "status") ?? "active",
            };
            var seqByCity = new Dictionary<long, int>();
            foreach (var v in r.GetProperty("via_cities").EnumerateArray().OrderBy(v => v.GetProperty("order").GetInt32()))
            {
                var seq = v.GetProperty("order").GetInt32();
                var cityId = v.GetProperty("city_id").GetInt64();
                seqByCity[cityId] = seq;
                route.Stops.Add(new RouteStop { Sequence = seq, CityId = cityId, Day = Int(v, "day") ?? 1, Time = TimeOnly.Parse(Str(v, "time")!) });
            }
            var primeSeen = new HashSet<(long, string)>();
            foreach (var s in r.GetProperty("stages").EnumerateArray())
            {
                var type = Str(s, "type");
                if (type is not ("pickup" or "drop")) continue; // meal/rest "break" stops: not boarding inventory (tracked as parity gap)
                var cityId = s.GetProperty("city_id").GetInt64();
                if (!seqByCity.TryGetValue(cityId, out var seq)) { log.LogWarning("Stage {Id} city not on route {Route}", s.GetProperty("id"), id); continue; }
                var kind = type;
                route.Stages.Add(new RouteStage
                {
                    Id = s.GetProperty("id").GetInt64(), CityId = cityId, StopSequence = seq, Kind = kind, Name = Str(s, "name") ?? "",
                    Address = Str(s, "address"), Landmark = Str(s, "landmark"), ContactNumber = Str(s, "contact_number"),
                    Lat = Dec(s, "lat"), Lng = Dec(s, "lng"), Day = Int(s, "day") ?? 1, Time = TimeOnly.Parse(Str(s, "time")!),
                    Prime = primeSeen.Add((cityId, kind)), // legacy has no prime flag: first stage per city/kind
                });
            }
            foreach (var f in r.GetProperty("fares").EnumerateArray())
            {
                if (!seqByCity.TryGetValue(f.GetProperty("from_city_id").GetInt64(), out var a) || !seqByCity.TryGetValue(f.GetProperty("to_city_id").GetInt64(), out var b) || a >= b) continue;
                route.Fares.Add(new RouteFare { FromSequence = a, ToSequence = b, Seater = Dec(f, "seater") ?? 0, SleeperLower = Dec(f, "sleeper_lower") ?? 0, SleeperUpper = Dec(f, "sleeper_upper") ?? 0 });
            }
            if (r.TryGetProperty("refund_slabs", out var slabs))
                foreach (var s in slabs.EnumerateArray())
                    route.RefundSlabs.Add(new RefundSlab { HoursBefore = s.GetProperty("hours_before").GetInt32(), RefundPercent = s.GetProperty("refund_pct").GetDecimal() });
            if (r.TryGetProperty("seat_fare_rules", out var rules))
                foreach (var s in rules.EnumerateArray())
                    route.SeatFareRules.Add(new SeatFareRule
                    {
                        Kind = Str(s, "kind") ?? "amount", Label = Str(s, "label") ?? "", Value = Dec(s, "value") ?? 0,
                        Seats = s.GetProperty("seats").EnumerateArray().Select(x => x.GetString()!).ToArray(),
                        Days = s.TryGetProperty("days", out var d) ? d.EnumerateArray().Select(x => x.ToString()).ToArray() : [],
                    });
            db.Routes.Add(route);
            routeCount++;
        }
        await db.SaveChangesAsync();

        // Vehicles & staff
        var existingVehicles = await db.Vehicles.Select(v => v.Id).ToHashSetAsync();
        foreach (var v in root.GetProperty("vehicles").EnumerateArray())
        {
            var id = v.GetProperty("id").GetInt64();
            if (existingVehicles.Contains(id)) continue;
            db.Vehicles.Add(new Vehicle
            {
                Id = id, TenantId = tenant.Id, RegistrationNumber = Str(v, "registration_number")!, CoachTemplateId = v.TryGetProperty("coach_template_id", out var ct) && ct.ValueKind == JsonValueKind.Number ? ct.GetInt64() : null,
                Status = Str(v, "status") ?? "active", ModelName = Str(v, "model_name"), ManufactureYear = Int(v, "manufacture_year"), OwnershipType = Str(v, "ownership_type"),
                PhoneNumber = Str(v, "phone_number"), GpsEnabled = v.TryGetProperty("gps_enabled", out var g) && g.ValueKind == JsonValueKind.True,
                InsuranceExpiry = Date(v, "insurance_expiry"), PermitExpiry = Date(v, "permit_expiry"), FitnessExpiry = Date(v, "fitness_expiry"), PucExpiry = Date(v, "puc_expiry"),
            });
        }
        var existingStaff = await db.Staff.Select(v => v.Id).ToHashSetAsync();
        foreach (var s in root.GetProperty("staff").EnumerateArray())
        {
            var id = s.GetProperty("id").GetInt64();
            if (existingStaff.Contains(id)) continue;
            db.Staff.Add(new Staff
            {
                Id = id, TenantId = tenant.Id, Name = Str(s, "name") ?? "", Phone = Str(s, "phone") ?? "", Role = Str(s, "role") ?? "driver", Status = Str(s, "status") ?? "active",
                Designation = Str(s, "designation"), LicenseNumber = Str(s, "license_number"), LicenseExpiry = Date(s, "license_expiry"),
                SalaryType = Str(s, "salary_type"), SalaryAmount = Dec(s, "salary_amount"), BataPerTrip = Dec(s, "bata_per_trip"),
            });
        }
        await db.SaveChangesAsync();
        var vehicleIds = await db.Vehicles.Select(v => v.Id).ToHashSetAsync();
        var staffIds = await db.Staff.Select(v => v.Id).ToHashSetAsync();
        var pendingAssignments = new List<TripAssignment>();

        // Trips + live inventory
        var routes = await db.Routes.Include(r => r.Stops).Include(r => r.Stages).Include(r => r.CoachTemplate!).ThenInclude(c => c.Seats).ToDictionaryAsync(r => r.Id);
        var existingTrips = await db.Trips.Select(t => t.Id).ToHashSetAsync();
        var now = DateTime.UtcNow;
        int tripCount = 0, bookingCount = 0, paxCount = 0, skipped = 0;
        var newTrips = new HashSet<long>();
        var pendingBlocks = new List<SeatAllocation>();
        foreach (var s in root.GetProperty("schedules").EnumerateArray())
        {
            var id = s.GetProperty("id").GetInt64();
            var date = DateOnly.Parse(Str(s, "travel_date")!);
            if (date < fromDate || existingTrips.Contains(id)) continue;
            var routeId = s.GetProperty("route_id").GetInt64();
            if (!routes.TryGetValue(routeId, out var route)) continue;
            var active = Str(s, "status") == "active" && s.GetProperty("is_active").GetBoolean();
            var trip = new Trip { Id = id, TenantId = tenant.Id, RouteId = routeId, TravelDate = date, Status = active ? "active" : "cancelled",
                Bookable = active && !(s.TryGetProperty("manually_disabled", out var md) && md.GetBoolean()) };
            db.Trips.Add(trip);
            newTrips.Add(id);
            if (s.TryGetProperty("vehicle_id", out var vid) && vid.ValueKind == JsonValueKind.Number && vehicleIds.Contains(vid.GetInt64()))
                pendingAssignments.Add(new TripAssignment { TenantId = tenant.Id, TripId = id, Kind = "vehicle", VehicleId = vid.GetInt64(), Role = "vehicle", AssignedAt = now });
            if (s.TryGetProperty("crew", out var crew))
            {
                var n = new Dictionary<string, int>();
                foreach (var c in crew.EnumerateArray())
                {
                    var sid = c.GetProperty("staff_id").GetInt64();
                    if (!staffIds.Contains(sid)) continue;
                    var role = Str(c, "role") ?? "Crew";
                    n[role] = n.GetValueOrDefault(role) + 1;
                    pendingAssignments.Add(new TripAssignment { TenantId = tenant.Id, TripId = id, Kind = "staff", StaffId = sid, Role = n[role] == 1 ? role : $"{role} {n[role]}", AssignedAt = now });
                }
            }
            var last = route.Stops.Max(x => x.Sequence);
            var blocked = routeSeatBlocks.GetValueOrDefault(routeId) ?? [];
            if (s.TryGetProperty("seat_blocks", out var sbs))
                blocked = blocked.Concat(sbs.EnumerateArray().SelectMany(b => b.TryGetProperty("seats", out var x) ? x.EnumerateArray().Select(y => y.GetString()!) : [])).ToList();
            foreach (var code in blocked.Distinct())
            {
                var seat = route.CoachTemplate!.Seats.FirstOrDefault(x => x.Code == code);
                if (seat is null) continue;
                pendingBlocks.Add(new SeatAllocation { TenantId = tenant.Id, TripId = id, CoachSeatId = seat.Id, SeatCode = code, FromSeq = 0, ToSeq = last, Kind = AllocationKind.Blocked, Reason = "legacy_block", CreatedAt = now });
            }
            tripCount++;
        }
        // seat_allocations → trips FK is SQL-only, so EF cannot order these inserts: save trips first.
        await db.SaveChangesAsync();
        db.SeatAllocations.AddRange(pendingBlocks);
        db.TripAssignments.AddRange(pendingAssignments);
        await db.SaveChangesAsync();

        var existingPnrs = await db.Bookings.Select(b => b.Pnr).ToHashSetAsync();
        foreach (var b in root.GetProperty("bookings").EnumerateArray())
        {
            var tripId = b.GetProperty("schedule_id").GetInt64();
            var legacyStatus = Str(b, "status");
            if (!newTrips.Contains(tripId) || legacyStatus is not ("confirmed" or "cancelled")) continue;
            var cancelled = legacyStatus == "cancelled";
            var pnr = Str(b, "pnr")!;
            if (existingPnrs.Contains(pnr)) continue;
            var route = routes[b.GetProperty("route_id").GetInt64()];
            var bpId = b.GetProperty("boarding_stage_id").GetInt64();
            var dpId = b.GetProperty("dropping_stage_id").GetInt64();
            var bp = route.Stages.FirstOrDefault(x => x.Id == bpId);
            var dp = route.Stages.FirstOrDefault(x => x.Id == dpId);
            if (bp is null || dp is null || bp.StopSequence >= dp.StopSequence) { skipped++; continue; }
            var fare = b.GetProperty("fare");
            var contact = b.GetProperty("contact");
            var booking = new Booking
            {
                TenantId = tenant.Id, Pnr = pnr, TripId = tripId, Channel = Str(b, "channel") ?? Str(b, "source") ?? "legacy", Status = cancelled ? "CANCELLED" : "CONFIRMED",
                BoardingStageId = bp.Id, DroppingStageId = dp.Id, FromSeq = bp.StopSequence, ToSeq = dp.StopSequence,
                ContactMobile = Str(contact, "phone"), ContactEmail = Str(contact, "email"), TotalFare = Dec(fare, "total") ?? 0,
                CancellationPolicy = Inventory.CancellationPolicy.FromRefundSlabs(await db.RefundSlabs.Where(x => x.RouteId == route.Id).ToListAsync()),
                DateOfIssue = DateTime.Parse(Str(b, "booked_at") ?? Str(b, "created_at")!).ToUniversalTime(),
            };
            var first = true;
            foreach (var p in b.GetProperty("passengers").EnumerateArray())
            {
                if (Str(p, "status") == "cancelled" && !cancelled) continue;
                var seat = route.CoachTemplate!.Seats.FirstOrDefault(x => x.Code == Str(p, "seat"));
                if (seat is null) continue;
                booking.Passengers.Add(new BookingPassenger
                {
                    CoachSeatId = seat.Id, SeatCode = seat.Code, Name = Str(p, "name") ?? "", Age = Int(p, "age") ?? 0, Gender = Str(p, "gender") ?? "",
                    Fare = Dec(p, "fare") ?? 0, BaseFare = Dec(p, "fare") ?? 0, IsPrimary = first, Mobile = first ? booking.ContactMobile : null,
                    BoardingStatus = Str(p, "status") switch { "dropped" => "Boarded", "no_show" => "No-Show", _ => "Yet-To-Board" },
                    Status = cancelled ? "CANCELLED" : "CONFIRMED",
                });
                first = false;
            }
            if (booking.Passengers.Count == 0) continue;
            await using var tx = await db.Database.BeginTransactionAsync();
            try
            {
                db.Bookings.Add(booking);
                await db.SaveChangesAsync();
                db.BookingFinances.Add(new BookingFinance
                {
                    BookingId = booking.Id, NetFare = Dec(fare, "net"), Gst = Dec(fare, "gst"),
                    OtaCommission = Dec(fare, "ota_commission") ?? Dec(fare, "commission"), OtaCommissionGst = Dec(fare, "ota_commission_gst") ?? Dec(fare, "gst_on_commission"),
                    OperatorOffer = Dec(fare, "operator_offer"), OtaTakeHome = Dec(fare, "ota_take_home"),
                });
                var pay = Str(b, "payment");
                db.Payments.Add(new Payment
                {
                    TenantId = tenant.Id, BookingId = booking.Id, Amount = booking.TotalFare, Method = Str(b, "payment_method") ?? booking.Channel,
                    Status = pay switch { "paid" => "PAID", "pending" => "PENDING", _ => booking.Channel is "redbus" or "abhibus" or "paytm" ? "RECEIVABLE" : "PENDING" },
                    Reference = "legacy", CreatedAt = booking.DateOfIssue,
                });
                foreach (var p in booking.Passengers.Where(_ => !cancelled))
                    db.SeatAllocations.Add(new SeatAllocation { TenantId = tenant.Id, TripId = tripId, CoachSeatId = p.CoachSeatId, SeatCode = p.SeatCode, FromSeq = booking.FromSeq, ToSeq = booking.ToSeq,
                        Kind = AllocationKind.Booked, Gender = p.Gender, BookingPassengerId = p.Id, CreatedAt = now });
                await db.SaveChangesAsync();
                await tx.CommitAsync();
                bookingCount++; paxCount += booking.Passengers.Count;
            }
            catch (DbUpdateException ex)
            {
                // Legacy data contained an overlapping allocation; the new invariant refuses it. Logged for cutover review.
                await tx.RollbackAsync();
                db.ChangeTracker.Clear();
                log.LogWarning("Skipped legacy PNR {Pnr}: {Error}", pnr, ex.InnerException?.Message);
                skipped++;
            }
        }
        return new Report(cityCount, coachCount, routeCount, tripCount, bookingCount, paxCount, skipped);
    }

    private static string? Str(JsonElement e, string p) => e.TryGetProperty(p, out var v) && v.ValueKind != JsonValueKind.Null ? v.ToString() : null;
    private static DateOnly? Date(JsonElement e, string p) => Str(e, p) is { Length: >= 10 } s && DateOnly.TryParse(s[..10], out var d) ? d : null;
    private static int? Int(JsonElement e, string p) => e.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : null;
    private static decimal? Dec(JsonElement e, string p) => e.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : null;
}
