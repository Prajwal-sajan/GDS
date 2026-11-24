using JourneyOS.Api.Operations;
using JourneyOS.Api.Security;

namespace JourneyOS.Api.Admin;

public static class PublicBookingSiteSettingsEndpoints
{
    public static void MapPublicBookingSettings(this IEndpointRouteBuilder app)
    {
        var g=app.MapGroup("/api/admin/settings/booking-site").RequireAuthorization(Policies.Iam)
            .WithTags("Operator website settings");
        g.MapGet("",async (PublicBookingSiteSettingsService settings, HttpContext http) =>
        {
            http.Response.Headers.CacheControl="private, no-store";
            return Results.Ok(await settings.GetAsync());
        });
        g.MapPut("",async (PublicBookingSiteDraft input,PublicBookingSiteSettingsService settings,HttpContext http) =>
        {
            http.Response.Headers.CacheControl="private, no-store";
            return Results.Ok(await settings.SaveAsync(input,http.User.Identity!.Name!));
        });
    }
}
