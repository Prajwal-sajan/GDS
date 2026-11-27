using System.Text.Json;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record CoachSeatInput(string Code, string Deck, int Row, int Col, int? Width, int? Length, string SeatType);
public sealed record CoachInput(string? Name, string? BusType, string? Pattern, string? Kind, bool? IsAc, List<string>? Amenities, List<CoachSeatInput>? Seats);

/// <summary>
/// Coach templates CRUD (legacy server/api/master.js POST/PUT/DELETE /coaches + domain.js buildLayout()). A coach assigned to a
/// vehicle or a live route keeps its physical seats and seat IDs: layout / pattern / bus-type changes are refused with the legacy
/// message, because seat allocations and bookings reference those seats. Deleting an assigned coach is refused ("Coach is in use").
/// </summary>
public static class CoachEndpoints
{
    private static GdsException Bad(string m, int s = 400) => new(s == 404 ? "NOT_FOUND" : s == 409 ? "CONFLICT" : "VALIDATION", m, s);

    /// <summary>Port of legacy D.buildLayout({kind, pattern}).</summary>
    public static List<CoachSeatInput> BuildLayout(string kind, string pattern)
    {
        var parts = pattern.Split('+'); int l = int.TryParse(parts[0], out var a) ? a : 2, r = parts.Length > 1 && int.TryParse(parts[1], out var b) ? b : 1;
        var seats = new List<CoachSeatInput>();
        void Sleeper(string deck, string suffix, int rows)
        {
            var n = 1;
            for (var row = 0; row < rows; row++) for (var c = 0; c < l + r; c++) seats.Add(new($"{n++}{suffix}", deck, row * 2, c < l ? c : c + 1, 1, 2, "sleeper"));
        }
        if (kind == "sleeper") { Sleeper("LOWER", "L", 6); Sleeper("UPPER", "U", 6); }
        else if (kind == "seater")
        {
            var n = 1;
            for (var row = 0; row < 10; row++) for (var c = 0; c < l + r; c++) seats.Add(new(n++.ToString(), "LOWER", row, c < l ? c : c + 1, 1, 1, "seater"));
        }
        else
        {
            for (var row = 0; row < 6; row++) seats.Add(new($"{row + 1}L", "LOWER", row * 2, 3, 1, 2, "sleeper"));
            var s = 1;
            for (var row = 0; row < 12; row++) foreach (var col in new[] { 0, 1 }) seats.Add(new(s++.ToString(), "LOWER", row, col, 1, 1, "seater"));
            var keep = (l, r); (l, r) = (2, 1); Sleeper("UPPER", "U", 6); (l, r) = keep;
        }
        return seats;
    }

    private static List<CoachSeat> Validate(List<CoachSeatInput> seats)
    {
        if (seats.Count == 0) throw Bad("Invalid coach layout");
        var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase); var cells = new HashSet<string>();
        var list = new List<CoachSeat>();
        foreach (var s in seats)
        {
            var code = (s.Code ?? "").Trim();
            if (code == "" || code.Length > 10) throw Bad("Every seat needs an ID of 1-10 characters");
            if (!codes.Add(code)) throw Bad($"Seat ID {code} is used twice");
            var deck = s.Deck?.ToUpperInvariant() == "UPPER" ? "UPPER" : "LOWER";
            if (s.Row is < 0 or > 40 || s.Col is < 0 or > 10) throw Bad($"Seat {code} is outside the coach grid");
            if (!cells.Add($"{deck}:{s.Row}:{s.Col}")) throw Bad($"Seat {code} overlaps another seat");
            var type = s.SeatType?.ToLowerInvariant() == "sleeper" ? "sleeper" : "seater";
            list.Add(new CoachSeat { Code = code, Deck = deck, Row = s.Row, Col = s.Col, Width = Math.Max(1, s.Width ?? 1), Length = Math.Max(1, s.Length ?? (type == "sleeper" ? 2 : 1)), SeatType = type });
        }
        return list;
    }

    private static async Task<(int Vehicles, int Routes)> UseAsync(GdsDbContext db, long id) =>
        (await db.Vehicles.CountAsync(v => v.CoachTemplateId == id), await db.Routes.CountAsync(r => r.CoachTemplateId == id && r.Status != "deleted"));

    private static void Audit(GdsDbContext db, HttpContext h, string action, long id, object data) =>
        db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = h.User.Identity?.Name ?? "system", Action = action, Entity = "coach", EntityId = id.ToString(), DataJson = JsonSerializer.Serialize(data), At = DateTime.UtcNow });

    public static void MapCoaches(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin/coaches").RequireAuthorization().WithTags("Fleet");

        g.MapGet("/{id:long}", async (long id, GdsDbContext db) =>
        {
            var c = await db.CoachTemplates.AsNoTracking().Include(x => x.Seats).FirstOrDefaultAsync(x => x.Id == id) ?? throw Bad("Coach not found", 404);
            var (v, r) = await UseAsync(db, id);
            return Results.Ok(new
            {
                c.Id, c.Name, c.BusType, c.Pattern, c.IsAc, c.Status, amenities = JsonSerializer.Deserialize<List<string>>(c.AmenitiesJson) ?? [], vehicles = v, routes = r,
                seats = c.Seats.OrderBy(s => s.Deck).ThenBy(s => s.Row).ThenBy(s => s.Col).Select(s => new { s.Code, s.Deck, s.Row, s.Col, s.Width, s.Length, s.SeatType }),
            });
        }).RequireAuthorization(Policies.Operations);

        g.MapGet("/layout-preset", (string? kind, string? pattern) => Results.Ok(new { seats = BuildLayout(kind ?? "seater_sleeper", pattern ?? "2+1") })).RequireAuthorization(Policies.Operations);

        g.MapPost("", async (CoachInput i, GdsDbContext db, HttpContext h) =>
        {
            var name = string.IsNullOrWhiteSpace(i.Name) ? "New coach" : i.Name.Trim();
            var pattern = string.IsNullOrWhiteSpace(i.Pattern) ? "2+1" : i.Pattern.Trim();
            var seats = Validate(i.Seats ?? BuildLayout(i.Kind ?? "seater_sleeper", pattern));
            var id = await db.Database.SqlQueryRaw<long>("SELECT nextval('master_ids') AS \"Value\"").SingleAsync();
            var busType = i.BusType?.Trim() ?? "";
            var c = new CoachTemplate { Id = id, TenantId = db.CurrentTenantId, Name = name, BusType = busType, Pattern = pattern, IsAc = i.IsAc ?? !busType.Contains("non", StringComparison.OrdinalIgnoreCase),
                AmenitiesJson = JsonSerializer.Serialize(i.Amenities ?? []), Seats = seats };
            db.CoachTemplates.Add(c);
            Audit(db, h, "COACH_CREATE", id, new { name, pattern, busType, capacity = seats.Count });
            await db.SaveChangesAsync();
            return Results.Ok(new { id, name, capacity = seats.Count });
        }).RequireAuthorization(Policies.Operations);

        g.MapPut("/{id:long}", async (long id, CoachInput i, GdsDbContext db, HttpContext h) =>
        {
            var c = await db.CoachTemplates.Include(x => x.Seats).FirstOrDefaultAsync(x => x.Id == id) ?? throw Bad("Coach not found", 404);
            var (v, r) = await UseAsync(db, id);
            List<CoachSeat>? seats = i.Seats is null ? null : Validate(i.Seats);
            bool layoutChanged = seats is not null && string.Join("|", seats.OrderBy(s => s.Code).Select(s => $"{s.Code}:{s.Deck}:{s.Row}:{s.Col}:{s.SeatType}"))
                != string.Join("|", c.Seats.OrderBy(s => s.Code).Select(s => $"{s.Code}:{s.Deck}:{s.Row}:{s.Col}:{s.SeatType}"));
            if (v + r > 0 && (layoutChanged || (i.Pattern is not null && i.Pattern != c.Pattern) || (i.BusType is not null && i.BusType != c.BusType)))
                throw Bad("Coach is assigned to vehicles/routes; physical seats and seat IDs cannot be changed without inventory migration", 409);
            if (!string.IsNullOrWhiteSpace(i.Name)) c.Name = i.Name.Trim();
            if (i.BusType is not null) c.BusType = i.BusType.Trim();
            if (!string.IsNullOrWhiteSpace(i.Pattern)) c.Pattern = i.Pattern.Trim();
            if (i.IsAc is not null) c.IsAc = i.IsAc.Value;
            if (i.Amenities is not null) c.AmenitiesJson = JsonSerializer.Serialize(i.Amenities);
            if (layoutChanged) { db.RemoveRange(c.Seats); c.Seats = seats!; }
            Audit(db, h, "COACH_UPDATE", id, new { c.Name, c.Pattern, c.BusType, layoutChanged, capacity = (seats ?? c.Seats).Count });
            await db.SaveChangesAsync();
            return Results.Ok(new { id, capacity = c.Seats.Count });
        }).RequireAuthorization(Policies.Operations);

        g.MapDelete("/{id:long}", async (long id, GdsDbContext db, HttpContext h) =>
        {
            var c = await db.CoachTemplates.Include(x => x.Seats).FirstOrDefaultAsync(x => x.Id == id) ?? throw Bad("Coach not found", 404);
            var (v, r) = await UseAsync(db, id);
            // Deleted routes still reference the coach through historic bookings' seats, so any route reference blocks removal.
            if (v + r > 0 || await db.Routes.AnyAsync(x => x.CoachTemplateId == id)) throw Bad("Coach is in use", 409);
            db.RemoveRange(c.Seats); db.CoachTemplates.Remove(c);
            Audit(db, h, "COACH_DELETE", id, new { c.Name });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true });
        }).RequireAuthorization(Policies.Operations);
    }
}
