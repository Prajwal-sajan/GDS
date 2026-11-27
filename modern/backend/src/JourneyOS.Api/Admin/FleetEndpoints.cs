using System.Text.Json;
using JourneyOS.Api.Operations;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record FleetStatusInput(string Status);

/// <summary>
/// Read models for GDS → Vehicles / Coaches (legacy <c>GET /api/vehicles</c>, <c>GET /api/coaches</c>) and their on/off switches.
/// Telemetry (position / health) is the last report stored in PostgreSQL; nothing is simulated here. Doc alerts follow legacy
/// master.js: compliance documents of the vehicle expiring within 30 days (IST today).
/// </summary>
public static class FleetEndpoints
{
    private static JsonElement? Json(string? s) => string.IsNullOrEmpty(s) ? null : JsonDocument.Parse(s).RootElement.Clone();

    public static void MapFleetLists(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization().WithTags("Fleet");

        g.MapGet("/vehicle-list", async (GdsDbContext db, TimeProvider clock) =>
        {
            var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime.AddHours(5.5));
            var limit = today.AddDays(30);
            var coaches = await db.CoachTemplates.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name);
            var alerts = await db.ComplianceDocuments.AsNoTracking().Where(d => d.OwnerType == "vehicle" && d.ExpiryDate != null && d.ExpiryDate <= limit)
                .GroupBy(d => d.OwnerId).Select(x => new { x.Key, n = x.Count() }).ToDictionaryAsync(x => x.Key, x => x.n);
            var list = await db.Vehicles.AsNoTracking().OrderBy(v => v.Id).ToListAsync();
            return Results.Ok(new
            {
                vehicles = list.Select(v => new
                {
                    id = v.Id, registrationNumber = v.RegistrationNumber, coachTemplateId = v.CoachTemplateId,
                    coach = v.CoachTemplateId is { } c && coaches.TryGetValue(c, out var n) ? n : null,
                    status = v.Status, vehicleRole = v.VehicleRole, gpsEnabled = v.GpsEnabled, modelName = v.ModelName,
                    odometerReading = v.OdometerReading, position = Json(v.PositionJson), health = Json(v.HealthJson),
                    docAlerts = alerts.GetValueOrDefault(v.Id),
                }),
            });
        }).RequireAuthorization(Policies.Operations);

        g.MapPut("/vehicles/{id:long}/status", async (long id, FleetStatusInput i, OperationsService s, HttpContext h) =>
            Results.Ok(new { status = await s.SetVehicleStatusAsync(id, i.Status, h.User.Identity!.Name!) })).RequireAuthorization(Policies.Operations);

        // Legacy master.js DELETE /vehicles/:id: refused while assigned to an active trip today or later.
        g.MapDelete("/vehicles/{id:long}", async (long id, GdsDbContext db, TimeProvider clock, HttpContext h) =>
        {
            var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == id) ?? throw new JourneyOS.Api.Inventory.GdsException("not_found", "Vehicle not found", 404);
            var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime.AddHours(5.5));
            var busy = await (from a in db.TripAssignments join t in db.Trips on a.TripId equals t.Id
                              where a.VehicleId == id && a.IsActive && t.TravelDate >= today && t.Status == "active" select a.Id).AnyAsync();
            if (busy) throw new JourneyOS.Api.Inventory.GdsException("conflict", "Vehicle is assigned to upcoming trips", 409);
            db.Vehicles.Remove(v);
            db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = h.User.Identity?.Name ?? "system", Action = "VEHICLE_DELETE", Entity = "vehicle", EntityId = id.ToString(), DataJson = JsonSerializer.Serialize(new { v.RegistrationNumber }), At = DateTime.UtcNow });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) { throw new JourneyOS.Api.Inventory.GdsException("conflict", "Vehicle has trip history and cannot be removed; mark it inactive instead", 409); }
            return Results.Ok(new { success = true });
        }).RequireAuthorization(Policies.Operations);

        g.MapGet("/coach-list", async (GdsDbContext db) =>
        {
            var list = await db.CoachTemplates.AsNoTracking().Include(c => c.Seats).OrderBy(c => c.Id).ToListAsync();
            return Results.Ok(new
            {
                coaches = list.Select(c =>
                {
                    var sleeper = c.Seats.Count(x => x.SeatType.Contains("sleep", StringComparison.OrdinalIgnoreCase));
                    return new
                    {
                        id = c.Id, name = c.Name, busType = c.BusType, pattern = c.Pattern, status = c.Status,
                        amenities = JsonSerializer.Deserialize<List<string>>(c.AmenitiesJson) ?? [],
                        seater = c.Seats.Count - sleeper, sleeper, capacity = c.Seats.Count,
                    };
                }),
            });
        }).RequireAuthorization(Policies.Operations);

        g.MapPut("/coaches/{id:long}/status", async (long id, FleetStatusInput i, OperationsService s, HttpContext h) =>
            Results.Ok(new { status = await s.SetCoachStatusAsync(id, i.Status, h.User.Identity!.Name!) })).RequireAuthorization(Policies.Operations);
    }
}
