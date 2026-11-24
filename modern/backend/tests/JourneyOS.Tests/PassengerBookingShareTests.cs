using System.Net;
using JourneyOS.Api.Operations;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace JourneyOS.Tests;

/// <summary>Approved operator public booking links only; no invented website or city mapping.</summary>
[Collection("gds")]
public sealed class PassengerBookingShareTests(GdsFixture fixture)
{
    [Theory]
    [InlineData("http://novembertravels.com/bus/search/")]
    [InlineData("https://localhost/bus/search/")]
    [InlineData("https://127.0.0.1/bus/search/")]
    [InlineData("https://internal.local/bus/search/")]
    [InlineData("https://internal.local./bus/search/")]
    [InlineData("https://localhost./bus/search/")]
    [InlineData("https://customer:secret@novembertravels.com/bus/search/")]
    [InlineData("https://novembertravels.com/bus/search/?user=abc")]
    [InlineData("https://novembertravels.com/bus/search/#x")]
    [InlineData("https://novembertravels.com:8443/bus/search/")]
    [InlineData("javascript:alert('x')")]
    public void Unsafe_public_site_is_rejected(string unsafeUrl)
    {
        Assert.Throws<GdsException>(() => PassengerBookingShareService.ValidatePublicSite(unsafeUrl));
    }

    [Fact]
    public void Reference_format_exactly_matches_authorized_route_date_link()
    {
        var host = PassengerBookingShareService.ValidatePublicSite("https://novembertravels.com/bus/search/");
        var msg = PassengerBookingShareService.Compose(101, "NTHB1", "Hyderabad", "Bengaluru",
            new DateOnly(2026,11,22), 107258, 102257, host);
        Assert.Equal(
            "Hyderabad → Bengaluru on Sun, 22 Nov, 2026 — pick your seat and book: https://novembertravels.com/bus/search/?fromCity=107258&toCity=102257&journeyDate=2026-11-22",
            msg.Message);
        Assert.Equal("route_date_search", msg.LinkType);
        Assert.False(msg.PreselectsService);
        Assert.DoesNotContain("NTHB1", msg.Url);
        Assert.Throws<GdsException>(() => PassengerBookingShareService.Compose(
            1, "SERV", "City A", "City B", new DateOnly(2026,11,24), 5, 5, host));
    }

    [Fact]
    public async Task Real_postgres_route_must_be_configured_and_city_mapped()
    {
        var (id,from,to,first,second) = await fixture.Sql(async db =>
        {
            var trip = await db.Trips.AsNoTracking()
                .Where(t => t.Status == "active" && t.Bookable && t.TravelDate >= GdsFixture.Today.AddDays(1))
                .OrderBy(t => t.TravelDate).FirstAsync();
            var stops = await db.RouteStops.AsNoTracking().Where(s => s.RouteId == trip.RouteId)
                .OrderBy(s => s.Sequence).ToArrayAsync();
            return (trip.Id, stops[0].CityId, stops[^1].CityId, stops[0].Sequence, stops[^1].Sequence);
        });
        using var admin=fixture.Factory.Admin();
        using var missing=await admin.GetAsync($"/api/admin/trips/{id}/share-link");
        Assert.Equal(HttpStatusCode.Conflict,missing.StatusCode);

        var options = new Dictionary<string,string?>
        {
            ["PublicBooking:Operators:demo:SearchUrl"]="https://operator.example.com/bus/search/",
            [$"PublicBooking:Operators:demo:CityMap:{from}"]="107258",
            [$"PublicBooking:Operators:demo:CityMap:{to}"]="102257"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(options).Build();
        var text = await fixture.Sql(db =>
            new PassengerBookingShareService(db,config,TimeProvider.System)
                .ForTripAsync(id,first,second));
        Assert.Contains("fromCity=107258&toCity=102257",text.Url);
        Assert.StartsWith("https://operator.example.com/bus/search/",text.Url);
        Assert.Equal("route_date_search",text.LinkType);
        Assert.Equal(text.TripId,id);
        Assert.DoesNotContain("PNR",text.Message);
        // Full ASP.NET Core integration path, no mocked public URL and no
        // invented city values: route is read from the seeded PostgreSQL.
        using var configured = new GdsFactory(fixture.Pg.GetConnectionString(),
            fixture.Redis.GetConnectionString(), options);
        using var configuredAdmin = configured.Admin();
        var served = await configuredAdmin.GetJson($"/api/admin/trips/{id}/share-link?fromSequence={first}&toSequence={second}");
        Assert.Equal(text.Message,(string)served["message"]!);
        Assert.Equal("route_date_search",(string)served["linkType"]!);
        Assert.False((bool)served["preselectsService"]!);
        using var other = configured.Admin(GdsFactory.OtherTenantKey);
        using var forbidden = await other.GetAsync($"/api/admin/trips/{id}/share-link");
        Assert.Equal(HttpStatusCode.NotFound,forbidden.StatusCode);
    }

    [Fact]
    public async Task Share_requires_an_authenticated_operator()
    {
        using var guest=fixture.Factory.CreateClient();
        using var response=await guest.GetAsync("/api/admin/trips/1/share-link");
        Assert.Equal(HttpStatusCode.Unauthorized,response.StatusCode);
    }
}
