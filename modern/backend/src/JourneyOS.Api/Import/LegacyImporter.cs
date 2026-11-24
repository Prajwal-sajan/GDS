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
            if (existingCoaches.Contains(id))
            {
                if (await db.CoachTemplates.FirstOrDefaultAsync(x => x.Id == id) is { } ex) ApplyCoach(ex, c);
                continue;
            }
            var busType = Str(c, "bus_type") ?? "";
            var t = new CoachTemplate
            {
                Id = id, TenantId = tenant.Id, Name = Str(c, "name") ?? "", BusType = busType, Pattern = Str(c, "pattern") ?? "",
                IsAc = busType.Contains("A/C", StringComparison.OrdinalIgnoreCase) && !busType.Contains("Non", StringComparison.OrdinalIgnoreCase),
            };
            ApplyCoach(t, c);
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
            if (existingRoutes.Contains(id))
            {
                // Backfill the legacy header fields on routes imported before they were modelled (idempotent).
                var existing = await db.Routes.Include(x => x.Stages).FirstAsync(x => x.Id == id);
                ApplyHeader(existing, r);
                foreach (var s in r.GetProperty("stages").EnumerateArray())
                    if (existing.Stages.FirstOrDefault(x => x.Id == s.GetProperty("id").GetInt64()) is { } st) ApplyMetro(st, s);
                continue;
            }
            var route = new Route
            {
                Id = id, TenantId = tenant.Id, ServiceNumber = Str(r, "service_number") ?? id.ToString(), Name = Str(r, "name") ?? "",
                CoachTemplateId = r.GetProperty("coach_template_id").GetInt64(), DepartureTime = TimeOnly.Parse(Str(r, "departure_time")!),
                Status = Str(r, "status") ?? "active",
            };
            ApplyHeader(route, r);
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
                var stage = new RouteStage
                {
                    Id = s.GetProperty("id").GetInt64(), CityId = cityId, StopSequence = seq, Kind = kind, Name = Str(s, "name") ?? "",
                    Address = Str(s, "address"), Landmark = Str(s, "landmark"), ContactNumber = Str(s, "contact_number"),
                    Lat = Dec(s, "lat"), Lng = Dec(s, "lng"), Day = Int(s, "day") ?? 1, Time = TimeOnly.Parse(Str(s, "time")!),
                    Prime = primeSeen.Add((cityId, kind)), // legacy has no prime flag: first stage per city/kind
                };
                ApplyMetro(stage, s);
                route.Stages.Add(stage);
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
            if (existingVehicles.Contains(id))
            {
                if (await db.Vehicles.FirstOrDefaultAsync(x => x.Id == id) is { } ex) ApplyVehicle(ex, v);
                continue;
            }
            var nv = new Vehicle
            {
                Id = id, TenantId = tenant.Id, RegistrationNumber = Str(v, "registration_number")!, CoachTemplateId = v.TryGetProperty("coach_template_id", out var ct) && ct.ValueKind == JsonValueKind.Number ? ct.GetInt64() : null,
                Status = Str(v, "status") ?? "active", ModelName = Str(v, "model_name"), ManufactureYear = Int(v, "manufacture_year"), OwnershipType = Str(v, "ownership_type"),
                PhoneNumber = Str(v, "phone_number"), GpsEnabled = v.TryGetProperty("gps_enabled", out var g) && g.ValueKind == JsonValueKind.True,
                InsuranceExpiry = Date(v, "insurance_expiry"), PermitExpiry = Date(v, "permit_expiry"), FitnessExpiry = Date(v, "fitness_expiry"), PucExpiry = Date(v, "puc_expiry"),
            };
            ApplyVehicle(nv, v);
            db.Vehicles.Add(nv);
        }
        var existingStaff = await db.Staff.Select(v => v.Id).ToHashSetAsync();
        foreach (var s in root.GetProperty("staff").EnumerateArray())
        {
            var id = s.GetProperty("id").GetInt64();
            if (existingStaff.Contains(id))
            {
                if (await db.Staff.FirstOrDefaultAsync(x => x.Id == id) is { } ex) { ex.Email = Str(s, "email"); ex.BloodGroup = Str(s, "blood_group"); ex.JoiningDate = Date(s, "joining_date"); }
                continue;
            }
            db.Staff.Add(new Staff
            {
                Email = Str(s, "email"), BloodGroup = Str(s, "blood_group"), JoiningDate = Date(s, "joining_date"),
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
                BookedBy = b.TryGetProperty("booked_by", out var bb) && bb.ValueKind == JsonValueKind.Object ? Str(bb, "name") : null,
                AgentPhone = Str(b, "agent_phone"),
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
        await ImportBusinessAsync(root, tenant.Id);
        return new Report(cityCount, coachCount, routeCount, tripCount, bookingCount, paxCount, skipped);
    }

    /// <summary>Legacy role → modern role. Unknown roles become viewer (least privilege).</summary>
    public static string MapRole(string? legacy) => legacy switch
    {
        "owner" => "owner",
        "manager" => "admin",
        "accountant" => "accounts",
        "booking_executive" or "pickup_manager" => "ops",
        "agent" => "agent",
        _ => "viewer",
    };

    /// <summary>CRM, accounts, IAM and compliance collections. Each collection is imported once (skipped if the tenant already has rows).</summary>
    private async Task ImportBusinessAsync(JsonElement root, long tenantId)
    {
        IEnumerable<JsonElement> Col(string name) => root.TryGetProperty(name, out var a) && a.ValueKind == JsonValueKind.Array ? a.EnumerateArray() : [];
        static DateTime Ts(string? s) => s is not null && DateTime.TryParse(s, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out var d) ? d : DateTime.UtcNow;
        long? L(JsonElement e, string p) => e.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt64() : null;

        var phones = await db.Customers.Select(c => c.Phone).ToHashSetAsync();
        // Route expense templates (legacy route.expenses.fixed/running, per_day ≙ per scheduled trip-day)
        var routesWithTemplate = await db.Set<RouteExpenseItem>().Select(x => x.RouteId).Distinct().ToHashSetAsync();
        var knownRoutes = await db.Routes.Select(r => r.Id).ToHashSetAsync();
        foreach (var r in Col("routes"))
        {
            if (L(r, "id") is not { } rid || !knownRoutes.Contains(rid) || routesWithTemplate.Contains(rid)) continue;
            if (!r.TryGetProperty("expenses", out var ex) || ex.ValueKind != JsonValueKind.Object) continue;
            var seen = new HashSet<(string, string)>();
            foreach (var type in new[] { "fixed", "running" })
                if (ex.TryGetProperty(type, out var arr) && arr.ValueKind == JsonValueKind.Array)
                    foreach (var it in arr.EnumerateArray())
                    {
                        var label = Str(it, "label") ?? Str(it, "key") ?? "";
                        var key = Reports.ReportsService.ExpenseKey(Str(it, "key") ?? label);
                        if (key.Length == 0 || Dec(it, "per_day") is not >= 0 || !seen.Add((type, key))) continue;
                        db.Set<RouteExpenseItem>().Add(new RouteExpenseItem { RouteId = rid, Type = type, Key = key, Label = label, PerTrip = Dec(it, "per_day")!.Value });
                    }
        }
        foreach (var c in Col("customers"))
        {
            var phone = Str(c, "phone");
            if (phone is null || !phones.Add(phone)) continue;
            db.Customers.Add(new Customer { TenantId = tenantId, Phone = phone, Name = Str(c, "name") ?? "", Email = Str(c, "email"), Tier = Str(c, "tier") ?? "Bronze", Miles = Int(c, "miles") ?? 0, CreatedAt = Ts(Str(c, "created_at")) });
        }
        var userPhones = await db.Users.Select(u => u.Phone).ToHashSetAsync();
        foreach (var u in Col("users"))
        {
            var phone = Str(u, "phone");
            if (phone is null || !userPhones.Add(phone)) continue;
            db.Users.Add(new AppUser
            {
                TenantId = tenantId, Phone = phone, Name = Str(u, "name") ?? "", Email = Str(u, "email"), LegacyRole = Str(u, "role"), Role = MapRole(Str(u, "role")),
                Status = Str(u, "status") == "INACTIVE" ? "INACTIVE" : "ACTIVE", CommissionPct = Dec(u, "commission_pct"), CreditLimit = Dec(u, "credit_limit"),
                CreatedAt = Ts(Str(u, "created_at")), // no password: legacy used OTP; an admin must set one (see RUNBOOK)
            });
        }
        var branchIds = await db.Branches.Select(b => b.Id).ToHashSetAsync();
        foreach (var b in Col("branches"))
            if (L(b, "id") is { } id && branchIds.Add(id))
                db.Branches.Add(new Branch { Id = id, TenantId = tenantId, Name = Str(b, "name") ?? "", CityId = L(b, "city_id"), Address = Str(b, "address"), Phone = Str(b, "phone") });

        if (!await db.ChatMessages.AnyAsync())
            foreach (var m in Col("messages"))
                db.ChatMessages.Add(new ChatMessage
                {
                    TenantId = tenantId, ConversationId = Str(m, "conversation_id") ?? "", Direction = Str(m, "direction") == "out" ? "out" : "in", Channel = Str(m, "channel") ?? "whatsapp",
                    Text = Str(m, "text") ?? "", Phone = Str(m, "phone") ?? "", Ts = Ts(Str(m, "ts")), Read = m.TryGetProperty("read", out var r) && r.ValueKind == JsonValueKind.True,
                    By = Str(m, "by"), DeliveryStatus = Str(m, "direction") == "out" ? "recorded" : "received",
                });
        if (!await db.ChatBlocks.AnyAsync())
            foreach (var bl in Col("chat_blocks").GroupBy(x => Str(x, "phone")).Where(g => g.Key is not null).Select(g => g.First()))
                db.ChatBlocks.Add(new ChatBlock { TenantId = tenantId, Phone = Str(bl, "phone")!, Reason = Str(bl, "reason") ?? "spam", By = Str(bl, "by") ?? "legacy", At = Ts(Str(bl, "at")) });
        if (!await db.CallLogs.AnyAsync())
            foreach (var c in Col("calls"))
                db.CallLogs.Add(new CallLog
                {
                    TenantId = tenantId, Direction = Str(c, "direction") == "incoming" ? "incoming" : "outgoing", Kind = Str(c, "kind") ?? "manual", Phone = Str(c, "phone") ?? "",
                    PassengerName = Str(c, "passenger_name"), Pnr = Str(c, "pnr"), TripId = L(c, "schedule_id"), Status = Str(c, "status") ?? "logged", DurationS = Int(c, "duration_s") ?? 0,
                    Notes = Str(c, "notes"), Agent = Str(c, "agent") ?? "", Ts = Ts(Str(c, "ts")),
                });
        if (!await db.OtaRatings.AnyAsync())
            foreach (var x in Col("ota_ratings"))
            {
                var fu = x.TryGetProperty("follow_up", out var f) && f.ValueKind == JsonValueKind.Object ? f : default;
                db.OtaRatings.Add(new OtaRating
                {
                    TenantId = tenantId, Ota = Str(x, "ota") ?? "", Pnr = Str(x, "pnr"), PassengerName = Str(x, "passenger_name"), Phone = Str(x, "phone"), TripId = L(x, "schedule_id"),
                    TravelAt = Date(x, "travel_at"), Rating = Int(x, "rating") ?? 0, RatedAt = Date(x, "rated_at") ?? DateOnly.FromDateTime(DateTime.UtcNow), Review = Str(x, "review"),
                    OperatorReply = Str(x, "operator_reply"), RepliedBy = Str(x, "replied_by"),
                    FollowUpStatus = fu.ValueKind == JsonValueKind.Object ? Str(fu, "status") : null, FollowUpNote = fu.ValueKind == JsonValueKind.Object ? Str(fu, "note") : null,
                });
            }
        if (!await db.LedgerEntries.AnyAsync())
            foreach (var e in Col("ledger"))
            {
                var key = Str(e, "channel_key"); var amt = Dec(e, "amount");
                if (key is null || amt is not > 0) continue;
                db.LedgerEntries.Add(new LedgerEntry
                {
                    TenantId = tenantId, ChannelKey = key, ChannelType = Str(e, "channel_type") ?? key.Split(':')[0], Type = Str(e, "type") == "debit" ? "debit" : "credit",
                    Amount = amt.Value, Note = Str(e, "note") ?? "", Date = Date(e, "date") ?? DateOnly.FromDateTime(DateTime.UtcNow), By = Str(e, "by") ?? "legacy", CreatedAt = Ts(Str(e, "created_at")),
                });
            }
        if (!await db.ComplianceDocuments.AnyAsync())
            foreach (var d in Col("documents"))
                if (L(d, "owner_id") is { } oid)
                    db.ComplianceDocuments.Add(new ComplianceDocument
                    {
                        TenantId = tenantId, OwnerType = Str(d, "owner_type") ?? "vehicle", OwnerId = oid, DocumentType = Str(d, "document_type") ?? "",
                        DocumentName = Str(d, "document_name") ?? "", ExpiryDate = Date(d, "expiry_date"), Category = Str(d, "category"), VerificationStatus = Str(d, "verification_status"),
                    });
        if (!await db.TripExpenses.AnyAsync())
            foreach (var x in Col("trip_expenses"))
                if (L(x, "schedule_id") is { } sid && Dec(x, "amount") is >= 0 and var amt)
                    db.TripExpenses.Add(new TripExpense { TenantId = tenantId, TripId = sid, Category = Str(x, "label") ?? Str(x, "key") ?? "other", Amount = amt, Note = Str(x, "source"), By = "legacy", At = Ts(Str(x, "created_at")) });
        if (!await db.SarathiConversations.AnyAsync())
            foreach (var s in Col("sarathi"))
                db.SarathiConversations.Add(new SarathiConversation
                {
                    TenantId = tenantId, Owner = $"legacy-user:{L(s, "user_id")}", Title = Str(s, "title") ?? "",
                    MessagesJson = s.TryGetProperty("messages", out var ms) ? ms.GetRawText() : "[]", CreatedAt = Ts(Str(s, "created_at")), UpdatedAt = Ts(Str(s, "created_at")),
                });
        await db.SaveChangesAsync();
    }

    private static string? Str(JsonElement e, string p) => e.TryGetProperty(p, out var v) && v.ValueKind != JsonValueKind.Null ? v.ToString() : null;

    private static void ApplyCoach(CoachTemplate t, JsonElement c)
    {
        t.Status = Str(c, "status") ?? "active";
        t.AmenitiesJson = c.TryGetProperty("amenities", out var a) && a.ValueKind == JsonValueKind.Array ? a.GetRawText() : "[]";
    }

    private static void ApplyVehicle(Vehicle x, JsonElement v)
    {
        x.VehicleRole = Str(v, "vehicle_role");
        x.OdometerReading = Int(v, "odometer_reading");
        x.PositionJson = v.TryGetProperty("position", out var p) && p.ValueKind == JsonValueKind.Object ? p.GetRawText() : null;
        x.HealthJson = v.TryGetProperty("health", out var h) && h.ValueKind == JsonValueKind.Object ? h.GetRawText() : null;
    }

    private static void ApplyMetro(RouteStage stage, JsonElement s)
    {
        stage.PickupType = Str(s, "pickup_type");
        stage.ExchangePoint = Str(s, "exchange_point");
        stage.ExchangeTime = TimeOnly.TryParse(Str(s, "exchange_time"), out var t) ? t : null;
        stage.MetroDescription = Str(s, "metro_description");
    }

    private static void ApplyHeader(Route route, JsonElement r)
    {
        route.AltName = Str(r, "alt_name");
        route.ArrivalTime = TimeOnly.TryParse(Str(r, "arrival_time"), out var at) ? at : null;
        route.ArrivalDay = Int(r, "arrival_day");
        route.DurationMinutes = Int(r, "duration_minutes");
        route.StartDate = DateOnly.TryParse(Str(r, "start_date")?[..Math.Min(10, Str(r, "start_date")!.Length)], out var sd) ? sd : null;
        route.EndDate = DateOnly.TryParse(Str(r, "end_date")?[..Math.Min(10, Str(r, "end_date")!.Length)], out var ed) ? ed : null;
    }
    private static DateOnly? Date(JsonElement e, string p) => Str(e, p) is { Length: >= 10 } s && DateOnly.TryParse(s[..10], out var d) ? d : null;
    private static int? Int(JsonElement e, string p) => e.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : null;
    private static decimal? Dec(JsonElement e, string p) => e.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : null;
}
