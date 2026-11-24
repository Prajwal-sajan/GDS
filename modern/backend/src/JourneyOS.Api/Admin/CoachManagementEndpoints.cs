using JourneyOS.Api.Operations;
using JourneyOS.Api.Security;

namespace JourneyOS.Api.Admin;

/// <summary>Protected native React Coach Editor CRUD and geometry metadata.</summary>
public static class CoachManagementEndpoints
{
    public static void MapCoachManagement(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization(Policies.Operations).WithTags("Coach editor");
        g.MapGet("/coaches/detailed", async (CoachManagementService service) =>
            Results.Ok(await service.ListAsync()));
        g.MapGet("/coaches/{id:long}/full", async (long id, CoachManagementService service) =>
            Results.Ok(await service.FullAsync(id)));
        g.MapPost("/coaches", async (CoachDraft draft, CoachManagementService service, HttpContext h) =>
        {
            var id = await service.SaveAsync(null, draft, h.User.Identity?.Name ?? "operator");
            return Results.Created($"/api/admin/coaches/{id}/full", new { id });
        });
        g.MapPut("/coaches/{id:long}", async (long id, CoachDraft draft,
            CoachManagementService service, HttpContext h) =>
        {
            await service.SaveAsync(id, draft, h.User.Identity?.Name ?? "operator");
            return Results.Ok(new { id });
        });
    }
}
