using System.Text.RegularExpressions;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Operations;

public sealed record CoachSeatInput(string Code, string Deck, int Row, int Col, int Width, int Length,
    string SeatType, bool IsWindow);
public sealed record CoachFixtureInput(string Kind, string Label, string Deck, int Row, int Col,
    int Width, int Length);
public sealed record CoachDraft(string Name, string BusType, string Pattern, bool IsAc,
    string[]? Amenities, List<CoachSeatInput>? Seats, List<CoachFixtureInput>? Fixtures);
public sealed record CoachFull(long Id, string Name, string BusType, string Pattern, bool IsAc,
    string[] Amenities, CoachSeatInput[] Seats, CoachFixtureInput[] Fixtures,
    bool StructuralLocked, int RouteReferences, int VehicleReferences, int SeatCount);

/// <summary>
/// Native, tenant-scoped coach authoring. A published/assigned layout is immutable:
/// its seat PKs/codes are referenced by booking and allocation history and OTA inventory.
/// Clone to create a new version rather than mutating a referenced layout.
/// </summary>
public sealed class CoachManagementService(GdsDbContext db, TimeProvider clock)
{
    private const int MaxRows = 30, MaxColumns = 8, MaxSeats = 80, MaxFixtures = 40;
    private static readonly HashSet<string> AllowedFixtureKinds = new(StringComparer.Ordinal)
    {
        "emergency_exit", "roof_exit", "toilet", "stairs", "driver", "door", "luggage", "other"
    };
    private static readonly HashSet<string> AllowedAmenities = new(StringComparer.Ordinal)
    {
        "ac", "charging", "wifi", "blanket", "water", "reading_light", "curtain",
        "cctv", "usb", "tv", "pillow", "toilet"
    };

    private static void ValidateGeometry(string deck, int row, int col, int width, int length, string item)
    {
        if (deck is not ("LOWER" or "UPPER") || row is < 0 or >= MaxRows ||
            col is < 0 or >= MaxColumns || width is < 1 or > 3 || length is < 1 or > 3 ||
            row + length > MaxRows || col + width > MaxColumns)
            throw new GdsException("COACH_GEOMETRY", $"Invalid coordinates or dimensions for {item}");
    }

    private static CoachDraft Normalize(CoachDraft draft)
    {
        if (draft is null) throw new GdsException("VALIDATION", "Coach is required");
        var name = (draft.Name ?? "").Trim();
        var busType = (draft.BusType ?? "").Trim();
        var pattern = (draft.Pattern ?? "").Trim();
        if (name.Length is < 2 or > 100 || busType.Length is < 2 or > 80 || pattern is not ("2+1" or "2+2"))
            throw new GdsException("VALIDATION", "Coach name (2–100), bus type (2–80), and 2+1 / 2+2 pattern are required");
        var seats = draft.Seats ?? [];
        var fixtures = draft.Fixtures ?? [];
        if (seats.Count is < 1 or > MaxSeats || fixtures.Count > MaxFixtures)
            throw new GdsException("VALIDATION", $"Coach requires 1–{MaxSeats} actual seats and at most {MaxFixtures} fixtures");
        var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var occupied = new HashSet<string>(StringComparer.Ordinal);
        void Occupy(string deck, int row, int col, int width, int length, string label)
        {
            ValidateGeometry(deck, row, col, width, length, label);
            for (var rr = row; rr < row + length; rr++)
                for (var cc = col; cc < col + width; cc++)
                    if (!occupied.Add($"{deck}:{rr}:{cc}"))
                        throw new GdsException("COACH_OVERLAP", $"Seat/fixture overlaps at {deck} row {rr + 1}, column {cc + 1}");
        }

        var normalizedSeats = new List<CoachSeatInput>(seats.Count);
        foreach (var seat in seats)
        {
            var code = (seat.Code ?? "").Trim().ToUpperInvariant();
            if (!Regex.IsMatch(code, "^[A-Z0-9][A-Z0-9_-]{0,11}$") ||
                !codes.Add(code) || seat.SeatType is not ("seater" or "sleeper"))
                throw new GdsException("COACH_SEATS", $"Invalid, duplicate or unsupported seat: {code}");
            var deck = (seat.Deck ?? "").Trim().ToUpperInvariant();
            Occupy(deck, seat.Row, seat.Col, seat.Width, seat.Length, code);
            normalizedSeats.Add(seat with { Code = code, Deck = deck });
        }
        var normalizedFixtures = new List<CoachFixtureInput>(fixtures.Count);
        foreach (var f in fixtures)
        {
            var kind = (f.Kind ?? "").Trim().ToLowerInvariant();
            var label = (f.Label ?? "").Trim();
            if (!AllowedFixtureKinds.Contains(kind) || label.Length is < 1 or > 60)
                throw new GdsException("COACH_FIXTURE", "Each cabin fixture needs a known type and a 1–60 character label");
            var deck = (f.Deck ?? "").Trim().ToUpperInvariant();
            Occupy(deck, f.Row, f.Col, f.Width, f.Length, label);
            normalizedFixtures.Add(f with { Kind = kind, Label = label, Deck = deck });
        }
        var amenities = (draft.Amenities ?? []).Select(x => (x ?? "").Trim().ToLowerInvariant()).ToArray();
        if (amenities.Any(x => !AllowedAmenities.Contains(x)) || amenities.Distinct().Count() != amenities.Length)
            throw new GdsException("COACH_AMENITIES", "Unsupported or duplicate amenity selected");

        return new CoachDraft(name, busType, pattern, draft.IsAc, amenities, normalizedSeats, normalizedFixtures);
    }

    private async Task<(int Routes, int Vehicles)> UsageAsync(long id) =>
        (await db.Routes.CountAsync(x => x.CoachTemplateId == id),
         await db.Vehicles.CountAsync(x => x.CoachTemplateId == id));

    private static CoachSeatInput SeatInput(CoachSeat s) =>
        new(s.Code, s.Deck, s.Row, s.Col, s.Width, s.Length, s.SeatType, s.IsWindow);
    private static CoachFixtureInput FixtureInput(CoachFixture f) =>
        new(f.Kind, f.Label, f.Deck, f.Row, f.Col, f.Width, f.Length);

    public async Task<CoachFull> FullAsync(long id)
    {
        var coach = await db.CoachTemplates.AsNoTracking()
            .Include(x => x.Seats).Include(x => x.Fixtures).AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id)
            ?? throw new GdsException("COACH_NOT_FOUND", "Coach layout not found", 404);
        var usage = await UsageAsync(id);
        return new CoachFull(coach.Id, coach.Name, coach.BusType, coach.Pattern, coach.IsAc,
            coach.Amenities, coach.Seats.OrderBy(x => x.Deck).ThenBy(x => x.Row).ThenBy(x => x.Col)
                .Select(SeatInput).ToArray(),
            coach.Fixtures.OrderBy(x => x.Deck).ThenBy(x => x.Row).ThenBy(x => x.Col)
                .Select(FixtureInput).ToArray(),
            usage.Routes > 0 || usage.Vehicles > 0, usage.Routes, usage.Vehicles, coach.Seats.Count);
    }

    /// <summary>Atomic save. No released booking, hold or allocation is silently rewritten.</summary>
    public async Task<long> SaveAsync(long? id, CoachDraft requested, string actor)
    {
        var input = Normalize(requested);
        await using var tx = await db.Database.BeginTransactionAsync();
        CoachTemplate coach;
        if (id is { } existingId)
        {
            coach = await db.CoachTemplates.FromSqlInterpolated(
                $"SELECT * FROM coach_templates WHERE id = {existingId} AND tenant_id = {db.CurrentTenantId} FOR UPDATE")
                .SingleOrDefaultAsync()
                ?? throw new GdsException("COACH_NOT_FOUND", "Coach layout not found", 404);
            var usage = await UsageAsync(existingId);
            if (usage.Routes > 0 || usage.Vehicles > 0)
                throw new GdsException("COACH_IN_USE",
                    "Coach is used by a route or vehicle. Clone it to keep sold seats and route history intact.", 409);
            var oldSeats = await db.CoachSeats.Where(s => s.CoachTemplateId == existingId).ToArrayAsync();
            var ids = oldSeats.Select(x => x.Id).ToArray();
            if (await db.SeatAllocations.AnyAsync(x => ids.Contains(x.CoachSeatId)) ||
                await db.BookingPassengers.AnyAsync(x => ids.Contains(x.CoachSeatId)) ||
                await db.HoldPassengers.AnyAsync(x => ids.Contains(x.CoachSeatId)))
                throw new GdsException("COACH_HISTORY_LOCKED", "Past bookings or holds still reference these seats", 409);
            db.CoachSeats.RemoveRange(oldSeats);
            db.CoachFixtures.RemoveRange(await db.CoachFixtures.Where(x => x.CoachTemplateId == existingId).ToArrayAsync());
            // Release unique seat-code claims before introducing the new geometry.
            await db.SaveChangesAsync();
        }
        else
        {
            var next = await db.Database.SqlQueryRaw<long>("SELECT nextval('master_ids') AS \"Value\"").SingleAsync();
            coach = new CoachTemplate { Id = next, TenantId = db.CurrentTenantId };
            db.CoachTemplates.Add(coach);
        }
        coach.Name = input.Name;
        coach.BusType = input.BusType;
        coach.Pattern = input.Pattern;
        coach.IsAc = input.IsAc;
        coach.Amenities = input.Amenities ?? [];
        foreach (var seat in input.Seats ?? [])
            coach.Seats.Add(new CoachSeat
            {
                CoachTemplateId = coach.Id, Code = seat.Code, Deck = seat.Deck,
                Row = seat.Row, Col = seat.Col, Width = seat.Width, Length = seat.Length,
                SeatType = seat.SeatType, IsWindow = seat.IsWindow
            });
        foreach (var fixture in input.Fixtures ?? [])
            coach.Fixtures.Add(new CoachFixture
            {
                CoachTemplateId = coach.Id, Kind = fixture.Kind, Label = fixture.Label,
                Deck = fixture.Deck, Row = fixture.Row, Col = fixture.Col,
                Width = fixture.Width, Length = fixture.Length
            });

        db.AuditLogs.Add(new AuditLog
        {
            TenantId = db.CurrentTenantId, Actor = actor, Action = id is null ? "COACH_CREATE" : "COACH_UPDATE",
            Entity = "coach", EntityId = coach.Id.ToString(),
            At = clock.GetUtcNow().UtcDateTime,
            DataJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                input.Name, input.Pattern, input.BusType, input.IsAc, seats = input.Seats!.Count,
                fixtures = input.Fixtures!.Count, input.Amenities
            })
        });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return coach.Id;
    }

    public async Task<long> CloneAsync(long sourceId, string actor)
    {
        var source = await FullAsync(sourceId);
        var name = source.Name.Length <= 85 ? source.Name + " Copy" : source.Name[..85] + " Copy";
        return await SaveAsync(null,
            new CoachDraft(name, source.BusType, source.Pattern, source.IsAc, source.Amenities,
                source.Seats.ToList(), source.Fixtures.ToList()), actor);
    }

    public async Task DeleteAsync(long id, string actor)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        var coach = await db.CoachTemplates.FromSqlInterpolated(
            $"SELECT * FROM coach_templates WHERE id = {id} AND tenant_id = {db.CurrentTenantId} FOR UPDATE")
            .SingleOrDefaultAsync()
            ?? throw new GdsException("COACH_NOT_FOUND", "Coach layout not found", 404);
        var usage = await UsageAsync(id);
        if (usage.Routes > 0 || usage.Vehicles > 0)
            throw new GdsException("COACH_IN_USE", "Cannot delete a coach attached to any route or vehicle", 409);
        var seatIds = await db.CoachSeats.Where(x => x.CoachTemplateId == id).Select(x => x.Id).ToArrayAsync();
        if (await db.BookingPassengers.AnyAsync(x => seatIds.Contains(x.CoachSeatId)) ||
            await db.HoldPassengers.AnyAsync(x => seatIds.Contains(x.CoachSeatId)) ||
            await db.SeatAllocations.AnyAsync(x => seatIds.Contains(x.CoachSeatId)))
            throw new GdsException("COACH_HISTORY_LOCKED", "Cannot delete historical passenger/seat references", 409);
        db.CoachTemplates.Remove(coach);
        db.AuditLogs.Add(new AuditLog
        {
            TenantId = db.CurrentTenantId, Actor = actor, Action = "COACH_DELETE", Entity = "coach",
            EntityId = id.ToString(), At = clock.GetUtcNow().UtcDateTime
        });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
    }
}
