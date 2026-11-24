using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

/// <summary>
/// Structured compliance document evidence (not a substitute for PDF bytes or
/// a verified S3 object). A metadata-only record is never presented as a
/// downloadable original or proof of provider verification.
/// </summary>
public static class ComplianceReadEndpoints
{
    public static void MapComplianceRead(this IEndpointRouteBuilder app)
    {
        var g=app.MapGroup("/api/admin").RequireAuthorization(Policies.Operations)
            .WithTags("Vehicle and staff compliance");
        g.MapGet("/vehicles/{id:long}/documents", async(long id,GdsDbContext db)=>
        {
            if(!await db.Vehicles.AsNoTracking().AnyAsync(x=>x.Id==id))
                return Results.NotFound(new{message="Vehicle not found"});
            var docs=await db.ComplianceDocuments.AsNoTracking()
                .Where(x=>x.OwnerType=="vehicle"&&x.OwnerId==id)
                .OrderBy(x=>x.ExpiryDate).ThenBy(x=>x.DocumentType)
                .Select(x=>new {x.Id,x.DocumentType,x.DocumentName,x.ExpiryDate,x.Category,
                    x.VerificationStatus,source="metadata_only",downloadAvailable=false})
                .ToArrayAsync();
            return Results.Ok(docs);
        });
        g.MapGet("/staff/{id:long}/documents", async(long id,GdsDbContext db)=>
        {
            if(!await db.Staff.AsNoTracking().AnyAsync(x=>x.Id==id))
                return Results.NotFound(new{message="Staff member not found"});
            var docs=await db.ComplianceDocuments.AsNoTracking()
                .Where(x=>x.OwnerType=="staff"&&x.OwnerId==id)
                .OrderBy(x=>x.ExpiryDate).ThenBy(x=>x.DocumentType)
                .Select(x=>new {x.Id,x.DocumentType,x.DocumentName,x.ExpiryDate,x.Category,
                    x.VerificationStatus,source="metadata_only",downloadAvailable=false})
                .ToArrayAsync();
            return Results.Ok(docs);
        });
    }
}
