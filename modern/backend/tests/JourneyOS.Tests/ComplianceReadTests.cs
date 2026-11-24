using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Tests;

/// <summary>Real PostgreSQL metadata access. No fabricated downloadable file objects.</summary>
[Collection("gds")]
public sealed class ComplianceReadTests(GdsFixture fixture)
{
    [Fact]
    public async Task Vehicle_and_staff_documents_are_tenant_isolated_read_only_metadata()
    {
        var (vehicleId,staffId)=await fixture.Sql(async db => (
            await db.Vehicles.AsNoTracking().OrderBy(v=>v.Id).Select(v=>v.Id).FirstAsync(),
            await db.Staff.AsNoTracking().OrderBy(s=>s.Id).Select(s=>s.Id).FirstAsync()));
        using var admin=fixture.Factory.Admin();
        foreach (var url in new[]{
            $"/api/admin/vehicles/{vehicleId}/documents",
            $"/api/admin/staff/{staffId}/documents"
        })
        {
            using var response=await admin.GetAsync(url);
            Assert.Equal(HttpStatusCode.OK,response.StatusCode);
            using var document=JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal(JsonValueKind.Array,document.RootElement.ValueKind);
            foreach(var item in document.RootElement.EnumerateArray())
            {
                Assert.False(item.GetProperty("downloadAvailable").GetBoolean());
                Assert.Equal("metadata_only",item.GetProperty("source").GetString());
                Assert.False(item.TryGetProperty("fileBytes",out _));
                Assert.False(item.TryGetProperty("fileUrl",out _));
            }
        }
        using var other=fixture.Factory.Admin(GdsFactory.OtherTenantKey);
        Assert.Equal(HttpStatusCode.NotFound,(await other.GetAsync(
            $"/api/admin/vehicles/{vehicleId}/documents")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await other.GetAsync(
            $"/api/admin/staff/{staffId}/documents")).StatusCode);
        using var guest=fixture.Factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,(await guest.GetAsync(
            $"/api/admin/vehicles/{vehicleId}/documents")).StatusCode);
    }
}
