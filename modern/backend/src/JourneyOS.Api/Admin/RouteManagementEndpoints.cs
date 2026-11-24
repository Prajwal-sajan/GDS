using JourneyOS.Api.Operations;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public static class RouteManagementEndpoints
{
    /// <summary>Operator-authorised master-data endpoints for the React route authoring workspace.</summary>
    public static void MapRouteManagement(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization(Policies.Operations)
            .WithTags("Route authoring");
        g.MapGet("/cities", async (GdsDbContext db) =>
            Results.Ok(await db.Cities.AsNoTracking()
                .Where(c => c.IsActive)
                .OrderBy(c => c.Name)
                .Select(c => new { c.Id, c.Name, c.State, c.CountryName })
                .ToArrayAsync()));

        g.MapGet("/coaches", async (GdsDbContext db) =>
            Results.Ok(await db.CoachTemplates.AsNoTracking()
                .OrderBy(c => c.Name)
                .Select(c => new
                {
                    c.Id, c.Name, c.Pattern, c.BusType, c.IsAc,
                    seatCount = c.Seats.Count,
                    seaterCount = c.Seats.Count(s => s.SeatType == "seater"),
                    sleeperCount = c.Seats.Count(s => s.SeatType == "sleeper")
                }).ToArrayAsync()));

        g.MapGet("/routes/{id:long}/full", async (long id, RouteManagementService routes) =>
            Results.Ok(await routes.FullAsync(id)));

        g.MapPost("/routes", async (RouteDraft input, RouteManagementService routes,
            HttpContext h) =>
        {
            var id = await routes.SaveAsync(null, input, h.User.Identity!.Name!);
            return Results.Created($"/api/admin/routes/{id}/full", new { id });
        });

        g.MapPut("/routes/{id:long}", async (long id, RouteDraft input,
            RouteManagementService routes, HttpContext h) =>
        {
            await routes.SaveAsync(id, input, h.User.Identity!.Name!);
            return Results.Ok(new { id });
        });
    }
}