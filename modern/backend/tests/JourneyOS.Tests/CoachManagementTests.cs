using System.Net;
using System.Net.Http.Json;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using static JourneyOS.Tests.RedBusClient;

namespace JourneyOS.Tests;

/// <summary>
/// PostgreSQL + HTTP acceptance: editable/unreferenced coach, non-bookable cabin fixtures,
/// route-seat immutability, cross-tenant isolation, duplicate and collision guards.
/// </summary>
[Collection("gds")]
public sealed class CoachManagementTests(GdsFixture fx)
{
    private static object Draft(string name = "QA New Coach", bool overlap = false, string? secondCode = null) => new
    {
        name, busType = "A/C Seater Sleeper", pattern = "2+1", isAc = true,
        amenities = new[] { "ac", "charging" },
        seats = new[]
        {
            new {code="1L",deck="LOWER",row=1,col=0,width=1,length=2,seatType="sleeper",isWindow=true},
            new {code=secondCode??"2L",deck="LOWER",row=1,col=overlap?0:2,width=1,length=2,seatType="sleeper",isWindow=false}
        },
        fixtures = new[] {new {kind="toilet",label="Cabin toilet",deck="LOWER",row=4,col=3,width=2,length=2}}
    };

    [Fact]
    public async Task Create_update_delete_and_clone_are_transactional_and_inventoried()
    {
        using var client = fx.Factory.Admin();
        var (created, payload) = await client.Post("/api/admin/coaches", Draft());
        Assert.Equal(HttpStatusCode.Created, created);
        var id = (long)payload!["id"]!;
        var full = await client.GetJson($"/api/admin/coaches/{id}/full");
        Assert.False((bool)full["structuralLocked"]!);
        Assert.Equal(2, (int)full["seatCount"]!);
        Assert.Single(full["fixtures"]!.AsArray());
        Assert.Equal(2, full["amenities"]!.AsArray().Count);
        var catalog=await client.GetJson("/api/admin/coaches");
        Assert.Contains(catalog.AsArray(), c => (long)c!["id"]! == id && (int)c["seatCount"]! == 2);
        Assert.True(await fx.Sql(db=>db.AuditLogs.AnyAsync(a=>a.Entity=="coach"&&a.EntityId==id.ToString()&&a.Action=="COACH_CREATE")));

        var update = await client.PutAsJsonAsync($"/api/admin/coaches/{id}",Draft("Updated Cabin Layout"));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        full = await client.GetJson($"/api/admin/coaches/{id}/full");
        Assert.Equal("Updated Cabin Layout",(string)full["name"]!);

        var (cloned, clone) = await client.Post($"/api/admin/coaches/{id}/clone", new {});
        Assert.Equal(HttpStatusCode.Created, cloned);
        var copyId=(long)clone!["id"]!;
        Assert.NotEqual(id,copyId);
        var copy=await client.GetJson($"/api/admin/coaches/{copyId}/full");
        Assert.Contains("Copy",(string)copy["name"]!);
        Assert.Equal(2, (int)copy["seatCount"]!);
        Assert.Single(copy["fixtures"]!.AsArray());
        var deleted = await client.DeleteAsync($"/api/admin/coaches/{id}");
        Assert.Equal(HttpStatusCode.NoContent,deleted.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync($"/api/admin/coaches/{id}/full")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await client.GetAsync($"/api/admin/coaches/{copyId}/full")).StatusCode);
    }

    [Fact]
    public async Task Duplicate_seats_and_physical_overlap_are_rejected_without_mutation()
    {
        using var client=fx.Factory.Admin();
        var (overlap, body) = await client.Post("/api/admin/coaches",Draft(overlap:true));
        Assert.Equal(HttpStatusCode.BadRequest,overlap);
        Assert.Equal("COACH_OVERLAP",(string)body!["errorCode"]!);
        var (duplicate, dup) = await client.Post("/api/admin/coaches",Draft(secondCode:"1l"));
        Assert.Equal(HttpStatusCode.BadRequest,duplicate);
        Assert.Equal("COACH_SEATS",(string)dup!["errorCode"]!);
    }

    [Fact]
    public async Task Linked_coach_layout_is_read_only_even_without_live_trips()
    {
        var id=await fx.Sql(db=>db.Routes.Select(r=>r.CoachTemplateId).FirstAsync());
        using var client=fx.Factory.Admin();
        var full=await client.GetJson($"/api/admin/coaches/{id}/full");
        Assert.True((bool)full["structuralLocked"]!);
        var response=await client.PutAsJsonAsync($"/api/admin/coaches/{id}",Draft("Unsafe overwrite"));
        Assert.Equal(HttpStatusCode.Conflict,response.StatusCode);
        var deleted=await client.DeleteAsync($"/api/admin/coaches/{id}");
        Assert.Equal(HttpStatusCode.Conflict,deleted.StatusCode);
        var (cloned,copy)=await client.Post($"/api/admin/coaches/{id}/clone",new {});
        Assert.Equal(HttpStatusCode.Created,cloned);
        var copyId=(long)copy!["id"]!;
        Assert.NotEqual(id,copyId);
        Assert.False((bool)(await client.GetJson($"/api/admin/coaches/{copyId}/full"))["structuralLocked"]!);
    }

    [Fact]
    public async Task Bookable_schedule_layout_displays_physical_fixtures_without_inflating_seat_capacity()
    {
        var (tripId, coachId) = await fx.Sql(async db =>
        {
            var trip = await db.Trips.AsNoTracking().Where(t => t.Status == "active")
                .OrderBy(t => t.Id).FirstAsync();
            return (trip.Id, await db.Routes.Where(r => r.Id == trip.RouteId)
                .Select(r => r.CoachTemplateId).FirstAsync());
        });
        long fixtureId=0;
        using var admin=fx.Factory.Admin();
        var before=await admin.GetJson($"/api/admin/trips/{tripId}/seat-layout");
        var seatsBefore=before["seats"]!.AsArray().Count;
        try
        {
            fixtureId=await fx.Sql(async db =>
            {
                var f=new CoachFixture { CoachTemplateId=coachId, Kind="roof_exit",
                    Label="QA roof exit", Deck="UPPER", Row=28, Col=7, Width=1, Length=1 };
                db.CoachFixtures.Add(f);
                await db.SaveChangesAsync();
                return f.Id;
            });
            var after=await admin.GetJson($"/api/admin/trips/{tripId}/seat-layout");
            Assert.Equal(seatsBefore,after["seats"]!.AsArray().Count);
            Assert.Contains(after["fixtures"]!.AsArray(),
                f => (string)f!["label"]! == "QA roof exit" && (string)f["kind"]! == "roof_exit");
        }
        finally
        {
            if (fixtureId>0) await fx.Sql(async db =>
            {
                var f=await db.CoachFixtures.FindAsync(fixtureId);
                if(f is not null){db.CoachFixtures.Remove(f);await db.SaveChangesAsync();}
                return 0;
            });
        }
    }

    [Fact]
    public async Task Tenant_and_role_controls_own_every_coach_detail_and_write()
    {
        using var anonymous=fx.Factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,(await anonymous.GetAsync("/api/admin/coaches/1/full")).StatusCode);
        var id=await fx.Sql(db=>db.CoachTemplates.Select(x=>x.Id).FirstAsync());
        using var other=fx.Factory.Admin(GdsFactory.OtherTenantKey);
        Assert.Equal(HttpStatusCode.NotFound,(await other.GetAsync($"/api/admin/coaches/{id}/full")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await other.DeleteAsync($"/api/admin/coaches/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await other.PutAsJsonAsync($"/api/admin/coaches/{id}",Draft())).StatusCode);
    }
}
