using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Tests;

/// <summary>
/// PNR is not public and must not expose settlement fields to operations
/// or any passenger identity to a general viewer. Real ASP.NET/PostgreSQL.
/// </summary>
[Collection("gds")]
public sealed class BookingDetailSecurityTests(GdsFixture fixture)
{
    private static string Sha(string key) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)));

    [Fact]
    public async Task Pnr_detail_requires_a_booking_role_and_finance_is_need_to_know()
    {
        var pnr=await fixture.Sql(db=>db.Bookings.AsNoTracking()
            .OrderBy(b=>b.Id).Select(b=>b.Pnr).FirstAsync());
        var settings = new Dictionary<string,string?>
        {
            ["Admin:Keys:2:Name"]="test-viewer",
            ["Admin:Keys:2:KeySha256"]=Sha("test-viewer-key"),
            ["Admin:Keys:2:Role"]="viewer",
            ["Admin:Keys:2:TenantCode"]="demo",
            ["Admin:Keys:3:Name"]="test-operations",
            ["Admin:Keys:3:KeySha256"]=Sha("test-operations-key"),
            ["Admin:Keys:3:Role"]="ops",
            ["Admin:Keys:3:TenantCode"]="demo",
            ["Admin:Keys:4:Name"]="test-accounting",
            ["Admin:Keys:4:KeySha256"]=Sha("test-accounting-key"),
            ["Admin:Keys:4:Role"]="accounts",
            ["Admin:Keys:4:TenantCode"]="demo"
        };
        using var app=new GdsFactory(fixture.Pg.GetConnectionString(),
            fixture.Redis.GetConnectionString(),settings);

        using var viewer=app.Admin("test-viewer-key");
        using var viewerResponse=await viewer.GetAsync("/api/admin/bookings/"+pnr);
        Assert.Equal(HttpStatusCode.Forbidden,viewerResponse.StatusCode);

        using var ops=app.Admin("test-operations-key");
        using var response=await ops.GetAsync("/api/admin/bookings/"+pnr);
        Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        using var json=JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data=json.RootElement;
        Assert.Equal(pnr,data.GetProperty("pnr").GetString());
        Assert.Equal(JsonValueKind.Null,data.GetProperty("finance").ValueKind);
        Assert.False(data.TryGetProperty("contactMobile",out _));
        Assert.False(data.TryGetProperty("contactEmail",out _));
        foreach(var payment in data.GetProperty("payments").EnumerateArray())
            Assert.Equal(JsonValueKind.Null,payment.GetProperty("reference").ValueKind);

        using var accounting=app.Admin("test-accounting-key");
        using var aresponse=await accounting.GetAsync("/api/admin/bookings/"+pnr);
        Assert.Equal(HttpStatusCode.OK,aresponse.StatusCode);

        using var other=app.Admin(GdsFactory.OtherTenantKey);
        using var tresp=await other.GetAsync("/api/admin/bookings/"+pnr);
        Assert.Equal(HttpStatusCode.NotFound,tresp.StatusCode);
    }
}
