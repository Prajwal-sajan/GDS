using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Tests;

/// <summary>Real Postgres staff duty history, not unrecorded attendance/payroll.</summary>
[Collection("gds")]
public sealed class StaffWorkspaceTests(GdsFixture fx)
{
    [Fact]
    public async Task Staff_duty_history_is_authoritative_ordered_and_tenant_scoped()
    {
        var staffId=await fx.Sql(db=>db.Staff.AsNoTracking()
            .OrderBy(s=>s.Id).Select(s=>s.Id).FirstAsync());
        using var admin=fx.Factory.Admin();
        using var response=await admin.GetAsync($"/api/admin/staff/{staffId}/duties");
        Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        using var json=JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Array,json.RootElement.ValueKind);
        foreach(var duty in json.RootElement.EnumerateArray())
        {
            Assert.True(duty.TryGetProperty("tripId",out _));
            Assert.True(duty.TryGetProperty("serviceNumber",out _));
            Assert.True(duty.TryGetProperty("role",out _));
            Assert.True(duty.TryGetProperty("assignedAt",out _));
            Assert.False(duty.TryGetProperty("salaryAmount",out _));
            Assert.False(duty.TryGetProperty("payout",out _));
        }
        using var other=fx.Factory.Admin(GdsFactory.OtherTenantKey);
        Assert.Equal(HttpStatusCode.NotFound,
            (await other.GetAsync($"/api/admin/staff/{staffId}/duties")).StatusCode);
        using var guest=fx.Factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await guest.GetAsync($"/api/admin/staff/{staffId}/duties")).StatusCode);
    }
}
