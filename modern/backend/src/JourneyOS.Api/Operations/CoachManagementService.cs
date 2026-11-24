using System.Text.Json;
using JourneyOS.Api.Caching;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Operations;

public sealed record CoachSeatDraft(
    string Code, string? DisplayName, string Deck, int Row, int Col,
    int Width, int Length, string SeatType, bool IsWindow);
public sealed record CoachFixtureDraft(
    string Code, string? DisplayName, string Type, string Deck,
    int Row, int Col, int Width, int Length, string? Orientation);
public sealed class CoachMeta
{
    public string? AlternativeName { get; set; }
    public int? NominalSeaterPositions { get; set; }
    public List<string> Amenities { get; set; } = [];
    public List<CoachFixtureDraft> Fixtures { get; set; } = [];
}
public sealed record CoachDraft(
    string Name, string BusType, string Pattern, bool IsAc,
    string? AlternativeName, List<string> Amenities,
    int? NominalSeaterPositions,
    List<CoachSeatDraft> Seats, List<CoachFixtureDraft> Fixtures);

/// <summary>
/// Original Coach21/Coach22 editor port to native .NET.
/// A coach Code is a booking/inventory ID. DisplayName is only a UI alias.
/// Structural changes are prohibited when any vehicle or route references
/// the template. No "silent 48 seats → 46 seats" conversions.
/// </summary>
public sealed class CoachManagementService(
    GdsDbContext db, IGdsCache cache, TimeProvider clock)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const int MaxSeats = 120;

    private static CoachMeta ReadMeta(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return new CoachMeta();
        try { return JsonSerializer.Deserialize<CoachMeta>(raw, Json) ?? new(); }
        catch (JsonException) { return new(); }
    }

    private static void Validate(CoachDraft draft)
    {
        if (draft is null || string.IsNullOrWhiteSpace(draft.Name) || draft.Name.Length > 120)
            throw new GdsException("VALIDATION", "Coach name is required and cannot exceed 120 characters");
        if (string.IsNullOrWhiteSpace(draft.BusType) || draft.BusType.Length > 120)
            throw new GdsException("VALIDATION", "Choose a valid coach bus type");
        if (draft.Pattern is not ("2+1" or "2+2"))
            throw new GdsException("VALIDATION", "Only validated 2+1 and 2+2 coach patterns can be edited");
        if (draft.AlternativeName?.Length > 120 || draft.Amenities is null ||
            draft.Amenities.Count > 60 || draft.Amenities.Any(a => string.IsNullOrWhiteSpace(a) || a.Length > 60))
            throw new GdsException("VALIDATION", "Invalid alternative name or coach amenities");
        if (draft.Seats is null || draft.Seats.Count is < 1 or > MaxSeats)
            throw new GdsException("VALIDATION", "Provide 1–120 physical passenger seats");
        if (draft.Fixtures is null || draft.Fixtures.Count > 20)
            throw new GdsException("VALIDATION", "Too many vehicle fixtures");
        if (draft.NominalSeaterPositions is < 0 or > 120)
            throw new GdsException("VALIDATION", "Invalid nominal position count");

        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var labels = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var cells = new HashSet<string>(StringComparer.Ordinal);
        var aisle = draft.Pattern == "2+1" ? 1 : 2;
        var columns = draft.Pattern == "2+1" ? 4 : 5;
        var decks = new HashSet<string>(StringComparer.Ordinal) { "LOWER", "UPPER" };
        static void CheckCode(string code, string field)
        {
            if (string.IsNullOrWhiteSpace(code) || code.Length > 24 ||
                !System.Text.RegularExpressions.Regex.IsMatch(code, @"^[\p{L}\p{N}_\-]+$"))
                throw new GdsException("VALIDATION", $"Invalid {field}: use 1–24 characters, numbers, underscores or hyphens");
        }
        void AddCells(string code, string deck, int row, int col, int width, int length)
        {
            if (!decks.Contains(deck) || row is < 0 or > 15 ||
                col < 0 || width < 1 || length < 1 ||
                col + width > columns || row + length > 16)
                throw new GdsException("LAYOUT_GEOMETRY", $"Out-of-range position for {code}");
            for (var r = row; r < row + length; r++)
            for (var c = col; c < col + width; c++)
                if (!cells.Add($"{deck}:{r}:{c}"))
                    throw new GdsException("LAYOUT_OVERLAP", $"Overlapping physical seat or fixture at {deck} R{r+1}C{c+1}");
        }
        foreach (var s in draft.Seats)
        {
            CheckCode(s.Code, "seat code");
            var alias = string.IsNullOrWhiteSpace(s.DisplayName) ? s.Code : s.DisplayName.Trim();
            if (alias.Length > 48 || !ids.Add(s.Code) || !labels.Add(alias))
                throw new GdsException("LAYOUT_DUPLICATE", $"Duplicate seat code/display name or invalid alias: {alias}");
            if (s.SeatType is not ("seater" or "sleeper") ||
                s.Width != 1 || s.Length != (s.SeatType == "sleeper" ? 2 : 1) ||
                s.Col == aisle)
                throw new GdsException("LAYOUT_GEOMETRY", $"Invalid berth/aisle geometry for {s.Code}");
            if (draft.Pattern == "2+2" && s.SeatType != "seater")
                throw new GdsException("LAYOUT_GEOMETRY", "A 2+2 A/C seater diagram cannot contain sleeper berths");
            AddCells(s.Code, s.Deck, s.Row, s.Col, s.Width, s.Length);
        }
        foreach (var f in draft.Fixtures)
        {
            if (string.IsNullOrWhiteSpace(f.Code) || f.Code.Length > 32 ||
                f.Type is not ("EE_EXIT" or "ROOF_EXIT" or "BACK_EXIT" or "WASH_ROOM") ||
                f.DisplayName?.Length > 48 || f.Orientation?.Length > 30 ||
                !ids.Add(f.Code) || !labels.Add(string.IsNullOrWhiteSpace(f.DisplayName) ? f.Code : f.DisplayName.Trim()))
                throw new GdsException("LAYOUT_FIXTURE", "Invalid, duplicate or overlapping fixture name");
            AddCells(f.Code, f.Deck, f.Row, f.Col, f.Width, f.Length);
        }
        if (draft.Pattern == "2+2")
        {
            // Original 2+2 reference: positions 19,20,23,24 are deliberately
            // missing for the side-door + washroom. Never number passengers into
            // this reserved area even when a fixture has been accidentally removed.
            if (draft.Seats.Any(s => s.Deck == "LOWER" &&
                (s.Row == 4 && s.Col >= 3 || s.Row == 5 && s.Col >= 3)))
                throw new GdsException("LAYOUT_CLEARANCE", "Side exit and washroom safety clearance must remain free");
            if (draft.Seats.Any(s => s.Deck != "LOWER"))
                throw new GdsException("LAYOUT_GEOMETRY", "2+2 reference is a single lower-deck coach");
        }
    }

    public async Task<object[]> ListAsync()
    {
        return await db.CoachTemplates.AsNoTracking().OrderBy(x => x.Name)
            .Select(x => new {
                x.Id, x.Name, x.BusType, x.Pattern, x.IsAc,
                seatCount = x.Seats.Count,
                seaterCount = x.Seats.Count(s => s.SeatType == "seater"),
                sleeperCount = x.Seats.Count(s => s.SeatType == "sleeper"),
                vehicles = db.Vehicles.Count(v => v.CoachTemplateId == x.Id),
                routes = db.Routes.Count(r => r.CoachTemplateId == x.Id)
            }).Cast<object>().ToArrayAsync();
    }

    public async Task<object> FullAsync(long id)
    {
        var coach = await db.CoachTemplates.AsNoTracking().Include(c => c.Seats)
            .FirstOrDefaultAsync(c => c.Id == id)
            ?? throw new GdsException("COACH_NOT_FOUND", "Coach template not found", 404);
        var vehicles = await db.Vehicles.CountAsync(v => v.CoachTemplateId == id);
        var routes = await db.Routes.CountAsync(r => r.CoachTemplateId == id);
        var meta = ReadMeta(coach.LayoutMetaJson);
        return new {
            coach.Id, coach.Name, coach.BusType, coach.Pattern, coach.IsAc,
            meta.AlternativeName, meta.Amenities, meta.NominalSeaterPositions,
            fixtures = meta.Fixtures,
            seats = coach.Seats.OrderBy(s => s.Deck == "LOWER" ? 0 : 1)
                .ThenBy(s => s.Row).ThenBy(s => s.Col).Select(s => new {
                    s.Code, displayName = s.DisplayName ?? s.Code,
                    s.Deck, s.Row, s.Col, s.Width, s.Length, s.SeatType, s.IsWindow
                }).ToArray(),
            capacity = coach.Seats.Count, vehicles, routes,
            structuralLocked = vehicles > 0 || routes > 0
        };
    }

    public async Task<long> SaveAsync(long? id, CoachDraft draft, string actor)
    {
        Validate(draft);
        await using var tx = await db.Database.BeginTransactionAsync();
        // Prevent parallel structural edit/create races on this tenant.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({db.CurrentTenantId})");

        var duplicate = await db.CoachTemplates.AnyAsync(c =>
            c.Name.ToUpper() == draft.Name.Trim().ToUpper() && c.Id != id);
        if (duplicate) throw new GdsException("DUPLICATE", "Coach name is already in use", 409);

        CoachTemplate coach;
        bool locked = false;
        if (id is null)
        {
            var next = await db.Database.SqlQueryRaw<long>(
                "SELECT nextval('master_ids') AS \"Value\"").SingleAsync();
            coach = new CoachTemplate { Id = next, TenantId = db.CurrentTenantId };
            db.CoachTemplates.Add(coach);
        }
        else
        {
            coach = await db.CoachTemplates.Include(c => c.Seats)
                .FirstOrDefaultAsync(c => c.Id == id)
                ?? throw new GdsException("COACH_NOT_FOUND", "Coach template not found", 404);
            locked = await db.Routes.AnyAsync(r => r.CoachTemplateId == id) ||
                     await db.Vehicles.AnyAsync(v => v.CoachTemplateId == id);
            if (locked)
            {
                // Identity and physical layout must remain byte-for-byte
                // semantically equivalent while referenced by a route/vehicle.
                if (coach.Pattern != draft.Pattern || coach.IsAc != draft.IsAc ||
                    coach.BusType != draft.BusType || coach.Seats.Count != draft.Seats.Count)
                    throw new GdsException("COACH_IN_USE",
                        "Assigned coaches allow display aliases/amenities only. Clone to change physical layout", 409);
                var old = coach.Seats.ToDictionary(s => s.Code, StringComparer.OrdinalIgnoreCase);
                if (draft.Seats.Any(s => !old.TryGetValue(s.Code, out var p) ||
                    p.Deck != s.Deck || p.Row != s.Row || p.Col != s.Col ||
                    p.Width != s.Width || p.Length != s.Length ||
                    p.SeatType != s.SeatType || p.IsWindow != s.IsWindow))
                    throw new GdsException("COACH_IN_USE",
                        "Seat positions, codes or count cannot change while assigned", 409);
                var previous = ReadMeta(coach.LayoutMetaJson);
                var oldFixtures = JsonSerializer.Serialize(previous.Fixtures.Select(f =>
                    new { f.Code, f.Type, f.Deck, f.Row, f.Col, f.Width, f.Length }), Json);
                var newFixtures = JsonSerializer.Serialize(draft.Fixtures.Select(f =>
                    new { f.Code, f.Type, f.Deck, f.Row, f.Col, f.Width, f.Length }), Json);
                if (oldFixtures != newFixtures)
                    throw new GdsException("COACH_IN_USE",
                        "Exit, door and washroom geometry cannot change while assigned", 409);
            }
        }
        coach.Name = draft.Name.Trim();
        coach.BusType = draft.BusType.Trim();
        coach.Pattern = draft.Pattern;
        coach.IsAc = draft.IsAc;
        coach.LayoutMetaJson = JsonSerializer.Serialize(new CoachMeta {
            AlternativeName = draft.AlternativeName?.Trim(),
            Amenities = draft.Amenities.Select(x => x.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            NominalSeaterPositions = draft.NominalSeaterPositions,
            Fixtures = draft.Fixtures
        }, Json);
        await db.SaveChangesAsync();
        if (locked)
        {
            var codes = draft.Seats.ToDictionary(x => x.Code, StringComparer.OrdinalIgnoreCase);
            foreach (var seat in coach.Seats)
                seat.DisplayName = codes[seat.Code].DisplayName?.Trim();
        }
        else
        {
            if (id is not null)
            {
                db.CoachSeats.RemoveRange(coach.Seats);
                await db.SaveChangesAsync();
            }
            foreach (var s in draft.Seats)
                db.CoachSeats.Add(new CoachSeat {
                    CoachTemplateId = coach.Id, Code = s.Code, DisplayName = s.DisplayName?.Trim(),
                    Deck = s.Deck, Row = s.Row, Col = s.Col, Width = s.Width,
                    Length = s.Length, SeatType = s.SeatType, IsWindow = s.IsWindow
                });
        }
        db.AuditLogs.Add(new AuditLog {
            TenantId = db.CurrentTenantId, Actor = actor,
            Action = id is null ? "COACH_CREATE" : "COACH_UPDATE",
            Entity = "coach", EntityId = coach.Id.ToString(),
            DataJson = JsonSerializer.Serialize(new {
                coach.Name, coach.Pattern, seats = draft.Seats.Count, fixtures = draft.Fixtures.Count,
                assigned = locked, aliasOnly = locked
            }), At = clock.GetUtcNow().UtcDateTime
        });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await cache.BumpAsync(CacheKeys.CatalogScope(db.CurrentTenantId));
        return coach.Id;
    }
}
