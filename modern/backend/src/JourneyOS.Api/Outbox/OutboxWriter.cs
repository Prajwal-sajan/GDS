using System.Text.Json;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Outbox;

public static class RedBusActions
{
    public const string NewCityVsd = "NEW_CITY_VSD";
    public const string Search = "SEARCH";
    public const string UpdateService = "UPDATE_SERVICE";
    public const string RemoveService = "REMOVE_SERVICE";
    public const string ManualBusCancellation = "MANUAL_BUS_CANCELLATION";
    public const string Shift = "SHIFT";
    public static readonly string[] All = [NewCityVsd, Search, UpdateService, RemoveService, ManualBusCancellation, Shift];
}

/// <summary>
/// Writes outbox rows inside the caller's transaction. Pending rows with the same dedup key are
/// coalesced by a partial unique index so a burst of seat changes produces one UPDATE_SERVICE.
/// </summary>
public sealed class OutboxWriter(GdsDbContext db, TimeProvider clock)
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = null };

    public async Task<bool> EnqueueAsync(string actionType, string dedupKey, object payload, string provider = "REDBUS")
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var json = JsonSerializer.Serialize(payload, Json);
        var rows = await db.Database.ExecuteSqlInterpolatedAsync($@"
INSERT INTO outbox_messages (tenant_id, provider, action_type, dedup_key, payload_json, status, attempts, next_attempt_at, created_at)
VALUES ({db.CurrentTenantId}, {provider}, {actionType}, {dedupKey}, {json}, {(int)OutboxStatus.Pending}, 0, {now}, {now})
ON CONFLICT (provider, dedup_key) WHERE status = 1 DO NOTHING");
        return rows == 1;
    }
}

/// <summary>Translates GDS changes into the documented RedBus callback payloads.</summary>
public sealed class RedBusNotifier(GdsDbContext db, OutboxWriter outbox)
{
    private async Task<OtaProviderConfig?> Provider() =>
        await db.OtaProviders.FirstOrDefaultAsync(p => p.Provider == "REDBUS");

    /// <summary>UPDATE_SERVICE for every published inventory of the trip overlapping [from,to).</summary>
    public async Task ServiceChangedAsync(Trip trip, int fromSeq, int toSeq)
    {
        var p = await Provider();
        if (p is null) return;
        var stops = await db.RouteStops.Where(s => s.RouteId == trip.RouteId).ToListAsync();
        var route = await db.Routes.FirstAsync(r => r.Id == trip.RouteId);
        var inv = await db.OtaInventories
            .Where(i => i.TripId == trip.Id && i.FromSeq < toSeq && fromSeq < i.ToSeq)
            .ToListAsync();
        foreach (var i in inv)
        {
            var src = stops.First(s => s.Sequence == i.FromSeq);
            var dst = stops.First(s => s.Sequence == i.ToSeq);
            var doj = trip.TravelDate.AddDays(src.Day - 1).ToString("yyyy-MM-dd");
            await outbox.EnqueueAsync(RedBusActions.UpdateService, $"UPDATE_SERVICE:{i.Id}", new
            {
                action_type = RedBusActions.UpdateService,
                data = new { doj, source = src.CityId.ToString(), destination = dst.CityId.ToString(), service_id = route.ServiceNumber, operatorcode = p.OperatorCode }
            });
        }
    }

    public async Task ServiceRemovedAsync(Trip trip)
    {
        var p = await Provider();
        if (p is null) return;
        var stops = await db.RouteStops.Where(s => s.RouteId == trip.RouteId).ToListAsync();
        var route = await db.Routes.FirstAsync(r => r.Id == trip.RouteId);
        foreach (var i in await db.OtaInventories.Where(i => i.TripId == trip.Id).ToListAsync())
        {
            var src = stops.First(s => s.Sequence == i.FromSeq);
            var dst = stops.First(s => s.Sequence == i.ToSeq);
            await outbox.EnqueueAsync(RedBusActions.RemoveService, $"REMOVE_SERVICE:{i.Id}", new
            {
                action_type = RedBusActions.RemoveService,
                data = new { doj = trip.TravelDate.AddDays(src.Day - 1).ToString("yyyy-MM-dd"), source = src.CityId.ToString(), destination = dst.CityId.ToString(), service_id = route.ServiceNumber, operatorcode = p.OperatorCode }
            });
        }
    }

    public async Task SearchChangedAsync(long sourceCityId, long destinationCityId, DateOnly doj)
    {
        var p = await Provider();
        if (p is null) return;
        await outbox.EnqueueAsync(RedBusActions.Search, $"SEARCH:{sourceCityId}:{destinationCityId}:{doj:yyyy-MM-dd}", new
        {
            action_type = RedBusActions.Search,
            data = new { doj = doj.ToString("yyyy-MM-dd"), source = sourceCityId.ToString(), destination = destinationCityId.ToString(), operatorcode = p.OperatorCode }
        });
    }

    public async Task NewCitySdAsync(IEnumerable<(City Source, City Destination)> pairs, string batchKey)
    {
        var p = await Provider();
        if (p is null) return;
        await outbox.EnqueueAsync(RedBusActions.NewCityVsd, $"NEW_CITY_VSD:{batchKey}", new
        {
            action_type = RedBusActions.NewCityVsd,
            operatorSDs = new[]
            {
                new
                {
                    operatorcode = p.OperatorCode,
                    sd = pairs.Select(x => new { source = x.Source.Id.ToString(), sourceName = x.Source.Name, destination = x.Destination.Id.ToString(), destinationName = x.Destination.Name }).ToArray()
                }
            }
        });
    }

    /// <summary>
    /// MANUAL_BUS_CANCELLATION. The sample's "PNR" field is the RedBus PNR, which the documented
    /// blockticket request never supplies; it is sent as null until RedBus confirms the mapping.
    /// </summary>
    public async Task BusCancelledAsync(Booking booking, Trip trip, long operatorId, long originCityId, long destinationCityId, IEnumerable<string> seats)
    {
        var p = await Provider();
        if (p is null || booking.Channel != "redbus") return;
        await outbox.EnqueueAsync(RedBusActions.ManualBusCancellation, $"MANUAL_BUS_CANCELLATION:{booking.Pnr}", new
        {
            email = booking.ContactEmail ?? "",
            mobileNo = long.TryParse(booking.ContactMobile, out var m) ? m : (long?)null,
            PNR = (string?)null,
            operator_pnr_number = booking.Pnr,
            operatorId = operatorId.ToString(),
            doj = trip.TravelDate.ToString("yyyy-MM-dd"),
            origin = originCityId.ToString(),
            destination = destinationCityId.ToString(),
            cancel_percent = 0.0m,
            seats = seats.ToArray(),
            flag = "refund"
        });
    }

    public async Task ShiftedAsync(object shiftItem, string pnr, long newTripId)
    {
        var p = await Provider();
        if (p is null) return;
        await outbox.EnqueueAsync(RedBusActions.Shift, $"SHIFT:{pnr}:{newTripId}", new { action_type = RedBusActions.Shift, data = new[] { shiftItem } });
    }
}
