using JourneyOS.Api.Caching;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Operations;

// Route-authoring contract. Route-stops use their array index as immutable
// sequence (0-based). References to CityId / CoachTemplateId must belong to
// the authenticated tenant. No optimistic "draft" data writes from React.
public sealed record RouteStopDraft(long CityId, int Day, TimeOnly Time);
public sealed record RouteStageDraft(int StopSequence, string Kind, string Name,
    int Day, TimeOnly Time, string? Address, string? Landmark,
    string? ContactNumber, bool Prime);
public sealed record RouteDraft(
    string ServiceNumber, string Name, long CoachTemplateId, TimeOnly DepartureTime,
    string Status, bool PartialCancellationAllowed, bool PrimaryPaxCancellable,
    int MaxSeatsPerTicket, int UpdateCutoffMinutes,
    List<RouteStopDraft> Stops, List<RouteStageDraft> Stages, List<FareInput> Fares);

/// <summary>
/// Authoritative master-route authoring; deliberate fail-closed boundary at the
/// first generated trip. Retrofitting coach/stages/times onto sold inventory
/// would invalidate PNR segment IDs and OTA journey obligations.
/// </summary>
public sealed class RouteManagementService(GdsDbContext db, IGdsCache cache, TimeProvider clock)
{
    private long Tenant => db.CurrentTenantId;
    private static readonly string[] AllowedStatus = ["draft", "active", "inactive"];

    private static void Check(RouteDraft i)
    {
        if (i is null) throw new GdsException("VALIDATION", "Route data is required");
        if (string.IsNullOrWhiteSpace(i.ServiceNumber) ||
            !System.Text.RegularExpressions.Regex.IsMatch(i.ServiceNumber.Trim(), @"^[a-zA-Z0-9_-]{2,32}$"))
            throw new GdsException("VALIDATION", "Service number must be 2–32 letters, numbers, hyphens or underscores");
        if (string.IsNullOrWhiteSpace(i.Name) || i.Name.Trim().Length > 120)
            throw new GdsException("VALIDATION", "Route name is required (max 120 characters)");
        if (!AllowedStatus.Contains(i.Status))
            throw new GdsException("VALIDATION", "Unknown route status");
        if (i.MaxSeatsPerTicket is < 1 or > 12 || i.UpdateCutoffMinutes is < 0 or > 10080)
            throw new GdsException("VALIDATION", "Invalid seat limit or booking cutoff");
        if (i.Stops is null || i.Stops.Count is < 2 or > 30)
            throw new GdsException("VALIDATION", "Provide 2–30 ordered route cities");
        if (i.Stops.Any(s => s.CityId <= 0 || s.Day is < 1 or > 14))
            throw new GdsException("VALIDATION", "Invalid city ID or journey day");
        // Same physical stop may recur only if explicitly modelled as a
        // separate segment. Prevent accidental double cities in the editor.
        if (i.Stops.Select(x => x.CityId).Distinct().Count() != i.Stops.Count)
            throw new GdsException("VALIDATION", "Duplicate route city: choose distinct stops");
        for (var k = 1; k < i.Stops.Count; k++)
        {
            var p = i.Stops[k - 1];
            var q = i.Stops[k];
            if (q.Day < p.Day || (q.Day == p.Day && q.Time < p.Time))
                throw new GdsException("VALIDATION", $"Journey times must be chronological at stop {k + 1}");
        }

        if (i.Stages is null || i.Stages.Count is < 2 or > 160)
            throw new GdsException("VALIDATION", "Provide at least one pickup and one drop");
        var pk = false;
        var dp = false;
        foreach (var s in i.Stages)
        {
            if (s.Kind is not ("pickup" or "drop") ||
                s.StopSequence < 0 || s.StopSequence >= i.Stops.Count ||
                s.Day != i.Stops[s.StopSequence].Day ||
                string.IsNullOrWhiteSpace(s.Name) || s.Name.Trim().Length > 180 ||
                s.ContactNumber is { Length: > 25 })
                throw new GdsException("VALIDATION", "Invalid boarding/dropping stage");
            // Pickup at destination or drop at origin cannot form a valid booking.
            if (s.Kind == "pickup" && s.StopSequence < i.Stops.Count - 1) pk = true;
            if (s.Kind == "drop" && s.StopSequence > 0) dp = true;
        }
        if (!pk || !dp) throw new GdsException("VALIDATION", "Pickups must precede at least one drop");
        if (i.Fares is null || i.Fares.Count is < 1 or > 435)
            throw new GdsException("VALIDATION", "A fare matrix is required");
        var pairs = new HashSet<(int, int)>();
        foreach (var f in i.Fares)
        {
            if (f.FromSequence < 0 || f.ToSequence >= i.Stops.Count ||
                f.FromSequence >= f.ToSequence ||
                f.Seater is < 0 or > 1000000 ||
                f.SleeperLower is < 0 or > 1000000 ||
                f.SleeperUpper is < 0 or > 1000000 ||
                !pairs.Add((f.FromSequence, f.ToSequence)))
                throw new GdsException("VALIDATION", "Invalid, duplicate or out-of-range fare segment");
        }
        if (!pairs.Contains((0, i.Stops.Count - 1)))
            throw new GdsException("VALIDATION", "The origin-to-destination fare is required");
        // Real time departure is sourced from first stop, never a mismatched
        // value shown to passengers and dispatchers.
        if (i.DepartureTime != i.Stops[0].Time)
            throw new GdsException("VALIDATION", "Route departure time must match the first city time");
    }

    public async Task<object> FullAsync(long id)
    {
        var r = await db.Routes.AsNoTracking().Include(x => x.CoachTemplate)
            .Include(x => x.Stops).ThenInclude(x => x.City)
            .Include(x => x.Stages).Include(x => x.Fares).AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id)
            ?? throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);
        var hasTrips = await db.Trips.AsNoTracking().AnyAsync(t => t.RouteId == id);
        return new
        {
            r.Id, r.ServiceNumber, r.Name, r.CoachTemplateId, coachName = r.CoachTemplate?.Name,
            r.DepartureTime, r.Status, r.PartialCancellationAllowed, r.PrimaryPaxCancellable,
            r.MaxSeatsPerTicket, r.UpdateCutoffMinutes,
            structuralLocked = hasTrips,
            stops = r.Stops.OrderBy(s => s.Sequence).Select(s => new
            {
                s.Sequence, s.CityId, cityName = s.City?.Name ?? $"City #{s.CityId}", s.Day, s.Time
            }).ToArray(),
            stages = r.Stages.OrderBy(s => s.StopSequence).ThenBy(s => s.Time).Select(s => new
            {
                s.Id, s.StopSequence, s.Kind, s.Name, s.Day, s.Time,
                s.Address, s.Landmark, s.ContactNumber, s.Prime
            }).ToArray(),
            fares = r.Fares.OrderBy(f => f.FromSequence).ThenBy(f => f.ToSequence)
                .Select(f => new { f.FromSequence, f.ToSequence, f.Seater, f.SleeperLower, f.SleeperUpper }).ToArray()
        };
    }

    public async Task<long> SaveAsync(long? id, RouteDraft draft, string actor)
    {
        Check(draft);
        await using var tx = await db.Database.BeginTransactionAsync();
        // Serialize service-number checks for concurrent requests from this
        // tenant even before a dedicated route unique-index migration.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({Tenant})");
        var sn = draft.ServiceNumber.Trim().ToUpperInvariant();
        if (await db.Routes.AnyAsync(r => r.ServiceNumber.ToUpper() == sn && r.Id != id))
            throw new GdsException("DUPLICATE", "Service number already exists", 409);
        if (!await db.CoachTemplates.AnyAsync(c => c.Id == draft.CoachTemplateId))
            throw new GdsException("UNKNOWN_COACH", "Choose an existing coach template", 400);
        var cityIds = draft.Stops.Select(x => x.CityId).Distinct().ToArray();
        if (await db.Cities.CountAsync(x => cityIds.Contains(x.Id) && x.IsActive) != cityIds.Length)
            throw new GdsException("UNKNOWN_CITY", "Choose existing active cities only", 400);

        Route route;
        if (id is null)
        {
            var next = await db.Database.SqlQueryRaw<long>("SELECT nextval('master_ids') AS \"Value\"").SingleAsync();
            route = new Route { TenantId = Tenant, Id = next };
            db.Routes.Add(route);
        }
        else
        {
            route = await db.Routes.FirstOrDefaultAsync(x => x.Id == id)
                ?? throw new GdsException("ROUTE_NOT_FOUND", "Route not found", 404);
            // Route-level identity and geometry are currently shared by
            // existing journeys; all modifications require an explicit
            // versioned-route migration preserving PNR/OTA commitments.
            if (await db.Trips.AnyAsync(t => t.RouteId == id))
                throw new GdsException("ROUTE_HAS_TRIPS",
                    "Generated services exist. Create a new route version instead of changing sold or published inventory", 409);
        }
        route.ServiceNumber = sn;
        route.Name = draft.Name.Trim();
        route.CoachTemplateId = draft.CoachTemplateId;
        route.DepartureTime = draft.DepartureTime;
        route.Status = draft.Status;
        route.PartialCancellationAllowed = draft.PartialCancellationAllowed;
        route.PrimaryPaxCancellable = draft.PrimaryPaxCancellable;
        route.MaxSeatsPerTicket = draft.MaxSeatsPerTicket;
        route.UpdateCutoffMinutes = draft.UpdateCutoffMinutes;
        await db.SaveChangesAsync();

        if (id is not null)
        {
            db.RouteFares.RemoveRange(await db.RouteFares.Where(f => f.RouteId == id).ToListAsync());
            db.RouteStages.RemoveRange(await db.RouteStages.Where(s => s.RouteId == id).ToListAsync());
            db.RouteStops.RemoveRange(await db.RouteStops.Where(s => s.RouteId == id).ToListAsync());
            // Honor DB uniqueness; deletion must precede insertion in the same
            // transaction because EF can otherwise reorder SQL statements.
            await db.SaveChangesAsync();
        }

        for (var j = 0; j < draft.Stops.Count; j++)
        {
            var stop = draft.Stops[j];
            db.RouteStops.Add(new RouteStop
            {
                RouteId = route.Id, Sequence = j, CityId = stop.CityId, Day = stop.Day, Time = stop.Time
            });
        }
        foreach (var stage in draft.Stages)
        {
            var next = await db.Database.SqlQueryRaw<long>("SELECT nextval('master_ids') AS \"Value\"").SingleAsync();
            db.RouteStages.Add(new RouteStage
            {
                Id = next, RouteId = route.Id,
                CityId = draft.Stops[stage.StopSequence].CityId,
                StopSequence = stage.StopSequence, Kind = stage.Kind,
                Name = stage.Name.Trim(), Day = stage.Day, Time = stage.Time,
                Address = stage.Address?.Trim(), Landmark = stage.Landmark?.Trim(),
                ContactNumber = stage.ContactNumber?.Trim(), Prime = stage.Prime
            });
        }
        foreach (var fare in draft.Fares)
            db.RouteFares.Add(new RouteFare
            {
                RouteId = route.Id, FromSequence = fare.FromSequence, ToSequence = fare.ToSequence,
                Seater = fare.Seater, SleeperLower = fare.SleeperLower, SleeperUpper = fare.SleeperUpper
            });
        db.AuditLogs.Add(new AuditLog
        {
            TenantId = Tenant, Actor = actor,
            Action = id is null ? "ROUTE_CREATE" : "ROUTE_UPDATE",
            Entity = "route", EntityId = route.Id.ToString(),
            DataJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                draft.ServiceNumber, draft.Name, draft.CoachTemplateId, draft.Status,
                stopCount = draft.Stops.Count, stageCount = draft.Stages.Count,
                fareCount = draft.Fares.Count
            }),
            At = clock.GetUtcNow().UtcDateTime
        });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await cache.BumpAsync(CacheKeys.SearchScope(Tenant), CacheKeys.CatalogScope(Tenant));
        return route.Id;
    }
}