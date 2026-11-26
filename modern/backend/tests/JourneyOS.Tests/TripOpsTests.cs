using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using static JourneyOS.Tests.RedBusClient;

namespace JourneyOS.Tests;

/// <summary>Schedule overlay operator actions: operator cancel, delay, notify, Update tab (assignment / sync / OTA).</summary>
[Collection("gds")]
public sealed class TripOpsTests(GdsFixture fx)
{
    private HttpClient Rb => fx.Factory.CreateClient();
    private HttpClient Admin => fx.Factory.Admin();
    private async Task<long> TripOf(long inventoryId) => await fx.Sql(db => db.OtaInventories.Where(i => i.Id == inventoryId).Select(i => i.TripId).FirstAsync());
    private static async Task<(HttpStatusCode, JsonNode?)> Put(HttpClient c, string url, object body)
    {
        var r = await c.PutAsJsonAsync(url, body);
        var t = await r.Content.ReadAsStringAsync();
        return (r.StatusCode, string.IsNullOrWhiteSpace(t) ? null : JsonNode.Parse(t));
    }

    [Fact]
    public async Task Operator_cancel_refunds_in_full_and_records_notification()
    {
        var f = await FindTrip(Rb, 2);
        var pnr = await Book(Rb, f, f.Seats[0]!, f.Seats[1]!);
        var seat = (string)f.Seats[1]!["name"]!; // non-primary: route policy forbids cancelling the primary alone
        var (s0, e0) = await Admin.Post($"/api/admin/bookings/{pnr}/cancel", new { seats = Array.Empty<string>(), by = "operator" });
        Assert.Equal(HttpStatusCode.BadRequest, s0);
        Assert.Equal("Select at least one seat to cancel", (string)e0!["message"]!);

        var (s, r) = await Admin.Post($"/api/admin/bookings/{pnr}/cancel", new { seats = new[] { seat }, by = "operator", reason = "Bus breakdown", notify = true });
        Assert.True(s == HttpStatusCode.OK, r?.ToJsonString());
        Assert.Equal(0m, (decimal)r!["charge"]!);
        Assert.Equal("PARTIALLY_CANCELLED", (string)r["status"]!);
        Assert.Equal(1, (int)r["recorded"]!);
        Assert.False((bool)r["delivery_verified"]!);
        Assert.True(await fx.Sql(db => db.ChatMessages.AnyAsync(m => m.ConversationId.Contains(pnr) && m.Direction == "out")));
        // release the remaining seat so shared trips stay clean for other tests
        var (sc, rc) = await Admin.Post($"/api/admin/bookings/{pnr}/cancel", new { seats = new[] { (string)f.Seats[0]!["name"]! }, by = "operator" });
        Assert.True(sc == HttpStatusCode.OK, rc?.ToJsonString());
        Assert.Equal("CANCELLED", (string)rc!["status"]!);
    }

    [Fact]
    public async Task Delay_validates_reason_and_range_and_shifts_departure()
    {
        var f = await FindTrip(Rb, 1);
        var trip = await TripOf(f.InventoryId);
        var (s1, e1) = await Admin.Post($"/api/admin/trips/{trip}/delay", new { minutes = 10 });
        Assert.Equal("Reason is required for a timing change", (string)e1!["message"]!);
        var (s2, e2) = await Admin.Post($"/api/admin/trips/{trip}/delay", new { minutes = 9999, reason = "x" });
        Assert.Equal(HttpStatusCode.BadRequest, s2);

        var before = await fx.Sql(db => db.Trips.Where(t => t.Id == trip).Select(t => new { t.DepartureTime, R = t.Route!.DepartureTime }).FirstAsync());
        var (s3, r3) = await Admin.Post($"/api/admin/trips/{trip}/delay", new { minutes = 20, reason = "Traffic" });
        Assert.True(s3 == HttpStatusCode.OK, r3?.ToJsonString());
        Assert.Equal(20, (int)r3!["delta_minutes"]!);
        var after = await fx.Sql(db => db.Trips.Where(t => t.Id == trip).Select(t => new { t.DepartureTime, t.DelayMinutes, t.DelayReason }).FirstAsync());
        Assert.Equal((before.DepartureTime ?? before.R).AddMinutes(20), after.DepartureTime);
        Assert.Equal(20, after.DelayMinutes);
        Assert.Equal("Traffic", after.DelayReason);
        // Resetting to 0 shifts back by the delta only.
        var (_, r4) = await Admin.Post($"/api/admin/trips/{trip}/delay", new { minutes = 0, reason = "" });
        Assert.Equal(-20, (int)r4!["delta_minutes"]!);
        Assert.Equal(before.DepartureTime ?? before.R, await fx.Sql(db => db.Trips.Where(t => t.Id == trip).Select(t => t.DepartureTime!.Value).FirstAsync()));
    }

    [Fact]
    public async Task Notify_validates_template_and_records_per_pnr()
    {
        var f = await FindTrip(Rb, 1);
        var trip = await TripOf(f.InventoryId);
        var pnr = await Book(Rb, f, f.Seats[0]!);
        var (s1, e1) = await Admin.Post($"/api/admin/trips/{trip}/notify", new { template = "x", pnrs = new[] { pnr } });
        Assert.Equal("Unsupported notification template", (string)e1!["message"]!);
        var (s2, e2) = await Admin.Post($"/api/admin/trips/{trip}/notify", new { template = "custom", pnrs = new[] { pnr }, text = "" });
        Assert.Equal("Message text is required (maximum 1000 characters)", (string)e2!["message"]!);
        var (s3, r3) = await Admin.Post($"/api/admin/trips/{trip}/notify", new { template = "ticket_confirmation", pnrs = new[] { pnr } });
        Assert.True(s3 == HttpStatusCode.OK, r3?.ToJsonString());
        Assert.Equal(1, (int)r3!["recorded"]!);
        await Admin.Post($"/api/admin/bookings/{pnr}/cancel", new { seats = new[] { (string)f.Seats[0]!["name"]! }, by = "operator" });
    }

    [Fact]
    public async Task Update_assignment_overrides_trip_and_sync_restores_route()
    {
        // A far-future active trip no other test touches (sync clears trip assignments).
        var trip = await fx.Sql(db => db.Trips.Where(t => t.Status == "active" && t.DeletedAt == null && !db.Bookings.Any(b => b.TripId == t.Id))
            .OrderByDescending(t => t.TravelDate).Select(t => t.Id).FirstAsync());
        var (sg, d) = await Admin.Get($"/api/admin/schedules/{trip}/update-v51");
        Assert.True(sg == HttpStatusCode.OK, d?.ToJsonString());
        Assert.True((bool)d!["can_modify"]!);
        Assert.Equal("Route", (string)d["call_source"]!);

        var coach = await fx.Sql(db => db.Trips.Where(t => t.Id == trip).Select(t => t.Route!.CoachTemplateId).FirstAsync());
        var date = await fx.Sql(db => db.Trips.Where(t => t.Id == trip).Select(t => t.TravelDate).FirstAsync());
        var busy = fx.Sql(db => db.TripAssignments.Where(a => a.IsActive && a.TripId != trip && db.Trips.Any(t => t.Id == a.TripId && t.TravelDate == date)).Select(a => a.VehicleId).ToListAsync());
        var used = await busy;
        var vehicle = await fx.Sql(db => db.Vehicles.Where(v => v.CoachTemplateId == coach && v.Status == "active" && !used.Contains(v.Id)).Select(v => (long?)v.Id).FirstOrDefaultAsync());

        var (sb, eb) = await Put(Admin, $"/api/admin/schedules/{trip}/update-v51/assignment", new { vehicle_id = vehicle, crew = new[] { new { role = "Pilot", staff_id = 1 } } });
        Assert.Equal("Invalid crew role or staff selection", (string)eb!["message"]!);
        var (se, ee) = await Put(Admin, $"/api/admin/schedules/{trip}/update-v51/assignment", new { vehicle_id = vehicle, crew = Array.Empty<object>(), escalation_contacts = new[] { "12" } });
        Assert.Equal("Escalation numbers must contain 10–15 digits", (string)ee!["message"]!);

        var (sa, a) = await Put(Admin, $"/api/admin/schedules/{trip}/update-v51/assignment", new
        {
            vehicle_id = vehicle, crew = Array.Empty<object>(), call_settings = new { cloud_calling = true }, escalation_contacts = new[] { "9876543210" }, cab_mode = "Both",
        });
        Assert.True(sa == HttpStatusCode.OK, a?.ToJsonString());
        Assert.Equal("Schedule", (string)a!["assignment_source"]!);
        Assert.Equal("Schedule", (string)a["call_source"]!);
        Assert.Equal("Both", (string)a["cab_mode"]!);
        Assert.True((bool)a["call_settings"]!["cloud_calling"]!);
        Assert.False((bool)a["sync_with_route"]!);

        var (ss, s) = await Put(Admin, $"/api/admin/schedules/{trip}/update-v51/sync", new { enabled = true });
        Assert.True(ss == HttpStatusCode.OK, s?.ToJsonString());
        Assert.Equal("Route", (string)s!["call_source"]!);
        Assert.Equal("Off", (string)s["cab_mode"]!);
        Assert.True((bool)s["sync_with_route"]!);

        var ota = await Admin.PostAsync($"/api/admin/schedules/{trip}/update-v51/sync-ota", null);
        Assert.Equal(HttpStatusCode.NotImplemented, ota.StatusCode);
    }
}
