using System.Text.Json;
using JourneyOS.Api.Inventory;
using Microsoft.AspNetCore.Mvc;

namespace JourneyOS.Api.RedBus;

/// <summary>
/// Inbound RedBus → GDS contract. Paths match the sample document ("http://apidns/search" etc.);
/// they are mounted under a configurable prefix (default "/redbus") on the GDS host.
/// </summary>
public static class RedBusEndpoints
{
    public static RouteGroupBuilder MapRedBus(this IEndpointRouteBuilder app, string prefix)
    {
        var g = app.MapGroup(prefix).WithTags("RedBus inbound").AddEndpointFilter<RedBusGuardFilter>();

        g.MapGet("/search", async (long source, long destination, string doj, RedBusQueryService q) =>
            Results.Json(await q.SearchAsync(source, destination, ParseDoj(doj)), RedBusJson.Output));

        g.MapGet("/seatlayout", async (long id, string doj, RedBusQueryService q) =>
            Results.Json(await q.SeatLayoutAsync(id, ParseDoj(doj)), RedBusJson.Output));

        g.MapPost("/blockticket", async (RbBlockRequest req, InventoryService inv) =>
        {
            var items = (req.InventoryItems ?? []).Select(i => new HoldPassengerInput(i.SeatName ?? "", i.Fare, i.LadiesSeat,
                i.Passenger?.Name ?? "", i.Passenger?.Mobile, i.Passenger?.Title, i.Passenger?.Email, i.Passenger?.Age ?? 0,
                i.Passenger?.Gender ?? "", i.Passenger?.Address, i.Passenger?.IdType, i.Passenger?.IdNumber, i.Passenger?.Primary ?? false)).ToList();
            var hold = await inv.HoldAsync(new HoldInput(req.InventoryId, req.BoardingPointId, req.DroppingPointId, req.Source, req.Destination, items));
            return Results.Ok(new RbBlockResponse(hold.BlockKey, hold.Currency, hold.TotalFare.ToString("0.00"),
                [new RbFareBreakup(hold.TotalFare, hold.Passengers.Sum(p => p.BaseFare), hold.Passengers.Sum(p => p.Gst), "ALL")]));
        });

        g.MapPost("/confirmticket", async (RbConfirmRequest req, InventoryService inv, RedBusQueryService q) =>
        {
            var b = await inv.ConfirmAsync(req.BlockKey ?? "", req.Fare);
            var t = await q.TicketAsync(b.Pnr);
            return Results.Ok(new RbConfirmResponse(b.Pnr, b.Status, t.DateOfIssue, t.Travels, t.BusType, 0, 0, b.CancellationPolicy));
        });

        g.MapGet("/checkpnr", async (string blockkey, InventoryService inv, RedBusQueryService q) =>
        {
            var (hold, booking) = await inv.CheckPnrAsync(blockkey);
            if (booking is null)
                return Results.NotFound(new RbError("NOT_BOOKED", "PNR_NOT_FOUND", $"Block key is {hold.Status.ToString().ToUpperInvariant()}; no ticket was issued"));
            var t = await q.TicketAsync(booking.Pnr);
            return Results.Ok(new RbConfirmResponse(booking.Pnr, booking.Status, t.DateOfIssue, t.Travels, t.BusType, t.RefundAmount, t.CancellationCharges, booking.CancellationPolicy));
        });

        g.MapPost("/cancelticket", async (RbCancelRequest req, InventoryService inv) =>
        {
            var r = await inv.CancelAsync(req.Pnr ?? "", req.SeatsToCancel ?? [], req.Notes);
            return Results.Ok(new RbCancelResponse(r.Charge, r.Refund, r.Booking.Pnr, r.At.ToString("yyyy-MM-dd HH:mm:ss"), r.Booking.CancellationPolicy));
        });

        g.MapGet("/cities", async (RedBusQueryService q) => Results.Ok(await q.CitiesAsync()));
        g.MapGet("/destinationBySource", async (long source, RedBusQueryService q) => Results.Ok(await q.DestinationsAsync(source)));
        g.MapGet("/ticket", async (string pnr, RedBusQueryService q) => Results.Ok(await q.TicketAsync(pnr)));

        g.MapPost("/updateticket", async (RbUpdateRequest req, InventoryService inv) =>
        {
            await inv.UpdateAsync(req.Pnr ?? "", req.MobileNumber, req.BoardingAt, req.DropOff);
            return Results.Ok(new RbStatusMessage(true, "Ticket updated"));
        });

        g.MapPost("/tripstatus", async (RbTripStatusRequest req, RedBusQueryService q) => Results.Ok(await q.TripStatusAsync(req.Pnr ?? "")));

        // The sample documents GET with a JSON body {blockKey, seatNos}. Until RedBus confirms the exact
        // transport, the endpoint is disabled unless RedBus:EnableTentativeRelease is true.
        g.MapGet("/tentativerelease", async (HttpRequest http, InventoryService inv, IConfiguration cfg, [FromQuery] string? blockKey) =>
        {
            if (!cfg.GetValue<bool>("RedBus:EnableTentativeRelease"))
                return Results.Json(new RbError("FAILED", "CONTRACT_UNCONFIRMED", "tentativerelease contract not yet confirmed with RedBus"), statusCode: 501);
            RbReleaseRequest? body = null;
            if (http.ContentLength > 0) body = await JsonSerializer.DeserializeAsync<RbReleaseRequest>(http.Body, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            var key = body?.BlockKey ?? blockKey;
            if (string.IsNullOrWhiteSpace(key)) throw new GdsException("BLOCK_KEY", "blockKey is required");
            await inv.ReleaseAsync(key, body?.SeatNos);
            return Results.Ok(new RbStatusMessage(true, "Seats released"));
        });

        return g;
    }

    private static DateOnly ParseDoj(string doj) =>
        DateOnly.TryParseExact(doj, "yyyy-MM-dd", out var d) ? d : throw new GdsException("INVALID_DOJ", "doj must be yyyy-mm-dd");
}

/// <summary>
/// The RedBus sample emits both "ac" and "AC" on trips/layouts. Case-insensitive options (ASP.NET
/// defaults) reject that as a name collision, so outbound documents use case-sensitive options.
/// </summary>
public static class RedBusJson
{
    public static readonly JsonSerializerOptions Output = new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = false };
}

/// <summary>
/// Inbound authentication is NOT specified by the RedBus sample. Until agreed, the GDS protects these
/// endpoints with an operator-side shared secret (header configurable) and optional IP allow-list.
/// In non-Development environments, requests are refused if no secret is configured.
/// </summary>
public sealed class RedBusGuardFilter(IConfiguration cfg, IHostEnvironment env) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var http = ctx.HttpContext;
        var secret = cfg["RedBus:InboundSecret"];
        var header = cfg["RedBus:InboundSecretHeader"] ?? "X-GDS-Key";
        if (string.IsNullOrEmpty(secret))
        {
            if (!env.IsDevelopment() && !env.IsEnvironment("Testing"))
                return Results.Json(new RbError("FAILED", "NOT_CONFIGURED", "Inbound credentials are not configured"), statusCode: 503);
        }
        else if (!System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
                     System.Text.Encoding.UTF8.GetBytes(http.Request.Headers[header].ToString()), System.Text.Encoding.UTF8.GetBytes(secret)))
            return Results.Json(new RbError("FAILED", "UNAUTHORIZED", "Invalid credentials"), statusCode: 401);

        var allow = cfg.GetSection("RedBus:AllowedIps").Get<string[]>() ?? [];
        if (allow.Length > 0 && !allow.Contains(http.Connection.RemoteIpAddress?.ToString()))
            return Results.Json(new RbError("FAILED", "FORBIDDEN", "Source IP not allowed"), statusCode: 403);
        return await next(ctx);
    }
}
