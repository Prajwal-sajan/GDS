using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

/// <summary>
/// Source-backed staff assigned-duties view for the React Staff editor.
/// Not payroll attendance: an assignment is not proof of duty completion.
/// </summary>
public static class StaffWorkspaceEndpoints
{
    public static void MapStaffWorkspace(this IEndpointRouteBuilder app)
    {
        var g=app.MapGroup("/api/admin").RequireAuthorization(Policies.Operations)
            .WithTags("Staff workspace");
        g.MapGet("/staff/{id:long}/duties", async (long id,GdsDbContext db) =>
        {
            if(!await db.Staff.AsNoTracking().AnyAsync(x=>x.Id==id))
                return Results.NotFound(new{message="Staff member not found"});
            return Results.Ok(await db.TripAssignments.AsNoTracking()
                .Where(x=>x.StaffId==id)
                .Join(db.Trips.AsNoTracking(),a=>a.TripId,t=>t.Id,(a,t)=>new{a,t})
                .Join(db.Routes.AsNoTracking(),x=>x.t.RouteId,r=>r.Id,(x,r)=>new{
                    id=x.a.Id,tripId=x.t.Id,x.t.TravelDate,x.t.Status,
                    role=x.a.Role,serviceNumber=r.ServiceNumber,routeName=r.Name,
                    x.a.IsActive,x.a.AssignedAt,x.a.ReplacedAt,x.a.ReplacedReason
                })
                .OrderByDescending(x=>x.TravelDate).ThenByDescending(x=>x.AssignedAt)
                .Take(500).ToArrayAsync());
        });
    }
}
