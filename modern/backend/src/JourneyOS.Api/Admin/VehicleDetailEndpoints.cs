using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record VehicleDocInput(string? DocumentType, string? DocumentName, string? DocumentNumber, string? ExpiryDate, string? IssueDate, string? Visibility, string? FileName, string? FileData);
public sealed record VehicleDocPatch(string? Visibility, string? ExpiryDate, string? DocumentNumber, bool? ClearExpiry);
public sealed record MaintenanceInput(string? Type, string? Label, string? ServiceDate, decimal? OdometerKm, string? NextDueDate, decimal? NextDueKm, decimal? Cost, string? Notes, string? FileName, string? FileData);

/// <summary>
/// Port of legacy server/api/vehicle-details-v19.js: the vehicle detail workspace (Details / Documents / Maintenance / Archive).
/// Files are validated by MIME and magic bytes (PDF/PNG/JPEG/WebP, 5 MB) and stored in PostgreSQL. Replacing a document archives the previous one.
/// </summary>
public static class VehicleDetailEndpoints
{
    private static readonly string[] DocTypes = ["RC", "INSURANCE", "PUC", "FITNESS", "AITP_FORM_2", "AITP_FORM_3", "VLTD", "FDSS", "PERMIT", "TAX", "OTHER"];
    private static readonly Regex DataUri = new(@"^data:(application/pdf|image/png|image/jpeg|image/webp);base64,([A-Za-z0-9+/]+={0,2})$", RegexOptions.Compiled);
    private static readonly string[] TextKeys = ["vehicle_number", "chassis_number", "engine_number", "gps_device_id", "gps_provider", "dms_device_id", "dms_provider", "notes"];
    private static GdsException Bad(string m, int s = 400) => new(s == 404 ? "not_found" : s == 409 ? "conflict" : s == 413 ? "too_large" : "invalid", m, s);
    private static DateOnly Today(TimeProvider c) => DateOnly.FromDateTime(c.GetUtcNow().UtcDateTime.AddHours(5.5));

    private static DateOnly? Date(string? v, string label)
    {
        if (string.IsNullOrWhiteSpace(v)) return null;
        return DateOnly.TryParseExact(v, "yyyy-MM-dd", out var d) ? d : throw Bad("Invalid " + label);
    }

    private static (string Name, string Type, byte[] Bytes) File(string? data, string? name)
    {
        if (data is null || data.Length > 7_200_000) throw Bad("File larger than the 5 MB limit", 413);
        var m = DataUri.Match(data);
        if (!m.Success) throw Bad("Upload a PDF, PNG, JPEG or WebP file");
        byte[] b; try { b = Convert.FromBase64String(m.Groups[2].Value); } catch { throw Bad("Invalid file encoding"); }
        if (b.Length == 0 || b.Length > 5 * 1024 * 1024) throw Bad("File larger than the 5 MB limit", 413);
        var t = m.Groups[1].Value;
        var ok = t switch
        {
            "application/pdf" => b.Length > 5 && b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F' && b[4] == '-',
            "image/png" => b.Length > 8 && b.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a }),
            "image/jpeg" => b.Length > 2 && b[0] == 255 && b[1] == 216,
            _ => b.Length > 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P',
        };
        if (!ok) throw Bad("File content does not match its type");
        var fn = (name ?? "").Trim();
        if (fn == "" || fn.Length > 140) throw Bad("File name required (max 140 characters)");
        return (Regex.Replace(fn, @"[/\\<>:""|?*\x00-\x1f]", "_"), t, b);
    }

    private static object Doc(ComplianceDocument d) => new
    {
        id = d.Id, document_type = d.DocumentType, document_name = d.DocumentName, document_number = d.DocumentNumber, expiry_date = d.ExpiryDate, issue_date = d.IssueDate,
        visibility = d.Visibility == "public" ? "public" : "private", file_name = d.FileName, has_file = d.FileData != null, file_size = d.FileData?.Length,
        status = d.ArchivedAt != null ? "archived" : "active", archived_at = d.ArchivedAt, archive_reason = d.ArchiveReason, created_at = d.CreatedAt,
    };

    private static object Maint(VehicleMaintenance r) => new
    {
        id = r.Id, type = r.Type, label = r.Label, service_date = r.ServiceDate, odometer_km = r.OdometerKm, next_due_date = r.NextDueDate, next_due_km = r.NextDueKm,
        cost = r.Cost, notes = r.Notes, file_name = r.FileName, has_file = r.FileData != null, archived_at = r.ArchivedAt, created_at = r.CreatedAt, updated_at = r.UpdatedAt,
    };

    private static JsonObject Details(Vehicle v) => (v.DetailsJson is null ? null : JsonNode.Parse(v.DetailsJson) as JsonObject) ?? new JsonObject();

    private static object VehicleView(Vehicle v, Dictionary<long, string> coaches)
    {
        var d = Details(v);
        var o = new JsonObject
        {
            ["id"] = v.Id, ["registration_number"] = v.RegistrationNumber, ["coach_template_id"] = v.CoachTemplateId,
            ["coach"] = v.CoachTemplateId is { } c && coaches.TryGetValue(c, out var n) ? n : "Unassigned", ["status"] = v.Status,
            ["phone_number"] = v.PhoneNumber, ["model_name"] = v.ModelName, ["manufacture_year"] = v.ManufactureYear, ["ownership_type"] = v.OwnershipType,
            ["vehicle_role"] = v.VehicleRole, ["gps_enabled"] = v.GpsEnabled, ["odometer_reading"] = v.OdometerReading,
            ["dms_enabled"] = d["dms_enabled"]?.DeepClone() ?? false, ["purchased_date"] = d["purchased_date"]?.DeepClone(), ["tags"] = d["tags"]?.DeepClone() ?? new JsonObject(),
        };
        foreach (var k in TextKeys) o[k] = d[k]?.DeepClone();
        return o;
    }

    private static void Audit(GdsDbContext db, HttpContext h, long id, string section, object data) =>
        db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = h.User.Identity?.Name ?? "system", Action = "VEHICLE_" + section.ToUpperInvariant(), Entity = "vehicle", EntityId = id.ToString(), DataJson = JsonSerializer.Serialize(data), At = DateTime.UtcNow });

    public static void MapVehicleDetail(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin/vehicles/{id:long}").RequireAuthorization().WithTags("Fleet");
        async Task<Vehicle> Get(GdsDbContext db, long id) => await db.Vehicles.FirstOrDefaultAsync(v => v.Id == id) ?? throw Bad("Vehicle not found", 404);

        g.MapGet("/detail", async (long id, GdsDbContext db, TimeProvider clock) =>
        {
            var v = await Get(db, id);
            var coaches = await db.CoachTemplates.AsNoTracking().OrderBy(c => c.Id).Select(c => new { c.Id, c.Name }).ToListAsync();
            var docs = await db.ComplianceDocuments.AsNoTracking().Where(d => d.OwnerType == "vehicle" && d.OwnerId == id).OrderBy(d => d.Id).ToListAsync();
            var work = await db.VehicleMaintenance.AsNoTracking().Where(r => r.VehicleId == id).ToListAsync();
            var active = work.Where(r => r.ArchivedAt == null).OrderByDescending(r => r.ServiceDate).ToList();
            var next = active.Select(r => r.NextDueDate).Where(x => x != null).Min();
            var nextKm = active.Select(r => r.NextDueKm).Where(x => x != null).Min();
            var odo = v.OdometerReading ?? 0;
            var overdue = (next != null && next < Today(clock)) || (nextKm != null && odo >= nextKm);
            var archive = docs.Where(d => d.ArchivedAt != null).Select(d => (at: d.ArchivedAt!.Value, o: (object)new { kind = "document", d.Id, document_type = d.DocumentType, document_name = d.DocumentName, file_name = d.FileName, has_file = d.FileData != null, archived_at = d.ArchivedAt, archive_reason = d.ArchiveReason }))
                .Concat(work.Where(r => r.ArchivedAt != null).Select(r => (at: r.ArchivedAt!.Value, o: (object)new { kind = "maintenance", r.Id, label = r.Label, archived_at = r.ArchivedAt, has_file = r.FileData != null })))
                .OrderByDescending(x => x.at).Select(x => x.o);
            return Results.Ok(new
            {
                vehicle = VehicleView(v, coaches.ToDictionary(c => c.Id, c => c.Name)),
                coaches = coaches.Select(c => new { id = c.Id, name = c.Name }),
                documents = docs.Where(d => d.ArchivedAt == null).Select(Doc),
                maintenance = active.Select(Maint),
                service = new
                {
                    last_service_date = active.FirstOrDefault(r => r.ServiceDate != null)?.ServiceDate, next_service_date = next, next_service_km = nextKm, odometer_reading = odo,
                    status = v.Status == "maintenance" ? "Maintenance" : overdue ? "Service due" : v.Status == "active" ? "Active" : "Inactive", count = active.Count,
                },
                archive,
            });
        }).RequireAuthorization(Policies.Operations);

        g.MapPut("/detail", async (long id, JsonObject b, GdsDbContext db, HttpContext h, TimeProvider clock) =>
        {
            var v = await Get(db, id);
            var d = Details(v); var changed = new List<string>();
            string? S(string k, int max) => b[k] is JsonValue x ? (x.ToString() ?? "").Trim() is var s && s.Length > max ? s[..max] : x.ToString().Trim() : null;
            if (b.ContainsKey("registration_number"))
            {
                var plate = S("registration_number", 40);
                if (string.IsNullOrEmpty(plate)) throw Bad("Registration number required (max 40 characters)");
                var norm = plate.Replace(" ", "").ToUpperInvariant();
                if (await db.Vehicles.AnyAsync(x => x.Id != id && x.RegistrationNumber.Replace(" ", "").ToUpper() == norm)) throw Bad("Registration number already exists", 409);
                v.RegistrationNumber = plate; changed.Add("registration_number");
            }
            if (b.ContainsKey("coach_template_id"))
            {
                var cid = b["coach_template_id"] is JsonValue cv && long.TryParse(cv.ToString(), out var x1) ? x1 : 0;
                if (!await db.CoachTemplates.AnyAsync(c => c.Id == cid)) throw Bad("Choose an existing coach type");
                v.CoachTemplateId = cid; changed.Add("coach_template_id");
            }
            if (b.ContainsKey("phone_number"))
            {
                var p = S("phone_number", 20);
                if (!string.IsNullOrEmpty(p) && !Regex.IsMatch(p, @"^\+?[0-9 \-]{8,16}$")) throw Bad("Invalid mobile number");
                v.PhoneNumber = string.IsNullOrEmpty(p) ? null : p; changed.Add("phone_number");
            }
            if (b.ContainsKey("model_name")) { var m = S("model_name", 100); v.ModelName = string.IsNullOrEmpty(m) ? null : m; changed.Add("model_name"); }
            if (b.ContainsKey("manufacture_year"))
            {
                var s = S("manufacture_year", 10);
                if (string.IsNullOrEmpty(s)) v.ManufactureYear = null;
                else if (!int.TryParse(s, out var y) || y < 1950 || y > Today(clock).Year + 1) throw Bad("Invalid manufacture year");
                else v.ManufactureYear = y;
                changed.Add("manufacture_year");
            }
            if (b.ContainsKey("odometer_reading"))
            {
                var s = S("odometer_reading", 20);
                if (string.IsNullOrEmpty(s)) v.OdometerReading = null;
                else if (!decimal.TryParse(s, System.Globalization.CultureInfo.InvariantCulture, out var o) || o < 0 || o > 100_000_000) throw Bad("Invalid odometer reading");
                else v.OdometerReading = (int)Math.Round(o);
                changed.Add("odometer_reading");
            }
            if (b.ContainsKey("ownership_type")) { var o = S("ownership_type", 20); if (o is not ("permanent" or "temporary" or "leased" or "attached")) throw Bad("Invalid ownership"); v.OwnershipType = o; changed.Add("ownership_type"); }
            if (b.ContainsKey("vehicle_role")) { var o = S("vehicle_role", 20); if (o is not ("main" or "pickup_van" or "spare")) throw Bad("Invalid vehicle type"); v.VehicleRole = o; changed.Add("vehicle_role"); }
            if (b.ContainsKey("gps_enabled")) { if (b["gps_enabled"] is not JsonValue gv || !gv.TryGetValue<bool>(out var gb)) throw Bad("GPS flag must be boolean"); v.GpsEnabled = gb; changed.Add("gps_enabled"); }
            if (b.ContainsKey("dms_enabled")) { if (b["dms_enabled"] is not JsonValue dv || !dv.TryGetValue<bool>(out var db2)) throw Bad("DMS flag must be boolean"); d["dms_enabled"] = db2; changed.Add("dms_enabled"); }
            if (b.ContainsKey("purchased_date")) { d["purchased_date"] = Date(S("purchased_date", 10), "purchase date")?.ToString("yyyy-MM-dd"); changed.Add("purchased_date"); }
            foreach (var k in TextKeys) if (b.ContainsKey(k)) { d[k] = S(k, k == "notes" ? 3000 : k == "vehicle_number" ? 60 : 100) ?? ""; changed.Add(k); }
            if (b.ContainsKey("tags"))
            {
                if (b["tags"] is not JsonObject t || t.Count > 30) throw Bad("Invalid tags");
                var clean = new JsonObject();
                foreach (var (k, val) in t)
                {
                    var key = k.Trim();
                    if (key == "" || key.Length > 60 || key is "__proto__" or "constructor" or "prototype" || val is not JsonValue sv || sv.ToString().Length > 120) throw Bad("Invalid tag name or value");
                    clean[key] = sv.ToString().Trim();
                }
                d["tags"] = clean; changed.Add("tags");
            }
            if (changed.Count == 0) throw Bad("No vehicle changes provided");
            v.DetailsJson = d.ToJsonString();
            Audit(db, h, id, "details", new { fields = changed });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true });
        }).RequireAuthorization(Policies.Operations);

        g.MapPost("/documents", async (long id, VehicleDocInput b, GdsDbContext db, HttpContext h) =>
        {
            await Get(db, id);
            var type = b.DocumentType ?? "";
            if (!DocTypes.Contains(type)) throw Bad("Invalid document type");
            var vis = b.Visibility ?? "private"; if (vis is not ("public" or "private")) throw Bad("Invalid visibility");
            if (string.IsNullOrEmpty(b.FileData)) throw Bad("Select a document file");
            var f = File(b.FileData, b.FileName);
            var now = DateTime.UtcNow;
            var replaced = await db.ComplianceDocuments.Where(d => d.OwnerType == "vehicle" && d.OwnerId == id && d.ArchivedAt == null && d.DocumentType == type).ToListAsync();
            foreach (var p in replaced) { p.ArchivedAt = now; p.ArchiveReason = "replaced"; }
            var doc = new ComplianceDocument
            {
                TenantId = db.CurrentTenantId, OwnerType = "vehicle", OwnerId = id, DocumentType = type, DocumentName = (string.IsNullOrWhiteSpace(b.DocumentName) ? type : b.DocumentName.Trim()) is var n && n.Length > 110 ? n[..110] : n,
                DocumentNumber = (b.DocumentNumber ?? "").Trim() is var dn && dn.Length > 80 ? dn[..80] : dn, ExpiryDate = Date(b.ExpiryDate, "expiry date"), IssueDate = Date(b.IssueDate, "issue date"),
                Visibility = vis, Category = "compliance", VerificationStatus = "pending", FileName = f.Name, FileType = f.Type, FileData = f.Bytes, CreatedAt = now,
            };
            db.ComplianceDocuments.Add(doc);
            Audit(db, h, id, "documents", new { action = replaced.Count > 0 ? "replace" : "upload", type, archived = replaced.Select(x => x.Id) });
            await db.SaveChangesAsync();
            return Results.Ok(new { document = Doc(doc), replaced = replaced.Count });
        }).RequireAuthorization(Policies.Operations);

        async Task<ComplianceDocument> ActiveDoc(GdsDbContext db, long id, long docId) =>
            await db.ComplianceDocuments.FirstOrDefaultAsync(d => d.Id == docId && d.OwnerType == "vehicle" && d.OwnerId == id && d.ArchivedAt == null) ?? throw Bad("Active document not found", 404);

        g.MapPut("/documents/{docId:long}", async (long id, long docId, VehicleDocPatch b, GdsDbContext db, HttpContext h) =>
        {
            var d = await ActiveDoc(db, id, docId); var n = 0;
            if (b.Visibility is not null) { if (b.Visibility is not ("public" or "private")) throw Bad("Invalid visibility"); d.Visibility = b.Visibility; n++; }
            if (b.ExpiryDate is not null || b.ClearExpiry == true) { d.ExpiryDate = Date(b.ExpiryDate, "expiry date"); n++; }
            if (b.DocumentNumber is not null) { d.DocumentNumber = b.DocumentNumber.Trim(); n++; }
            if (n == 0) throw Bad("Nothing to update");
            Audit(db, h, id, "documents", new { action = "update", doc_id = docId });
            await db.SaveChangesAsync();
            return Results.Ok(new { document = Doc(d) });
        }).RequireAuthorization(Policies.Operations);

        g.MapPost("/documents/{docId:long}/archive", async (long id, long docId, GdsDbContext db, HttpContext h) =>
        {
            var d = await ActiveDoc(db, id, docId); d.ArchivedAt = DateTime.UtcNow; d.ArchiveReason = "manual";
            Audit(db, h, id, "documents", new { action = "archive", doc_id = docId });
            await db.SaveChangesAsync();
            return Results.Ok(new { document = Doc(d) });
        }).RequireAuthorization(Policies.Operations);

        g.MapDelete("/documents/{docId:long}", async (long id, long docId, GdsDbContext db, HttpContext h) =>
        {
            var d = await ActiveDoc(db, id, docId); db.ComplianceDocuments.Remove(d);
            Audit(db, h, id, "documents", new { action = "delete", doc_id = docId, type = d.DocumentType });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true });
        }).RequireAuthorization(Policies.Operations);

        g.MapGet("/documents/{docId:long}/file", async (long id, long docId, GdsDbContext db, HttpContext h) =>
        {
            var d = await db.ComplianceDocuments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == docId && x.OwnerType == "vehicle" && x.OwnerId == id) ?? throw Bad("Document not found", 404);
            if (d.FileData is null) throw Bad("No file uploaded", 404);
            h.Response.Headers["X-Content-Type-Options"] = "nosniff";
            h.Response.Headers.ContentDisposition = $"inline; filename=\"{Regex.Replace(d.FileName ?? "document", @"[^A-Za-z0-9._-]", "_")}\"";
            return Results.Bytes(d.FileData, d.FileType ?? "application/octet-stream");
        }).RequireAuthorization(Policies.Operations);

        static void ApplyMaint(VehicleMaintenance r, MaintenanceInput b, bool create)
        {
            if (b.Type is not null) { if (b.Type is not ("service" or "repair" or "inspection" or "reminder")) throw Bad("Invalid maintenance type"); r.Type = b.Type; }
            if (b.Label is not null || create)
            {
                var l = (b.Label ?? "").Trim();
                if (l == "" || l.Length > 120) throw Bad("Maintenance description required (max 120 characters)");
                r.Label = l;
            }
            if (b.ServiceDate is not null || create) r.ServiceDate = Date(b.ServiceDate, "service_date");
            if (b.NextDueDate is not null || create) r.NextDueDate = Date(b.NextDueDate, "next_due_date");
            foreach (var (val, label) in new[] { (b.OdometerKm, "odometer_km"), (b.NextDueKm, "next_due_km"), (b.Cost, "cost") })
                if (val is < 0 or > 100_000_000) throw Bad("Invalid " + label);
            r.OdometerKm = b.OdometerKm; r.NextDueKm = b.NextDueKm; r.Cost = b.Cost ?? 0;
            if (b.Notes is not null) r.Notes = b.Notes.Length > 3000 ? b.Notes[..3000] : b.Notes;
            if (!string.IsNullOrEmpty(b.FileData)) { var f = File(b.FileData, b.FileName); r.FileName = f.Name; r.FileType = f.Type; r.FileData = f.Bytes; }
        }

        g.MapPost("/maintenance", async (long id, MaintenanceInput b, GdsDbContext db, HttpContext h) =>
        {
            await Get(db, id);
            var r = new VehicleMaintenance { TenantId = db.CurrentTenantId, VehicleId = id, CreatedAt = DateTime.UtcNow, CreatedBy = h.User.Identity?.Name };
            ApplyMaint(r, b, true);
            db.VehicleMaintenance.Add(r);
            await db.SaveChangesAsync();
            Audit(db, h, id, "maintenance", new { action = "create", record_id = r.Id });
            await db.SaveChangesAsync();
            return Results.Ok(new { record = Maint(r) });
        }).RequireAuthorization(Policies.Operations);

        async Task<VehicleMaintenance> ActiveRec(GdsDbContext db, long id, long rid) =>
            await db.VehicleMaintenance.FirstOrDefaultAsync(r => r.Id == rid && r.VehicleId == id && r.ArchivedAt == null) ?? throw Bad("Maintenance record not found", 404);

        g.MapPut("/maintenance/{rid:long}", async (long id, long rid, MaintenanceInput b, GdsDbContext db, HttpContext h) =>
        {
            var r = await ActiveRec(db, id, rid);
            ApplyMaint(r, b, false); r.UpdatedAt = DateTime.UtcNow;
            Audit(db, h, id, "maintenance", new { action = "update", record_id = rid });
            await db.SaveChangesAsync();
            return Results.Ok(new { record = Maint(r) });
        }).RequireAuthorization(Policies.Operations);

        g.MapPost("/maintenance/{rid:long}/archive", async (long id, long rid, GdsDbContext db, HttpContext h) =>
        {
            var r = await ActiveRec(db, id, rid); r.ArchivedAt = DateTime.UtcNow;
            Audit(db, h, id, "maintenance", new { action = "archive", record_id = rid });
            await db.SaveChangesAsync();
            return Results.Ok(new { record = Maint(r) });
        }).RequireAuthorization(Policies.Operations);

        g.MapGet("/maintenance/{rid:long}/file", async (long id, long rid, GdsDbContext db, HttpContext h) =>
        {
            var r = await db.VehicleMaintenance.AsNoTracking().FirstOrDefaultAsync(x => x.Id == rid && x.VehicleId == id);
            if (r?.FileData is null) throw Bad("Maintenance attachment not found", 404);
            h.Response.Headers.ContentDisposition = $"inline; filename=\"{Regex.Replace(r.FileName ?? "attachment", @"[^A-Za-z0-9._-]", "_")}\"";
            return Results.Bytes(r.FileData, r.FileType ?? "application/octet-stream");
        }).RequireAuthorization(Policies.Operations);
    }
}
