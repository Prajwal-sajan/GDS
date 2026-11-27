using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record PickupChartCommitInput(long PreviewId, bool Confirm);

/// <summary>
/// Port of legacy server/pickup-chart-import-v40.js + api/pickup-chart-v40.js (preview / commit). An external tripsheet
/// (CSV, or a searchable PDF via Poppler <c>pdftotext</c>) is parsed into a reference-only manifest. Import NEVER creates
/// bookings, assigns inventory or changes fares.
/// </summary>
public static class PickupChartImportEndpoints
{
    static readonly string[] Sources = ["Bitla TicketSimply", "EzeeInfo", "Infinity ITS", "Detect automatically"];
    const int Max = 15 * 1024 * 1024;
    static readonly TimeSpan Ttl = TimeSpan.FromMinutes(20);
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    static readonly Dictionary<string, string[]> KeyMap = new()
    {
        ["seat"] = ["seat", "seatno", "seatnumber", "berth", "seatid"],
        ["mobile"] = ["mobile", "mobilephone", "mobileno", "phone", "contact", "contactno", "phonenumber"],
        ["pnr"] = ["pnr", "ticketno", "ticketnumber", "ticketid", "bookingid", "bookingnumber"],
        ["name"] = ["name", "passenger", "passengername", "traveller", "traveler", "customer"],
        ["gender"] = ["g", "gender", "sex"], ["age"] = ["age"], ["contact_name"] = ["contactname", "bookedby"],
        ["trips"] = ["trips", "tripcount", "totaltrips", "journeys"],
        ["from_city"] = ["fromcity", "sourcecity", "origin"], ["to_city"] = ["tocity", "destination", "destinationcity"],
        ["pickup"] = ["pickup", "boarding", "boardingpoint", "boardingat", "pickuppoint", "board"],
        ["drop"] = ["drop", "dropping", "droppingpoint", "dropoff", "droppoint"],
        ["fare"] = ["fare", "amount", "ticketfare", "price"], ["source"] = ["source", "channel", "bookingchannel", "via"],
        ["booked_on"] = ["bookedon", "bookingdate", "bookedat", "bookingtime", "createdon"],
    };

    public sealed class Row
    {
        public string Seat { get; set; } = ""; public string Pnr { get; set; } = ""; public string Mobile { get; set; } = "";
        public string Name { get; set; } = ""; public string Gender { get; set; } = ""; public int? Age { get; set; }
        public string ContactName { get; set; } = ""; public int? Trips { get; set; } public string FromCity { get; set; } = "";
        public string ToCity { get; set; } = ""; public string Pickup { get; set; } = ""; public string Drop { get; set; } = "";
        public string PickupTime { get; set; } = ""; public string DropTime { get; set; } = ""; public int PickupDay { get; set; } = 1;
        public int DropDay { get; set; } = 1; public decimal? Fare { get; set; } public string Source { get; set; } = "";
        public string BookedOn { get; set; } = ""; public long? BoardingId { get; set; } public long? DroppingId { get; set; }
    }

    static string Norm(string? s) => Regex.Replace((s ?? "").ToLowerInvariant().Normalize(NormalizationForm.FormKD), "[^a-z0-9]+", "");
    static string Safe(string? s) => Regex.Replace(s ?? "", @"[\u0000-\u001f\u007f]", " ").Trim();
    static string? HeaderField(string x) => KeyMap.FirstOrDefault(k => k.Value.Contains(Norm(x))).Key;

    internal static List<List<string>> CsvRows(string text)
    {
        var result = new List<List<string>>(); var row = new List<string>(); var field = new StringBuilder(); var quoted = false;
        var raw = text.TrimStart('\uFEFF');
        var first = raw.Split('\n', 2)[0];
        var delim = first.Contains('\t') ? '\t' : first.Contains('|') ? '|' : ',';
        void EndRow() { row.Add(field.ToString()); field.Clear(); if (row.Any(x => x.Trim().Length > 0)) result.Add(row); row = []; }
        for (var i = 0; i < raw.Length; i++)
        {
            var ch = raw[i];
            if (ch == '"' && quoted && i + 1 < raw.Length && raw[i + 1] == '"') { field.Append('"'); i++; continue; }
            if (ch == '"') { quoted = !quoted; continue; }
            if (!quoted && ch == delim) { row.Add(field.ToString()); field.Clear(); continue; }
            if (!quoted && (ch == '\n' || ch == '\r')) { if (ch == '\r' && i + 1 < raw.Length && raw[i + 1] == '\n') i++; EndRow(); continue; }
            field.Append(ch);
        }
        if (quoted) throw new GdsException("VALIDATION", "CSV contains an unclosed quoted cell", 422);
        EndRow();
        return result;
    }

    static List<Dictionary<string, string>> RowsFromCsv(string text)
    {
        var table = CsvRows(text);
        var i = table.FindIndex(r => r.Count(x => HeaderField(x) is not null) >= 3 && r.Any(x => HeaderField(x) == "seat"));
        if (i < 0) throw new GdsException("VALIDATION", "CSV must have a header with Seat, PNR and Name fields", 422);
        var names = table[i].Select(HeaderField).ToList();
        if (!new[] { "seat", "pnr", "name" }.All(names.Contains)) throw new GdsException("VALIDATION", "CSV must include Seat, PNR, Name", 422);
        var rows = new List<Dictionary<string, string>>();
        foreach (var raw in table.Skip(i + 1))
        {
            var d = new Dictionary<string, string>();
            for (var k = 0; k < names.Count; k++) if (names[k] is { } n && !d.ContainsKey(n)) d[n] = k < raw.Count ? raw[k] : "";
            if (Safe(d.GetValueOrDefault("seat")).Length == 0 && Safe(d.GetValueOrDefault("name")).Length == 0) continue;
            rows.Add(d);
        }
        return rows;
    }

    static async Task<string> PdfText(byte[] buffer)
    {
        if (buffer.Length < 8 || Encoding.ASCII.GetString(buffer, 0, 5) != "%PDF-") throw new GdsException("VALIDATION", "The uploaded file is not a PDF", 415);
        var bin = Environment.GetEnvironmentVariable("GDS_PDFTOTEXT_PATH") is { Length: > 0 } p ? p : "pdftotext";
        Process proc;
        try
        {
            proc = Process.Start(new ProcessStartInfo(bin, "-layout - -") { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, StandardOutputEncoding = Encoding.UTF8 })
                ?? throw new InvalidOperationException();
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            throw new GdsException("PDF_PARSER_UNAVAILABLE", "PDF text parser is unavailable on this server. Install Poppler pdftotext (or configure GDS_PDFTOTEXT_PATH); CSV import is available.", 503);
        }
        using (proc)
        {
            var read = proc.StandardOutput.ReadToEndAsync();
            _ = proc.StandardError.ReadToEndAsync();
            await proc.StandardInput.BaseStream.WriteAsync(buffer); proc.StandardInput.Close();
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(12));
            try { await proc.WaitForExitAsync(cts.Token); } catch (OperationCanceledException) { try { proc.Kill(true); } catch { } throw new GdsException("VALIDATION", "Cannot extract text from this PDF. Use a searchable/text PDF or CSV; scanned images require a separate OCR workflow.", 422); }
            var text = await read;
            if (proc.ExitCode != 0) throw new GdsException("VALIDATION", "Cannot extract text from this PDF. Use a searchable/text PDF or CSV; scanned images require a separate OCR workflow.", 422);
            if (string.IsNullOrWhiteSpace(text)) throw new GdsException("VALIDATION", "PDF has no extractable text; scanned PDFs are not automatically imported", 422);
            return text;
        }
    }

    static string Hh24(string s)
    {
        var m = Regex.Match(s ?? "", @"(\d{1,2}):(\d\d)\s*(AM|PM)", RegexOptions.IgnoreCase);
        if (!m.Success) return "";
        var hr = int.Parse(m.Groups[1].Value) % 12 + (m.Groups[3].Value.Equals("PM", StringComparison.OrdinalIgnoreCase) ? 12 : 0);
        return $"{hr:00}:{m.Groups[2].Value}";
    }

    internal static (List<Dictionary<string, string>> Rows, int Skipped) RowsFromPdf(string text)
    {
        var rows = new List<Dictionary<string, string>>(); string boarding = "", boardTime = ""; var boardDay = 1; var skipped = 0; var summary = false;
        foreach (var line in text.Split('\n').Select(l => l.TrimEnd('\r')))
        {
            if (Regex.IsMatch(line, @"^\s*(Boarding|Dropping) Details\s*$", RegexOptions.IgnoreCase)) { summary = true; continue; }
            if (summary) continue;
            var stop = Regex.Match(line, @"^\s*(.*?)\s+Day\s+(\d+)\s*-\s*(\d{1,2}:\d\d\s*[AP]M)", RegexOptions.IgnoreCase);
            if (stop.Success && !Regex.IsMatch(line, @"^\s*\d+\s+")) { boarding = stop.Groups[1].Value.Trim(); boardTime = Hh24(stop.Groups[3].Value); boardDay = int.TryParse(stop.Groups[2].Value, out var d) && d > 0 ? d : 1; continue; }
            if (!Regex.IsMatch(line, @"^\s*\d+\s+\d{1,3}[A-Za-z]?\s+")) continue;
            var parts = Regex.Split(line.Trim(), @"\s{2,}").Select(x => x.Trim()).Where(x => x.Length > 0).ToList();
            if (parts.Count < 8) parts = Regex.Split(line.Trim(), @"\t+").Select(x => x.Trim()).Where(x => x.Length > 0).ToList();
            if (!int.TryParse(parts[0], out _) || parts.Count < 2 || !Regex.IsMatch(parts[1], @"^\d{1,3}[A-Za-z]?$")) { skipped++; continue; }
            var g = parts.Count > 5 && Regex.IsMatch(parts[5], "^[MFO]$", RegexOptions.IgnoreCase);
            if (parts.Count >= 11 && g)
                rows.Add(new() { ["seat"] = parts[1], ["mobile"] = parts[2], ["pnr"] = parts[3], ["name"] = parts[4], ["gender"] = parts[5], ["trips"] = parts[6], ["drop"] = parts[7], ["fare"] = parts[8], ["source"] = parts[9], ["booked_on"] = string.Join(' ', parts.Skip(10)), ["pickup"] = boarding, ["pickup_time"] = boardTime, ["pickup_day"] = boardDay.ToString() });
            else if (parts.Count >= 8 && g)
                rows.Add(new() { ["seat"] = parts[1], ["mobile"] = parts[2], ["pnr"] = parts[3], ["name"] = parts[4], ["gender"] = parts[5], ["pickup"] = parts[6].Length > 0 ? parts[6] : boarding, ["drop"] = parts[7], ["pickup_time"] = boardTime, ["pickup_day"] = boardDay.ToString() });
            else skipped++;
        }
        return (rows, skipped);
    }

    static string Detect(string text) =>
        Regex.IsMatch(text, "ticketsimply|bitla", RegexOptions.IgnoreCase) ? "Bitla TicketSimply"
        : Regex.IsMatch(text, "ezeeinfo|ezee info", RegexOptions.IgnoreCase) ? "EzeeInfo"
        : Regex.IsMatch(text, @"infinity\s*(its|solutions|gds)", RegexOptions.IgnoreCase) ? "Infinity ITS" : "Unknown text PDF / CSV";

    static Row? NormalizeRow(Dictionary<string, string> r)
    {
        string Raw(string k) { var s = Safe(r.GetValueOrDefault(k)); return s.Length > 180 ? s[..180] : s; }
        var seat = Raw("seat").ToUpperInvariant(); var pnr = Raw("pnr"); var name = Raw("name");
        if (!Regex.IsMatch(seat, "^[A-Z0-9-]{1,8}$") || !Regex.IsMatch(pnr, "^[A-Za-z0-9/-]{4,40}$") || name.Length == 0) return null;
        var gender = Raw("gender").ToUpperInvariant(); gender = gender.Length > 0 && "MFO".Contains(gender[0]) ? gender[..1] : "";
        var amount = Regex.Replace(Raw("fare"), "[^0-9.]", ""); var ph = Regex.Replace(Raw("mobile"), @"\D", "");
        int? Int(string k) => int.TryParse(Raw(k), out var v) && v > 0 ? v : null;
        return new Row
        {
            Seat = seat, Pnr = pnr, Name = name, Gender = gender, Mobile = ph.Length == 10 ? ph : "", Age = Int("age"), ContactName = Raw("contact_name"),
            Trips = Int("trips"), FromCity = Raw("from_city"), ToCity = Raw("to_city"), Pickup = Raw("pickup"), Drop = Raw("drop"),
            PickupTime = Raw("pickup_time"), DropTime = Raw("drop_time"), PickupDay = Int("pickup_day") ?? 1, DropDay = Int("drop_day") ?? 1,
            Fare = decimal.TryParse(amount, NumberStyles.Number, CultureInfo.InvariantCulture, out var f) ? f : null, Source = Raw("source"), BookedOn = Raw("booked_on"),
        };
    }

    public static void MapPickupChartImport(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin/schedules/{id:long}/pickup-chart").RequireAuthorization(Policies.Operations).WithTags("Schedules");

        g.MapPost("/preview", async (long id, HttpRequest req, GdsDbContext db, HttpContext h) =>
        {
            var mime = (req.ContentType ?? "").Split(';')[0].Trim().ToLowerInvariant();
            if (mime is not ("application/pdf" or "text/csv")) throw new GdsException("VALIDATION", "Upload a PDF or CSV file", 415);
            var fileName = Uri.UnescapeDataString(req.Headers["X-Pickup-Chart-Filename"].ToString()); if (fileName.Length > 180) fileName = fileName[..180];
            var selection = req.Headers["X-Pickup-Chart-GDS"].ToString();
            if (!Sources.Contains(selection)) throw new GdsException("VALIDATION", "Choose a supported GDS or Detect automatically");
            if (!Regex.IsMatch(fileName, @"\.(pdf|csv)$", RegexOptions.IgnoreCase)) throw new GdsException("VALIDATION", "Only searchable PDF and CSV files are supported", 415);
            if ((mime == "application/pdf") != fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)) throw new GdsException("VALIDATION", "File extension and content type mismatch", 415);
            using var ms = new MemoryStream();
            await req.Body.CopyToAsync(ms);
            if (ms.Length == 0 || ms.Length > Max) throw new GdsException("VALIDATION", "Choose a file up to 15 MB", 413);
            var buffer = ms.ToArray();

            var trip = await db.Trips.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null) ?? throw new GdsException("SERVICE_NOT_FOUND", "Schedule not found", 404);
            var route = await db.Routes.AsNoTracking().AsSplitQuery().Include(r => r.Stops).ThenInclude(s => s.City).Include(r => r.Stages).FirstAsync(r => r.Id == trip.RouteId);
            var stages = route.Stages.OrderBy(s => s.Day).ThenBy(s => s.Time).ToList();
            var cityNames = await db.Cities.AsNoTracking().Where(c => stages.Select(s => s.CityId).Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);
            var stops = route.Stops.OrderBy(s => s.Sequence).ToList();
            string origin = stops.FirstOrDefault()?.City?.Name ?? "", destination = stops.LastOrDefault()?.City?.Name ?? "";

            string text; List<Dictionary<string, string>> parsed; var skipped = 0;
            if (mime == "application/pdf") { text = await PdfText(buffer); (parsed, skipped) = RowsFromPdf(text); }
            else { text = Encoding.UTF8.GetString(buffer); parsed = RowsFromCsv(text); }
            var rows = parsed.Select(NormalizeRow).OfType<Row>().Take(1000).ToList();
            if (rows.Count == 0) throw new GdsException("VALIDATION", "No complete passenger rows were extracted; no chart has been imported", 422);

            var service = Regex.Match(text, @"(?:^|\n)\s*Service:\s*([A-Za-z0-9-]+)", RegexOptions.IgnoreCase) is { Success: true } sm ? sm.Groups[1].Value : null;
            var date = Regex.Match(text, @"(?:^|\n)\s*Date:\s*(\d{4}-\d\d-\d\d)", RegexOptions.IgnoreCase) is { Success: true } dm ? dm.Groups[1].Value : null;
            var tripDate = trip.TravelDate.ToString("yyyy-MM-dd");
            var blocked = new List<string>();
            if (service is not null && Norm(service) != Norm(route.ServiceNumber)) blocked.Add($"Service {service} does not match {route.ServiceNumber}");
            if (date is not null && date != tripDate) blocked.Add($"Travel date {date} does not match {tripDate}");

            // legacy assignStages(): match each pickup/drop to exactly one configured stage of the schedule.
            var warnings = new List<string>();
            RouteStage? Match(string v, string kind)
            {
                var same = stages.Where(s => s.Kind == kind && (Norm(s.Name) == Norm(v) || (Norm(s.Name).Length > 0 && Norm(v).StartsWith(Norm(s.Name))))).ToList();
                return same.Count == 1 ? same[0] : null;
            }
            for (var i = 0; i < rows.Count; i++)
            {
                var x = rows[i];
                var b = Match(x.Pickup, "pickup"); var d = Match(x.Drop, "drop");
                x.BoardingId = b?.Id; x.DroppingId = d?.Id;
                if (x.FromCity.Length == 0) x.FromCity = b is null ? origin : cityNames.GetValueOrDefault(b.CityId, origin);
                if (x.ToCity.Length == 0) x.ToCity = d is null ? destination : cityNames.GetValueOrDefault(d.CityId, destination);
                if (b is not null) { if (x.PickupTime.Length == 0) x.PickupTime = b.Time.ToString("HH:mm"); }
                else if (x.Pickup.Length > 0) warnings.Add($"Passenger {i + 1}: pickup \"{x.Pickup}\" does not match a configured schedule stage");
                if (d is not null) { if (x.DropTime.Length == 0) x.DropTime = d.Time.ToString("HH:mm"); x.DropDay = d.Day; }
                else if (x.Drop.Length > 0) warnings.Add($"Passenger {i + 1}: drop \"{x.Drop}\" does not match a configured schedule stage");
            }
            var detected = Detect(text); var chosen = selection == "Detect automatically" ? detected : selection;
            if (selection == "Detect automatically" && detected.StartsWith("Unknown")) warnings.Add("Source GDS cannot be identified from the file text; review the imported reference before confirming.");
            var layout = mime == "application/pdf"
                ? Regex.IsMatch(text, @"^\s*Boarding Details\s*$", RegexOptions.IgnoreCase | RegexOptions.Multiline) && Regex.IsMatch(text, @"^\s*Dropping Details\s*$", RegexOptions.IgnoreCase | RegexOptions.Multiline) ? "grouped_pickup"
                : Regex.IsMatch(text, @"^\s*#\s+Seat\s+Mobile\s+PNR\s+Name\s+G\s+Pickup\s+Drop\b", RegexOptions.IgnoreCase | RegexOptions.Multiline) ? "rto_seat_order" : "other_text_pdf"
                : "csv";
            if (layout == "rto_seat_order") warnings.Add("RTO chart: Pickup/Drop may be trip start/end instead of the passenger’s own stops; verify before confirming.");
            if (layout == "other_text_pdf") warnings.Add("Unrecognized PDF table layout; review each extracted passenger row and stop.");
            if (service is null || date is null) warnings.Add("The file does not identify both Service and Date; verify that it belongs to the selected schedule.");
            if (skipped > 0) warnings.Add($"{skipped} potential passenger row(s) were not recognized");
            if (!rows.All(x => x.Mobile.Length > 0)) warnings.Add("One or more passenger phone numbers were absent or invalid");
            var repeated = rows.GroupBy(x => x.Seat).Where(x => x.Count() > 1).Select(x => x.Key).Take(15).ToList();
            if (repeated.Count > 0) warnings.Add("Repeated seat codes across this manifest: " + string.Join(", ", repeated));
            warnings = warnings.Distinct().Take(75).ToList();

            // Expire stale previews, then store this one (legacy: in-memory Map with 20-minute TTL).
            var cutoff = DateTime.UtcNow - Ttl;
            await db.PickupChartImports.Where(x => x.Status == "preview" && x.CreatedAt < cutoff).ExecuteDeleteAsync();
            var imp = new PickupChartImport
            {
                TenantId = db.CurrentTenantId, TripId = id, Status = "preview", SourceGds = chosen, DetectedGds = detected, InputLayout = layout,
                FileName = Safe(fileName), Sha256 = Convert.ToHexStringLower(SHA256.HashData(buffer)), Bytes = buffer.Length,
                RowsJson = JsonSerializer.Serialize(rows, Json), WarningsJson = JsonSerializer.Serialize(new { warnings, blocking = blocked }),
                CreatedBy = h.User.Identity?.Name ?? "system", CreatedAt = DateTime.UtcNow,
            };
            db.PickupChartImports.Add(imp);
            await db.SaveChangesAsync();
            return Results.Ok(new
            {
                preview_id = imp.Id, file_name = imp.FileName, bytes = imp.Bytes, sha256 = imp.Sha256, detected_gds = detected, source_gds = chosen,
                input_layout = layout, passenger_count = rows.Count, service_in_file = service, travel_date_in_file = date,
                warnings, blocking_issues = blocked,
                rows = rows.Take(25).Select(x => new { x.Seat, x.Pnr, x.Name, x.Mobile, x.Pickup, x.Drop, x.Source }),
                expires_in_minutes = 20, inventory_will_change = false,
            });
        }).DisableAntiforgery();

        g.MapPost("/commit", async (long id, PickupChartCommitInput i, GdsDbContext db, HttpContext h) =>
        {
            if (!i.Confirm) throw new GdsException("VALIDATION", "Confirm that this is a reference-only import");
            var actor = h.User.Identity?.Name ?? "system";
            var imp = await db.PickupChartImports.FirstOrDefaultAsync(x => x.Id == i.PreviewId && x.TripId == id && x.Status == "preview" && x.CreatedBy == actor)
                ?? throw new GdsException("NOT_FOUND", "Preview expired or not found; upload the file again", 404);
            if (imp.CreatedAt < DateTime.UtcNow - Ttl) throw new GdsException("NOT_FOUND", "Preview expired or not found; upload the file again", 404);
            using (var w = JsonDocument.Parse(imp.WarningsJson))
                if (w.RootElement.TryGetProperty("blocking", out var bl) && bl.GetArrayLength() > 0) throw new GdsException("VALIDATION", "Resolve the blocking issues before importing");
            imp.Status = "committed"; imp.CommittedAt = DateTime.UtcNow;
            var count = JsonDocument.Parse(imp.RowsJson).RootElement.GetArrayLength();
            db.AuditLogs.Add(new AuditLog
            {
                TenantId = db.CurrentTenantId, Actor = actor, Action = "PICKUP_CHART_IMPORT", Entity = "trip", EntityId = id.ToString(), At = DateTime.UtcNow,
                DataJson = JsonSerializer.Serialize(new { op = "external_reference_import", source_gds = imp.SourceGds, sha256 = imp.Sha256, passenger_count = count, file_name = imp.FileName }),
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { success = true, import_id = imp.Id, source_gds = imp.SourceGds, passenger_count = count, imported_at = imp.CommittedAt, inventory_changed = false, bookings_changed = false });
        });

        // Latest committed import (legacy C.latestImport) for the "Imported" chart view.
        g.MapGet("/imported", async (long id, GdsDbContext db) =>
        {
            var imp = await db.PickupChartImports.AsNoTracking().Where(x => x.TripId == id && x.Status == "committed").OrderByDescending(x => x.CommittedAt).FirstOrDefaultAsync();
            if (imp is null) return Results.Ok(new { imported = (object?)null });
            using var w = JsonDocument.Parse(imp.WarningsJson);
            return Results.Ok(new
            {
                imported = new
                {
                    id = imp.Id, source_gds = imp.SourceGds, file_name = imp.FileName, input_layout = imp.InputLayout, at = imp.CommittedAt, by = imp.CreatedBy,
                    warnings = w.RootElement.TryGetProperty("warnings", out var ws) ? ws.Clone() : default,
                    rows = JsonDocument.Parse(imp.RowsJson).RootElement.Clone(),
                },
            });
        });
    }
}
