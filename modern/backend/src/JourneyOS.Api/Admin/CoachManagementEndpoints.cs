using JourneyOS.Api.Operations;
using JourneyOS.Api.Security;

namespace JourneyOS.Api.Admin;

public static class CoachManagementEndpoints
{
    /// <summary>Fully authenticated operator authoring, not exposed to OTA endpoints.</summary>
    public static void MapCoachManagement(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin/coaches").RequireAuthorization(Policies.Operations)
            .WithTags("Coach editor");

        g.MapGet("/{id:long}/full", async (long id, CoachManagementService service) =>
            Results.Ok(await service.FullAsync(id)));

        g.MapPost("", async (CoachDraft input, CoachManagementService service, HttpContext http) =>
        {
            var id = await service.SaveAsync(null, input, http.User.Identity!.Name!);
            return Results.Created($"/api/admin/coaches/{id}/full", new { id });
        });

        g.MapPut("/{id:long}", async (long id, CoachDraft input, CoachManagementService service,
            HttpContext http) =>
        {
            await service.SaveAsync(id, input, http.User.Identity!.Name!);
            return Results.Ok(new { id });
        });

        g.MapPost("/{id:long}/clone", async (long id, CoachManagementService service, HttpContext http) =>
        {
            var created = await service.CloneAsync(id, http.User.Identity!.Name!);
            return Results.Created($"/api/admin/coaches/{created}/full", new { id = created });
        });

        g.MapDelete("/{id:long}", async (long id, CoachManagementService service, HttpContext http) =>
        {
            await service.DeleteAsync(id, http.User.Identity!.Name!);
            return Results.NoContent();
        });
    }
}
