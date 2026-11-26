using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record OperatorCancelInput(List<string>? Seats, string? By, string? Reason, bool Notify);
public sealed record TripDelayInput(int? Minutes, string? Reason, bool Notify);
public sealed record TripNotifyInput(string? Template, List<string>? Pnrs, string? Text);
public sealed record CrewInput(long? StaffId, string? Role, string? PhoneOverride);
public sealed record SyncInput(bool? Enabled);

/// <summary>
/// Schedule overlay operator actions (legacy server/api/ops.js + schedule-update-v51.js):
/// operator ticket cancellation, trip timing change (delay / early), passenger notifications and the
/// Update tab (vehicle + crew + call/cab overrides, Sync with Route). Same validation messages as legacy.
/// No provider is connected: notifications are recorded as outbound chat messages with <c>delivery_verified:false</c>.
/// </summary>
public static partial class TripOpsEndpoints
{
    private static readonly string[] CrewRoles = ["Driver", "Helper", "Attendant", "Conductor", "Pickup Van"];
    private static readonly string[] CallKeys = ["cloud_calling", "number_masking", "direct_to_vehicle", "driver_gps"];
    private static readonly string[] Cab = ["Off", "Pickups", "Drops", "Both"];
    private static readonly string[] Templates = ["ticket_confirmation", "bus_details", "bus_cancellation", "custom"];
    private static GdsException Bad(string m, int status = 400) => new(status switch { 404 => "NOT_FOUND", 409 => "CONFLICT", 403 => "FORBIDDEN", 501 => "NOT_CONNECTED", _ => "VALIDATION" }, m, status);
    private static string Actor(HttpContext h) => h.User.Identity?.Name ?? "system";
    private static void Audit(GdsDbContext db, string actor, string action, long tripId, object data) =>
        db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = actor, Action = action, Entity = "schedule", EntityId = tripId.ToString(CultureInfo.InvariantCulture), DataJson = JsonSerializer.Serialize(data), At = DateTime.UtcNow });
    [GeneratedRegex(@"^\+?[0-9]{10,15}$")] private static partial Regex PhoneRx();
    private static string Clean(string? s) => Regex.Replace(s ?? "", @"[\s()-]", "");

    /// <summary>Legacy D.passengerConvId: 1000_{service}_{date}_{phone}_{ticket}_{seat}.</summary>
    private static string ConvId(Route r, Trip t, Booking b) =>
        $"1000_{r.ServiceNumber}_{t.TravelDate:yyyy-MM-dd}_{b.ContactMobile}_{b.Pnr}_{b.Passengers.FirstOrDefault(p => p.Status == "CONFIRMED")?.SeatCode ?? ""}";

    private static TimeOnly Shift(TimeOnly t, int delta) => t.AddMinutes(delta);

    public static void MapTripOps(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization().WithTags("Schedules");

        // ------------------------------------------------ operator ticket cancellation (legacy POST /bookings/:pnr/cancel)
        g.MapPost("/bookings/{pnr}/cancel", async (string pnr, OperatorCancelInput i, InventoryService inv, GdsDbContext db, HttpContext h) =>
        {
            var seats = (i.Seats ?? []).Where(s => !string.IsNullOrWhiteSpace(s)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            if (seats.Count == 0) throw Bad("Select at least one seat to cancel");
            var by = i.By is "operator" ? "operator" : "passenger";
            var reason = (i.Reason ?? "").Trim();
            if (reason.Length > 300) throw Bad("Reason must be at most 300 characters");
            var r = await inv.CancelAsync(pnr, seats, reason.Length == 0 ? "Operator cancellation" : reason, by == "operator" ? "operator" : "customer", fullRefund: by == "operator");
            var recorded = 0;
            if (i.Notify && r.Booking.ContactMobile is { Length: > 0 } phone)
            {
                var trip = await db.Trips.AsNoTracking().FirstAsync(t => t.Id == r.Booking.TripId);
                var route = await db.Routes.AsNoTracking().FirstAsync(x => x.Id == trip.RouteId);
                var b = await db.Bookings.AsNoTracking().Include(x => x.Passengers).FirstAsync(x => x.Id == r.Booking.Id);
                db.ChatMessages.Add(new ChatMessage { TenantId = db.CurrentTenantId, ConversationId = ConvId(route, trip, b), Direction = "out", Channel = "whatsapp", Phone = phone, Ts = DateTime.UtcNow, Read = true, By = Actor(h),
                    Text = $"Ticket {pnr}: seat(s) {string.Join(", ", seats)} cancelled. Refund ₹{r.Refund:0.##}.", DeliveryStatus = "recorded" });
                await db.SaveChangesAsync();
                recorded = 1;
            }
            return Results.Ok(new { success = true, pnr, status = r.Booking.Status, refund = r.Refund, charge = r.Charge, recorded, delivery_verified = false });
        }).RequireAuthorization(Policies.Operations);

        // ------------------------------------------------ trip timing change (legacy POST /trips/:sid/delay)
        g.MapPost("/trips/{id:long}/delay", async (long id, TripDelayInput i, GdsDbContext db, InventoryService inv, HttpContext h) =>
        {
            var trip = await db.Trips.FirstOrDefaultAsync(t => t.Id == id && t.DeletedAt == null) ?? throw Bad("Trip not found", 404);
            if (trip.Status == "cancelled" || trip.TripStatus == "completed") throw Bad("Cannot adjust a cancelled or completed service", 409);
            var mins = i.Minutes ?? int.MinValue; var reason = (i.Reason ?? "").Trim();
            if (mins == int.MinValue || Math.Abs(mins) > 720) throw Bad("Timing change must be an integer between -720 and +720 minutes");
            if (mins != 0 && reason.Length == 0) throw Bad("Reason is required for a timing change");
            if (reason.Length > 300) throw Bad("Reason must be at most 300 characters");
            var route = await db.Routes.AsNoTracking().FirstAsync(r => r.Id == trip.RouteId);
            var previous = trip.DelayMinutes ?? 0; var delta = mins - previous;
            // Already-departed trips keep their recorded departure (legacy: stops with a GPS stamp are not moved).
            var departed = !string.IsNullOrEmpty(trip.StopEventsJson) && trip.StopEventsJson != "{}" && trip.StopEventsJson != "null";
            if (delta != 0 && !departed) trip.DepartureTime = Shift(trip.DepartureTime ?? route.DepartureTime, delta);
            trip.DelayMinutes = mins; trip.DelayReason = reason.Length == 0 ? null : reason;
            var recorded = 0; var actor = Actor(h);
            if (i.Notify)
            {
                foreach (var b in await db.Bookings.AsNoTracking().Include(b => b.Passengers).Where(b => b.TripId == id && b.Status != "CANCELLED" && b.ContactMobile != null).ToListAsync())
                {
                    db.ChatMessages.Add(new ChatMessage { TenantId = db.CurrentTenantId, ConversationId = ConvId(route, trip, b), Direction = "out", Channel = "whatsapp", Phone = b.ContactMobile!, Ts = DateTime.UtcNow, Read = true, By = actor,
                        Text = $"Your bus {(mins >= 0 ? "is delayed by" : "is early by")} {Math.Abs(mins)} minutes. Reason: {reason}", DeliveryStatus = "recorded" });
                    recorded++;
                }
            }
            Audit(db, actor, "adjust_trip_time", id, new { previous_delay_minutes = previous, delay_minutes = mins, delta_minutes = delta, reason });
            await db.SaveChangesAsync();
            await inv.InvalidateTripAsync(id);
            return Results.Ok(new { success = true, delay_minutes = mins, delta_minutes = delta, adjusted_stops = departed || delta == 0 ? 0 : 1, recorded, notified = recorded, delivery_verified = false });
        }).RequireAuthorization(Policies.Operations);

        // ------------------------------------------------ passenger notifications (legacy POST /trips/:sid/notify)
        g.MapPost("/trips/{id:long}/notify", async (long id, TripNotifyInput i, GdsDbContext db, HttpContext h) =>
        {
            var trip = await db.Trips.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id && t.DeletedAt == null) ?? throw Bad("Trip not found", 404);
            var pnrs = i.Pnrs ?? [];
            if (pnrs.Count == 0 || pnrs.Count > 200) throw Bad("Select at least one passenger PNR (maximum 200)");
            if (!Templates.Contains(i.Template)) throw Bad("Unsupported notification template");
            var text = (i.Text ?? "").Trim();
            if (i.Template is "custom" or "bus_cancellation" && (text.Length == 0 || text.Length > 1000)) throw Bad("Message text is required (maximum 1000 characters)");
            var route = await db.Routes.AsNoTracking().FirstAsync(r => r.Id == trip.RouteId);
            var vid = await db.TripAssignments.Where(a => a.TripId == id && a.IsActive && a.VehicleId != null).Select(a => a.VehicleId).FirstOrDefaultAsync();
            var v = vid is null ? null : await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(x => x.Id == vid);
            var actor = Actor(h); var n = 0;
            foreach (var b in await db.Bookings.AsNoTracking().Include(b => b.Passengers).Where(b => b.TripId == id && b.Status != "CANCELLED" && pnrs.Contains(b.Pnr) && b.ContactMobile != null).ToListAsync())
            {
                var msg = i.Template switch
                {
                    "ticket_confirmation" => $"Ticket {b.Pnr} confirmed. Seats {string.Join(", ", b.Passengers.Where(p => p.Status == "CONFIRMED").Select(p => p.SeatCode))}.",
                    "bus_details" => $"Bus {v?.RegistrationNumber ?? "TBA"} · Driver contact {v?.PhoneNumber ?? ""}. Track: /track/{b.Pnr}",
                    _ => text,
                };
                db.ChatMessages.Add(new ChatMessage { TenantId = db.CurrentTenantId, ConversationId = ConvId(route, trip, b), Direction = "out", Channel = "whatsapp", Phone = b.ContactMobile!, Ts = DateTime.UtcNow, Read = true, By = actor, Text = msg, DeliveryStatus = "recorded" });
                n++;
            }
            Audit(db, actor, "notify", id, new { i.Template, pnrs = pnrs.Count, recorded = n });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, recorded = n, delivery_verified = false });
        }).RequireAuthorization(Policies.Operations);

        // ------------------------------------------------ Update tab (legacy schedule-update-v51)
        g.MapGet("/schedules/{id:long}/update-v51", async (long id, GdsDbContext db, HttpContext h) => Results.Text((await UpdateResponse(db, id, h)).ToJsonString(), "application/json"))
            .RequireAuthorization(Policies.Reports);

        g.MapPut("/schedules/{id:long}/update-v51/assignment", async (long id, JsonObject? body, GdsDbContext db, InventoryService inv, HttpContext h) =>
        {
            var input = body ?? [];
            if (!input.ContainsKey("vehicle_id") || input["crew"] is not JsonArray crewIn) throw Bad("Vehicle and staff selections required");
            if (input.Select(kv => kv.Key).Any(k => k is not ("vehicle_id" or "crew" or "call_settings" or "escalation_contacts" or "cab_mode"))) throw Bad("Unknown assignment setting");
            await using var tx = await db.Database.BeginTransactionAsync();
            var trip = await db.Trips.FirstOrDefaultAsync(t => t.Id == id && t.DeletedAt == null) ?? throw Bad("Schedule not found", 404);
            var route = await db.Routes.AsNoTracking().FirstAsync(r => r.Id == trip.RouteId);
            var vehicle = await VehicleAsync(db, input["vehicle_id"]);
            if (vehicle is not null && vehicle.CoachTemplateId != route.CoachTemplateId)
                throw Bad("Coach transfer changes booked seat geometry. Use an authorized seat migration workflow instead.", 409);
            var crew = await ValidateCrewAsync(db, crewIn);
            var settings = Settings(trip);
            if (input.ContainsKey("call_settings")) settings["call_settings"] = ValidateCalls(input["call_settings"]);
            if (input.ContainsKey("escalation_contacts")) settings["escalation_contacts"] = ValidateEscalations(input["escalation_contacts"]);
            if (input.ContainsKey("cab_mode"))
            {
                var cab = input["cab_mode"] is JsonValue cv && cv.TryGetValue<string>(out var c) ? c : null;
                if (cab is null || !Cab.Contains(cab)) throw Bad("Invalid cab selection");
                settings["cab_mode"] = cab;
            }
            // Same-day conflicts (a bus / staff member can run one service per date).
            var sameDay = db.Trips.Where(t => t.TravelDate == trip.TravelDate && t.Id != id && t.Status == "active" && t.DeletedAt == null).Select(t => t.Id);
            if (vehicle is not null && await db.TripAssignments.AnyAsync(a => a.IsActive && a.VehicleId == vehicle.Id && sameDay.Contains(a.TripId)))
                throw Bad("Vehicle is already assigned to another service on this date", 409);
            var crewIds = crew.Select(c => c.StaffId).ToList();
            if (await db.TripAssignments.AnyAsync(a => a.IsActive && a.StaffId != null && crewIds.Contains(a.StaffId.Value) && sameDay.Contains(a.TripId)))
                throw Bad("Staff member is already assigned to another service on this date", 409);

            var now = DateTime.UtcNow; var actor = Actor(h);
            var before = await db.TripAssignments.Where(a => a.TripId == id && a.IsActive).ToListAsync();
            foreach (var a in before) { a.IsActive = false; a.ReplacedAt = now; a.ReplacedReason = "Schedule update"; }
            await db.SaveChangesAsync();
            if (vehicle is not null) db.TripAssignments.Add(new TripAssignment { TenantId = db.CurrentTenantId, TripId = id, Kind = "vehicle", VehicleId = vehicle.Id, Role = "vehicle", AssignedAt = now });
            foreach (var c in crew) db.TripAssignments.Add(new TripAssignment { TenantId = db.CurrentTenantId, TripId = id, Kind = "staff", StaffId = c.StaffId, Role = c.Role, AssignedAt = now });
            if (crew.Any(c => c.PhoneOverride is not null))
                settings["phone_overrides"] = new JsonObject(crew.Where(c => c.PhoneOverride is not null).Select(c => KeyValuePair.Create(c.StaffId.ToString(CultureInfo.InvariantCulture), (JsonNode?)JsonValue.Create(c.PhoneOverride))));
            else settings.Remove("phone_overrides");
            trip.UpdateSettingsJson = settings.ToJsonString(); trip.SyncWithRoute = false;
            Audit(db, actor, "assignment", id, new { before = before.Select(a => new { a.Role, a.VehicleId, a.StaffId }), after = new { vehicle_id = vehicle?.Id, crew = crew.Select(c => new { c.StaffId, c.Role }) }, sync_with_route = false });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            await inv.InvalidateTripAsync(id);
            return Results.Text((await UpdateResponse(db, id, h)).ToJsonString(), "application/json");
        }).RequireAuthorization(Policies.Operations);

        g.MapPut("/schedules/{id:long}/update-v51/sync", async (long id, SyncInput i, GdsDbContext db, InventoryService inv, HttpContext h) =>
        {
            if (i.Enabled is not { } enabled) throw Bad("Choose whether route sync is enabled");
            var trip = await db.Trips.FirstOrDefaultAsync(t => t.Id == id && t.DeletedAt == null) ?? throw Bad("Schedule not found", 404);
            var route = await db.Routes.AsNoTracking().FirstAsync(r => r.Id == trip.RouteId);
            if (enabled)
            {
                var live = await db.Bookings.AnyAsync(b => b.TripId == id && b.Status != "CANCELLED");
                if (live && trip.DepartureTime is { } dep && dep != route.DepartureTime)
                    throw Bad("Cannot reset a booked trip departure time while re-enabling route sync. Review affected passengers and trip timings first.", 409);
                // Routes carry no assignment template in this backend, so following the route means no trip-specific bus / crew.
                var now = DateTime.UtcNow;
                foreach (var a in await db.TripAssignments.Where(a => a.TripId == id && a.IsActive).ToListAsync()) { a.IsActive = false; a.ReplacedAt = now; a.ReplacedReason = "Sync with route"; }
                trip.DepartureTime = null; trip.UpdateSettingsJson = null; trip.FareOverrideJson = null; trip.FareOverrideAt = null;
            }
            trip.SyncWithRoute = enabled;
            Audit(db, Actor(h), "sync_with_route", id, new { enabled, source = enabled ? "route" : "schedule" });
            await db.SaveChangesAsync();
            await inv.InvalidateTripAsync(id);
            return Results.Text((await UpdateResponse(db, id, h)).ToJsonString(), "application/json");
        }).RequireAuthorization(Policies.Operations);

        g.MapPost("/schedules/{id:long}/update-v51/sync-ota", async (long id, GdsDbContext db) =>
        {
            var trip = await db.Trips.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id && t.DeletedAt == null) ?? throw Bad("Schedule not found", 404);
            throw Bad($"OTA resync is not connected. No seats were pushed for {trip.TravelDate:yyyy-MM-dd}.", 501);
        }).RequireAuthorization(Policies.Operations);
    }

    private static JsonObject Settings(Trip t) => t.UpdateSettingsJson is { } s && JsonNode.Parse(s) is JsonObject o ? o : [];

    private static async Task<Vehicle?> VehicleAsync(GdsDbContext db, JsonNode? node)
    {
        if (node is null) return null;
        long id;
        if (node is JsonValue v && v.TryGetValue<long>(out var l)) id = l;
        else if (node is JsonValue sv && sv.TryGetValue<string>(out var s)) { if (s == "") return null; if (!long.TryParse(s, out id)) throw Bad("Invalid vehicle selection"); }
        else throw Bad("Invalid vehicle selection");
        var veh = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == id);
        if (veh is null || veh.Status is "inactive" or "deleted" or "retired") throw Bad("Selected vehicle is unavailable");
        return veh;
    }

    private sealed record Crew(long StaffId, string Role, string? PhoneOverride);
    private static async Task<List<Crew>> ValidateCrewAsync(GdsDbContext db, JsonArray rows)
    {
        if (rows.Count > 8) throw Bad("Maximum eight crew assignments");
        var seen = new HashSet<long>(); var result = new List<Crew>();
        foreach (var n in rows)
        {
            var role = n?["role"] is JsonValue rv && rv.TryGetValue<string>(out var r) ? r : null;
            long sid = 0;
            var ok = n is JsonObject && role is not null && CrewRoles.Contains(role) && n["staff_id"] is JsonValue iv &&
                     (iv.TryGetValue<long>(out sid) || (iv.TryGetValue<string>(out var ss) && long.TryParse(ss, out sid)));
            if (!ok) throw Bad("Invalid crew role or staff selection");
            var staff = await db.Staff.AsNoTracking().FirstOrDefaultAsync(x => x.Id == sid);
            if (staff is null || staff.Status != "active" || !seen.Add(sid)) throw Bad("Staff must be active and assigned once");
            if (role == "Driver" && staff.Role != "driver") throw Bad("Driver assignment requires an active driver");
            if (role is "Helper" or "Attendant" && staff.Role is not ("helper" or "attendant")) throw Bad("Select a helper/attendant for this role");
            if (role == "Conductor" && staff.Role != "conductor") throw Bad("Select an active conductor");
            var raw = Clean(n!["phone_override"] is JsonValue pv && pv.TryGetValue<string>(out var p) ? p : "");
            if (raw.Length > 0 && !PhoneRx().IsMatch(raw)) throw Bad("Staff contact override must be a valid phone number");
            result.Add(new Crew(sid, role!, raw.Length > 0 && raw != staff.Phone ? raw : null));
        }
        return result;
    }

    private static JsonObject ValidateCalls(JsonNode? node)
    {
        if (node is not JsonObject o || o.Any(kv => !CallKeys.Contains(kv.Key))) throw Bad("Invalid call routing settings");
        var outp = new JsonObject();
        foreach (var (k, v) in o)
        {
            if (v is not JsonValue jv || jv.GetValueKind() is not (JsonValueKind.True or JsonValueKind.False)) throw Bad("Call routing switches must be boolean");
            outp[k] = jv.GetValue<bool>();
        }
        return outp;
    }

    private static JsonArray ValidateEscalations(JsonNode? node)
    {
        if (node is not JsonArray a || a.Count > 8) throw Bad("Maximum eight escalation contacts");
        var list = a.Select(x => Clean(x?.ToString())).ToList();
        if (list.Any(x => !PhoneRx().IsMatch(x))) throw Bad("Escalation numbers must contain 10–15 digits");
        if (list.Distinct().Count() != list.Count) throw Bad("Duplicate escalation number");
        return new JsonArray(list.Select(x => (JsonNode?)JsonValue.Create(x)).ToArray());
    }

    /// <summary>Legacy schedule-update-v51 response(): snake_case shape consumed by the vendored Update tab.</summary>
    public static async Task<JsonObject> UpdateResponse(GdsDbContext db, long id, HttpContext h)
    {
        var trip = await db.Trips.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id && t.DeletedAt == null) ?? throw Bad("Schedule not found", 404);
        var route = await db.Routes.AsNoTracking().Include(r => r.CoachTemplate).FirstAsync(r => r.Id == trip.RouteId);
        var settings = Settings(trip);
        var asg = await db.TripAssignments.AsNoTracking().Where(a => a.TripId == id && a.IsActive).OrderBy(a => a.Id).ToListAsync();
        var staffIds = asg.Where(a => a.StaffId != null).Select(a => a.StaffId!.Value).ToList();
        var staff = await db.Staff.AsNoTracking().Where(s => staffIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id);
        var overrides = settings["phone_overrides"] as JsonObject;
        var authz = h.RequestServices.GetRequiredService<Microsoft.AspNetCore.Authorization.IAuthorizationService>();
        var canModify = (await authz.AuthorizeAsync(h.User, Policies.Operations)).Succeeded;
        var crew = new JsonArray(asg.Where(a => a.StaffId != null).Select(a =>
        {
            var p = staff.GetValueOrDefault(a.StaffId!.Value);
            var ov = overrides?[a.StaffId!.Value.ToString(CultureInfo.InvariantCulture)]?.ToString() ?? "";
            return (JsonNode)new JsonObject { ["role"] = a.Role, ["staff_id"] = a.StaffId, ["name"] = p?.Name ?? "Unavailable", ["phone"] = ov.Length > 0 ? ov : p?.Phone ?? "", ["phone_override"] = ov };
        }).ToArray());
        var call = settings["call_settings"] as JsonObject;
        var vehicles = !canModify ? [] : await db.Vehicles.AsNoTracking().Where(v => v.Status != "inactive" && v.Status != "deleted" && v.Status != "retired").OrderBy(v => v.RegistrationNumber).ToListAsync();
        var staffOpts = !canModify ? [] : await db.Staff.AsNoTracking().Where(s => s.Status == "active").OrderBy(s => s.Name).ToListAsync();
        return new JsonObject
        {
            ["schedule_id"] = trip.Id, ["service_number"] = route.ServiceNumber,
            ["assignment_source"] = trip.SyncWithRoute ? "Route" : "Schedule",
            ["call_source"] = call is null ? "Route" : "Schedule",
            ["cab_source"] = settings.ContainsKey("cab_mode") ? "Schedule" : "Route",
            ["can_modify"] = canModify,
            ["vehicle_id"] = asg.FirstOrDefault(a => a.VehicleId != null)?.VehicleId,
            ["crew"] = crew,
            ["route_assignment"] = new JsonObject { ["vehicle_id"] = null, ["crew"] = new JsonArray() },
            ["vehicle_options"] = new JsonArray(vehicles.Select(v => (JsonNode)new JsonObject { ["id"] = v.Id, ["label"] = v.RegistrationNumber, ["coach_template_id"] = v.CoachTemplateId }).ToArray()),
            ["staff_options"] = new JsonArray(staffOpts.Select(s => (JsonNode)new JsonObject { ["id"] = s.Id, ["name"] = s.Name, ["phone"] = s.Phone, ["role"] = s.Role }).ToArray()),
            ["call_settings"] = new JsonObject(CallKeys.Select(k => KeyValuePair.Create(k, (JsonNode?)JsonValue.Create(call?[k] is JsonValue b && b.GetValue<bool>())))),
            ["escalation_contacts"] = settings["escalation_contacts"]?.DeepClone() ?? new JsonArray(),
            ["cab_mode"] = settings["cab_mode"]?.ToString() ?? "Off",
            ["coach_name"] = route.CoachTemplate?.Name ?? "Coach not configured",
            ["sync_with_route"] = trip.SyncWithRoute,
            ["auto_ota_sync_connected"] = false,
            ["ota_sync_message"] = "OTA resync is unavailable until an authorized OTA connector and provider endpoint are configured.",
        };
    }
}
