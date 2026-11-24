using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using static JourneyOS.Tests.RedBusClient;

namespace JourneyOS.Tests;

/// <summary>PostgreSQL integration tests against real route authoring endpoints,
/// transaction behavior, safe trip ID migration and immutable sold route contracts.</summary>
[Collection("gds")]
public sealed class RouteManagementTests(GdsFixture fx)
{
    [Fact]
    public async Task Route_authoring_is_audited_tenant_scoped_validated_and_can_generate_modern_trip_ids()
    {
        var (cityIds, coachId) = await fx.Sql(async db => (
            await db.Cities.Where(c => c.IsActive).OrderBy(c=>c.Id).Select(c=>c.Id).Take(3).ToArrayAsync(),
            await db.CoachTemplates.Select(c=>c.Id).FirstAsync()));
        Assert.Equal(3, cityIds.Length);
        var (one,two,three) = (cityIds[0],cityIds[1],cityIds[2]);
        var service = "RT" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
        object Payload(string name, string status="draft", long? lastCity=null) => new
        {
            serviceNumber=service,name,coachTemplateId=coachId,departureTime="17:30:00",status,
            partialCancellationAllowed=true,primaryPaxCancellable=false,
            maxSeatsPerTicket=6,updateCutoffMinutes=120,
            stops=new []{
                new {cityId=one,day=1,time="17:30:00"},
                new {cityId=two,day=1,time="22:30:00"},
                new {cityId=lastCity??three,day=2,time="07:30:00"}
            },
            stages=new []{
                new {stopSequence=0,kind="pickup",name="Main pickup",day=1,time="17:45:00",
                    address="Operator counter",landmark="Bus stand",contactNumber=(string?)null,prime=true},
                new {stopSequence=2,kind="drop",name="Main drop",day=2,time="07:40:00",
                    address="Arrival stand",landmark=(string?)null,contactNumber=(string?)null,prime=true}
            },
            fares=new []{
                new {fromSequence=0,toSequence=1,seater=500m,sleeperLower=799m,sleeperUpper=849m},
                new {fromSequence=1,toSequence=2,seater=300m,sleeperLower=500m,sleeperUpper=550m},
                new {fromSequence=0,toSequence=2,seater=800m,sleeperLower=1199m,sleeperUpper=1299m}
            }
        };
        var admin = fx.Factory.Admin();
        var (createStatus, created) = await admin.Post("/api/admin/routes", Payload("Unpublished route"));
        Assert.Equal(HttpStatusCode.Created, createStatus);
        Assert.NotNull(created);
        var routeId = (long)created!["id"]!;
        Assert.True(routeId > 999, "Modern master route ID is larger than legacy trip-id's 3-digit route portion");

        var detail = await admin.GetJson($"/api/admin/routes/{routeId}/full");
        Assert.Equal(3, detail["stops"]!.AsArray().Count);
        Assert.Equal(2, detail["stages"]!.AsArray().Count);
        Assert.Equal(3, detail["fares"]!.AsArray().Count);
        Assert.False((bool)detail["structuralLocked"]!);
        Assert.Equal("draft",(string)detail["status"]!);
        Assert.True(await fx.Sql(db=>db.AuditLogs.AnyAsync(x=>x.Entity=="route"&&x.EntityId==routeId.ToString()&&x.Action=="ROUTE_CREATE")));

        var (duplicate, _) = await admin.Post("/api/admin/routes", Payload("Duplicate service number"));
        Assert.Equal(HttpStatusCode.Conflict,duplicate);
        var (invalid, _) = await admin.Post("/api/admin/routes", Payload("Invalid duplicate city","draft",two));
        Assert.Equal(HttpStatusCode.BadRequest,invalid);

        var response = await admin.PutAsJsonAsync($"/api/admin/routes/{routeId}",Payload("Published corrected route","active"));
        Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        Assert.Equal("Published corrected route",await fx.Sql(db=>db.Routes.Where(r=>r.Id==routeId).Select(r=>r.Name).SingleAsync()));
        Assert.True(await fx.Sql(db=>db.AuditLogs.AnyAsync(x=>x.Entity=="route"&&x.EntityId==routeId.ToString()&&x.Action=="ROUTE_UPDATE")));

        var date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(8);
        var (generateStatus, gen) = await admin.Post($"/api/admin/routes/{routeId}/generate",new {from=date.ToString("yyyy-MM-dd"),to=date.ToString("yyyy-MM-dd")});
        Assert.Equal(HttpStatusCode.OK,generateStatus);
        Assert.Equal(1,(int)gen!["created"]!);
        var tripId=await fx.Sql(db=>db.Trips.Where(t=>t.RouteId==routeId&&t.TravelDate==date).Select(t=>t.Id).SingleAsync());
        Assert.True(tripId>0);
        var (againStatus,again)=await admin.Post($"/api/admin/routes/{routeId}/generate",new {from=date.ToString("yyyy-MM-dd"),to=date.ToString("yyyy-MM-dd")});
        Assert.Equal(HttpStatusCode.OK,againStatus);
        Assert.Equal(0,(int)again!["created"]!);
        using var lockedResponse=await admin.PutAsJsonAsync($"/api/admin/routes/{routeId}",Payload("Unsafe mutation","active"));
        Assert.Equal(HttpStatusCode.Conflict,lockedResponse.StatusCode);
        var locked=JsonNode.Parse(await lockedResponse.Content.ReadAsStringAsync());
        Assert.Equal("ROUTE_HAS_TRIPS",(string)locked!["errorCode"]!);
        detail=await admin.GetJson($"/api/admin/routes/{routeId}/full");
        Assert.True((bool)detail["structuralLocked"]!);
        Assert.Equal("Published corrected route",(string)detail["name"]!);
    }

    [Fact]
    public async Task Route_catalog_and_authoring_require_operator_permissions()
    {
        using var anon=fx.Factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,(await anon.GetAsync("/api/admin/cities")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await anon.GetAsync("/api/admin/coaches")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await anon.PostAsJsonAsync("/api/admin/routes",new {})).StatusCode);
        using var admin=fx.Factory.Admin();
        Assert.Equal(HttpStatusCode.OK,(await admin.GetAsync("/api/admin/cities")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await admin.GetAsync("/api/admin/coaches")).StatusCode);
    }
}