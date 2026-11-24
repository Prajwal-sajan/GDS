using System.Net;
using System.Net.Http.Json;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using static JourneyOS.Tests.RedBusClient;

namespace JourneyOS.Tests;

/// <summary>Real PostgreSQL settings -> Share integration; no invented website/city IDs.</summary>
[Collection("gds")]
public sealed class PublicBookingSiteSettingsTests(GdsFixture fx)
{
    [Fact]
    public async Task Website_and_city_map_are_audited_tenant_scoped_and_used_by_trip_share()
    {
        var (tripId,from,to,first,last) = await fx.Sql(async db =>
        {
            var trip = await db.Trips.AsNoTracking().Where(t=>t.Status=="active"&&t.Bookable&&
                t.TravelDate>=GdsFixture.Today.AddDays(3)).OrderBy(t=>t.TravelDate).FirstAsync();
            var stops=await db.RouteStops.AsNoTracking().Where(s=>s.RouteId==trip.RouteId)
                .OrderBy(s=>s.Sequence).ToArrayAsync();
            return(trip.Id,stops[0].CityId,stops[^1].CityId,stops[0].Sequence,stops[^1].Sequence);
        });
        using var admin=fx.Factory.Admin();
        using var guest=fx.Factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,(await guest.GetAsync("/api/admin/settings/booking-site")).StatusCode);
        using var other=fx.Factory.Admin(GdsFactory.OtherTenantKey);
        var otherSettings=await other.GetJson("/api/admin/settings/booking-site");
        Assert.Equal("other",(string)otherSettings["operatorCode"]!);
        Assert.False((bool)otherSettings["configured"]!);
        try
        {
            var response=await admin.PutAsJsonAsync("/api/admin/settings/booking-site",
                new { searchUrl="https://operator.example.com/bus/search/",
                    cityMappings=new[]{new{cityId=from,publicCityId=107258L},new{cityId=to,publicCityId=102257L}}});
            Assert.Equal(HttpStatusCode.OK,response.StatusCode);
            var site=await admin.GetJson("/api/admin/settings/booking-site");
            Assert.Equal("database",(string)site["source"]!);
            Assert.True((bool)site["configured"]!);
            Assert.Equal("https://operator.example.com/bus/search/",(string)site["searchUrl"]!);

            var share=await admin.GetJson($"/api/admin/trips/{tripId}/share-link?fromSequence={first}&toSequence={last}");
            var url=(string)share["url"]!;
            Assert.StartsWith("https://operator.example.com/bus/search/?fromCity=107258&toCity=102257&journeyDate=",url);
            Assert.Equal("route_date_search",(string)share["linkType"]!);
            Assert.False((bool)share["preselectsService"]!);

            using var wrong=await admin.PutAsJsonAsync("/api/admin/settings/booking-site",
                new {searchUrl="http://localhost/unsafe",cityMappings=new[]{new{cityId=from,publicCityId=9L}}});
            Assert.Equal(HttpStatusCode.Conflict,wrong.StatusCode);
            var after=await admin.GetJson("/api/admin/settings/booking-site");
            Assert.Equal("https://operator.example.com/bus/search/",(string)after["searchUrl"]!);
            Assert.True(await fx.Sql(db=>db.AuditLogs.AnyAsync(a=>a.Entity=="public_booking_site"&&
                a.Action=="BOOKING_SITE_CONFIG")));
            using var cross=await other.GetAsync($"/api/admin/trips/{tripId}/share-link");
            Assert.Equal(HttpStatusCode.NotFound,cross.StatusCode);

            var cleared=await admin.PutAsJsonAsync("/api/admin/settings/booking-site",
                new {searchUrl="",cityMappings=Array.Empty<object>()});
            Assert.Equal(HttpStatusCode.OK,cleared.StatusCode);
            using var blocked=await admin.GetAsync($"/api/admin/trips/{tripId}/share-link?fromSequence={first}&toSequence={last}");
            Assert.Equal(HttpStatusCode.Conflict,blocked.StatusCode);
        }
        finally
        {
            // Shared xUnit PostgreSQL fixture: never leak web settings to tests that
            // specifically assert unconfigured-by-default behavior.
            await fx.Sql(async db=>
            {
                var row=await db.PublicBookingSites.SingleOrDefaultAsync();
                if(row is not null){db.PublicBookingSites.Remove(row);await db.SaveChangesAsync();}
                return 0;
            });
        }
    }
}
