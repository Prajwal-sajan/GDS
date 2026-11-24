using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace JourneyOS.Api.Realtime;

/// <summary>Publishes post-commit domain events to connected operator screens.</summary>
public interface ITripEvents
{
    Task TripChangedAsync(long tenantId, long tripId);
    Task OutboxChangedAsync(long tenantId);
}

/// <summary>
/// Operator real-time hub. Clients join tenant-scoped groups only; the tenant comes from the
/// authenticated principal, never from the client. Events are hints to refetch — the PostgreSQL-
/// backed API remains the source of truth, so a missed event never causes wrong data.
/// </summary>
[Authorize]
public sealed class OpsHub(JourneyOS.Api.Persistence.GdsDbContext db) : Hub
{
    public static string OpsGroup(long tenant) => $"t:{tenant}:ops";
    public static string TripGroup(long tenant, long trip) => $"t:{tenant}:trip:{trip}";

    private async Task<long> TenantAsync()
    {
        var code = Context.User?.FindFirst("tenant")?.Value ?? throw new HubException("No tenant");
        var id = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.FirstOrDefaultAsync(
            db.Tenants.Where(t => t.Code == code).Select(t => (long?)t.Id));
        return id ?? throw new HubException("Unknown tenant");
    }

    public override async Task OnConnectedAsync()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, OpsGroup(await TenantAsync()));
        await base.OnConnectedAsync();
    }

    public async Task WatchTrip(long tripId) => await Groups.AddToGroupAsync(Context.ConnectionId, TripGroup(await TenantAsync(), tripId));
    public async Task UnwatchTrip(long tripId) => await Groups.RemoveFromGroupAsync(Context.ConnectionId, TripGroup(await TenantAsync(), tripId));
}

public sealed class SignalRTripEvents(IHubContext<OpsHub> hub, ILogger<SignalRTripEvents> log) : ITripEvents
{
    public async Task TripChangedAsync(long tenantId, long tripId)
    {
        try
        {
            await hub.Clients.Groups(OpsHub.OpsGroup(tenantId), OpsHub.TripGroup(tenantId, tripId)).SendAsync("tripChanged", new { tripId });
        }
        catch (Exception ex) { log.LogWarning(ex, "Realtime publish failed (non-critical)"); }
    }

    public async Task OutboxChangedAsync(long tenantId)
    {
        try { await hub.Clients.Group(OpsHub.OpsGroup(tenantId)).SendAsync("outboxChanged"); }
        catch (Exception ex) { log.LogWarning(ex, "Realtime publish failed (non-critical)"); }
    }
}
