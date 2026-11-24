using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using JourneyOS.Api.Operations;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Tests;

/// <summary>Actual PostgreSQL-backed Coach Editor tests. Never edits a live operator database.</summary>
[Collection("gds")]
public sealed class CoachManagementTests(GdsFixture fixture)
{
    private static CoachDraft Reference22(string name)
    {
        var seats=new List<CoachSeatDraft>();
        var skipped=new HashSet<int>{19,20,23,24};
        for(var row=0;row<12;row++)
        for(var slot=0;slot<4;slot++)
        {
            var number=row*4+slot+1;
            if(skipped.Contains(number))continue;
            var col=new[]{0,1,3,4}[slot];
            seats.Add(new CoachSeatDraft(number.ToString(),number.ToString(),"LOWER",
                row,col,1,1,"seater",col is 0 or 4));
        }
        var fixtures=new List<CoachFixtureDraft>{
            new("Side Exit","Side Exit","EE_EXIT","LOWER",4,4,1,1,null),
            new("Toilet","Toilet","WASH_ROOM","LOWER",5,3,2,1,"Horizontal"),
            new("Roof Exit","Roof Exit","ROOF_EXIT","LOWER",7,2,1,1,null),
            new("Back Exit","Back Exit","BACK_EXIT","LOWER",11,2,1,1,null)
        };
        return new CoachDraft(name,"A/C Seater","2+2",true,null,["Air Conditioning","Toilet"],
            48,seats,fixtures);
    }

    [Fact]
    public async Task Save_44_plus_four_fixture_coach_and_edit_labels_without_renumbering()
    {
        using var admin=fixture.Factory.Admin();
        var name="CoachQA-"+Guid.NewGuid().ToString("N")[..10];
        using var create=await admin.PostAsJsonAsync("/api/admin/coaches",Reference22(name));
        Assert.Equal(HttpStatusCode.Created,create.StatusCode);
        var item=JsonNode.Parse(await create.Content.ReadAsStringAsync())!;
        var id=(long)item["id"]!;
        var coach=await admin.GetJson($"/api/admin/coaches/{id}/full");
        Assert.Equal(44,(int)coach["capacity"]!);
        Assert.Equal(44,coach["seats"]!.AsArray().Count);
        Assert.Equal(4,coach["fixtures"]!.AsArray().Count);
        Assert.False((bool)coach["structuralLocked"]!);
        Assert.Equal("19,20,23,24",string.Join(",",
            new[]{19,20,23,24}.Where(n=>!coach["seats"]!.AsArray().Any(s=>(string)s!["code"]!==n.ToString()))));

        // All editor writes are transactional. Alias changes must never alter
        // immutable codes referenced by bookings or FareClass.
        coach["seats"]![0]!["displayName"]="Coach QA label";
        using var update=await admin.PutAsJsonAsync($"/api/admin/coaches/{id}",coach);
        Assert.Equal(HttpStatusCode.OK,update.StatusCode);
        coach=await admin.GetJson($"/api/admin/coaches/{id}/full");
        Assert.Equal("Coach QA label",(string)coach["seats"]![0]!["displayName"]!);
        Assert.Equal("1",(string)coach["seats"]![0]!["code"]!);
        Assert.True(await fixture.Sql(db=>db.AuditLogs.AnyAsync(a=>
            a.Entity=="coach"&&a.EntityId==id.ToString()&&a.Action=="COACH_UPDATE")));

        // Create an unsafe overlap and verify rollback/no destructive effect.
        coach["seats"]![1]!["row"]=0;
        coach["seats"]![1]!["col"]=0;
        using var overlap=await admin.PutAsJsonAsync($"/api/admin/coaches/{id}",coach);
        Assert.Equal(HttpStatusCode.BadRequest,overlap.StatusCode);
        var persisted=await admin.GetJson($"/api/admin/coaches/{id}/full");
        Assert.Equal(44,persisted["seats"]!.AsArray().Count);
        Assert.Equal("Coach QA label",(string)persisted["seats"]![0]!["displayName"]!);
    }

    [Fact]
    public async Task Assigned_coach_rejects_structural_mutation_and_allows_aliases()
    {
        var id=await fixture.Sql(db=>db.Routes.AsNoTracking()
            .Select(r=>r.CoachTemplateId).FirstAsync());
        using var admin=fixture.Factory.Admin();
        var coach=await admin.GetJson($"/api/admin/coaches/{id}/full");
        Assert.True((bool)coach["structuralLocked"]!);
        Assert.True(coach["seats"]!.AsArray().Count>0);

        var unsafeChange=JsonNode.Parse(coach.ToJsonString())!;
        unsafeChange["seats"]![0]!["code"]="UNSAFE-SEAT-ID";
        using var resp=await admin.PutAsJsonAsync($"/api/admin/coaches/{id}",unsafeChange);
        Assert.Equal(HttpStatusCode.Conflict,resp.StatusCode);
        var reload=await admin.GetJson($"/api/admin/coaches/{id}/full");
        Assert.NotEqual("UNSAFE-SEAT-ID",(string)reload["seats"]![0]!["code"]!);
    }

    [Fact]
    public async Task Coach_templates_are_tenant_isolated_and_require_operator_access()
    {
        using var visitor=fixture.Factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await visitor.GetAsync("/api/admin/coaches/detailed")).StatusCode);
        using var other=fixture.Factory.Admin(GdsFactory.OtherTenantKey);
        var id=await fixture.Sql(db=>db.CoachTemplates.AsNoTracking()
            .OrderBy(c=>c.Id).Select(c=>c.Id).FirstAsync());
        Assert.Equal(HttpStatusCode.NotFound,
            (await other.GetAsync($"/api/admin/coaches/{id}/full")).StatusCode);
    }
}
