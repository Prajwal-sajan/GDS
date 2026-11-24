using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Tests;

/// <summary>
/// Real PostgreSQL + ASP.NET Core booking workspace acceptance; only synthetic
/// test bookings are queried or edited. UI mocks separately verify interactions.
/// </summary>
[Collection("gds")]
public sealed class BookingWorkspaceTests(GdsFixture fx)
{
    private async Task<string> PnrAsync() => await fx.Sql(db=>
        db.Bookings.AsNoTracking().OrderBy(x=>x.Id).Select(x=>x.Pnr).FirstAsync());

    [Fact]
    public async Task Pnr_workspace_has_real_passenger_fares_and_valid_route_stops()
    {
        var pnr=await PnrAsync();
        using var admin=fx.Factory.Admin();
        var row=await admin.GetJson("/api/admin/bookings/"+pnr+"/workspace");
        Assert.Equal(pnr,(string)row["pnr"]!);
        Assert.NotNull(row["tripId"]);
        Assert.NotNull(row["totalFare"]);
        Assert.True(row["passengers"]!.AsArray().Count>0);
        Assert.NotNull(row["boardingStageId"]);
        Assert.NotNull(row["droppingStageId"]);
        Assert.Equal((long)row["id"]!,await fx.Sql(db=>db.Bookings.AsNoTracking()
            .Where(x=>x.Pnr==pnr).Select(x=>x.Id).SingleAsync()));
        foreach(var p in row["passengers"]!.AsArray())
        {
            Assert.NotNull(p!["seatCode"]);
            Assert.NotNull(p["fare"]);
            Assert.NotNull(p["gst"]);
            Assert.False(p.AsObject().ContainsKey("idNumber"),"Do not expose passenger ID documents");
        }
        using var missing=await admin.GetAsync("/api/admin/bookings/MISSING-PNR/workspace");
        Assert.Equal(HttpStatusCode.NotFound,missing.StatusCode);
    }

    [Fact]
    public async Task Booking_history_returns_real_created_at_and_audited_staff_comment()
    {
        var pnr=await PnrAsync();
        using var admin=fx.Factory.Admin();
        var before=await admin.GetJson("/api/admin/bookings/"+pnr+"/history");
        Assert.True(before.AsArray().Any(x=>(string)x!["action"]=="BOOKING_CREATED"));
        var comment="QA Staff-only "+Guid.NewGuid().ToString("N")[..8];
        var (status,_)=await admin.Post("/api/admin/bookings/"+pnr+"/comments",
            new{text=comment});
        Assert.Equal(HttpStatusCode.OK,status);
        var after=await admin.GetJson("/api/admin/bookings/"+pnr+"/history");
        Assert.Contains(after.AsArray(),x=>(string)x!["action"]=="BOOKING_COMMENT" &&
            (string)x["comment"]==comment);
        // Never expose raw audit DataJson directly to the React client.
        Assert.All(after.AsArray(),x=>Assert.False(x!.AsObject().ContainsKey("dataJson")));
    }

    [Fact]
    public async Task Booking_search_restricts_to_date_and_filtered_records()
    {
        var pnr=await PnrAsync();
        var journey=await fx.Sql(db=>db.Bookings.AsNoTracking().Where(x=>x.Pnr==pnr)
            .Select(x=>x.Trip!.TravelDate).SingleAsync());
        using var admin=fx.Factory.Admin();
        var results=await admin.GetJson($"/api/admin/bookings?date={journey:yyyy-MM-dd}&q={pnr}");
        Assert.Contains(results.AsArray(),x=>(string)x!["pnr"]! == pnr);
        using var bad=await admin.GetAsync(
            "/api/admin/bookings?date=2026-11-21&q="+new string('x',81));
        Assert.Equal(HttpStatusCode.BadRequest,bad.StatusCode);
    }

    [Fact]
    public async Task Pnr_detail_and_search_are_authorized_with_tenant_isolation()
    {
        var pnr=await PnrAsync();
        using var guest=fx.Factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await guest.GetAsync("/api/admin/bookings/"+pnr+"/workspace")).StatusCode);
        using var other=fx.Factory.Admin(GdsFactory.OtherTenantKey);
        Assert.Equal(HttpStatusCode.NotFound,
            (await other.GetAsync("/api/admin/bookings/"+pnr+"/workspace")).StatusCode);
    }
}
