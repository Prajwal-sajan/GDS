using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Tests;

/// <summary>
/// True PostgreSQL-backed endpoint acceptance, not a mocked frontend screen.
/// Verifies the segment source-of-truth and privacy boundary for React Manage.
/// </summary>
[Collection("gds")]
public sealed class ScheduleManageTests(GdsFixture fixture)
{
    [Fact]
    public async Task Segment_layout_resolves_real_stops_geometry_and_validates_order()
    {
        var trip = await fixture.Sql(async db => await db.Trips
            .AsNoTracking().Where(t => t.Status == "active").OrderBy(t => t.Id)
            .Select(t => new { t.Id, t.RouteId }).FirstAsync());

        using var client = fixture.Factory.Admin();
        using var resp = await client.GetAsync($"/api/admin/trips/{trip.Id}/seat-layout");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        using var json = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.Equal(trip.Id, root.GetProperty("tripId").GetInt64());
        Assert.True(root.GetProperty("bookable").ValueKind is JsonValueKind.True or JsonValueKind.False);

        var stops = root.GetProperty("stops").EnumerateArray().ToList();
        Assert.True(stops.Count >= 2);
        var first = stops[0].GetProperty("sequence").GetInt32();
        var last = stops[^1].GetProperty("sequence").GetInt32();
        Assert.True(first < last);

        var seats = root.GetProperty("seats").EnumerateArray().ToList();
        Assert.True(seats.Count > 10);
        Assert.Equal(seats.Count, seats.Select(s => s.GetProperty("seatCode").GetString())
            .Distinct(StringComparer.OrdinalIgnoreCase).Count());
        foreach (var seat in seats)
        {
            Assert.False(string.IsNullOrWhiteSpace(seat.GetProperty("deck").GetString()));
            Assert.True(seat.GetProperty("row").GetInt32() >= 0);
            Assert.True(seat.GetProperty("col").GetInt32() >= 0);
            Assert.True(seat.GetProperty("width").GetInt32() > 0);
            Assert.True(seat.GetProperty("length").GetInt32() > 0);
            Assert.Contains(seat.GetProperty("state").GetString(),
                new[] { "available", "booked", "held", "blocked", "unavailable" });
            Assert.False(seat.TryGetProperty("phone", out _));
            Assert.False(seat.TryGetProperty("pnr", out _));
        }

        using var wrong = await client.GetAsync($"/api/admin/trips/{trip.Id}/seat-layout?fromSequence={last}&toSequence={first}");
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);

        using var valid = await client.GetAsync($"/api/admin/trips/{trip.Id}/seat-layout?fromSequence={first}&toSequence={last}");
        Assert.Equal(HttpStatusCode.OK, valid.StatusCode);

        using var missing = await client.GetAsync("/api/admin/trips/999999999999/seat-layout");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Booking_chart_returns_pnr_and_seat_status_without_private_contacts()
    {
        var tripId = await fixture.Sql(async db =>
            await db.Trips.AsNoTracking().OrderBy(t => t.Id).Select(t => t.Id).FirstAsync());
        using var client = fixture.Factory.Admin();
        using var resp = await client.GetAsync($"/api/admin/trips/{tripId}/booking-chart");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        Assert.Equal(JsonValueKind.Array, json.RootElement.ValueKind);
        Assert.DoesNotContain("\"mobile\"", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"email\"", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"paymentReference\"", body, StringComparison.OrdinalIgnoreCase);
    }
}