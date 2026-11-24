using System.Text.RegularExpressions;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Crm;

public sealed record NoteInput(string Text);
public sealed record ChatSendInput(string Text, string? Channel);
public sealed record CallInput(string? Phone, string? Pnr, string? Name, string? Direction, string? Kind, string? Status, int? DurationS, string? Notes);
public sealed record CallUpdate(string? Status, int? DurationS, string? Notes);
public sealed record ReplyInput(string Reply);
public sealed record FollowUpInput(string? Status, string? Note);

/// <summary>
/// CRM, chats, calls and ratings (port of legacy misc.js). Search is exact by phone/email/PNR and never lists customers
/// without a query. No messaging or telephony provider is connected: outbound chat messages and calls are records only,
/// and every such response says so.
/// </summary>
public sealed partial class CrmService(GdsDbContext db, TimeProvider clock)
{
    public static readonly string[] CallStatuses = ["answered", "missed", "busy", "not_reachable", "logged"];
    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    private long T => db.CurrentTenantId;

    [GeneratedRegex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$")] private static partial Regex EmailRx();
    private static string Digits(string s) => new(s.Where(char.IsDigit).ToArray());

    /// <summary>Masks all but the last 4 digits for roles without PII permission.</summary>
    public static string? Mask(string? phone, bool canSee) => canSee || phone is null || phone.Length < 4 ? phone : new string('•', phone.Length - 4) + phone[^4..];

    private IQueryable<Booking> BookingsQ => db.Bookings.AsNoTracking().Include(b => b.Passengers);

    private async Task<List<object>> DisplayAsync(List<Booking> bookings, bool canSeePhone)
    {
        var tripIds = bookings.Select(b => b.TripId).Distinct().ToList();
        var trips = await db.Trips.AsNoTracking().Where(t => tripIds.Contains(t.Id)).Select(t => new { t.Id, t.TravelDate, t.RouteId, t.Route!.ServiceNumber }).ToDictionaryAsync(t => t.Id);
        var stageIds = bookings.SelectMany(b => new[] { b.BoardingStageId, b.DroppingStageId }).Distinct().ToList();
        var stages = await db.Set<RouteStage>().AsNoTracking().Where(s => stageIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id);
        return bookings.Select(b =>
        {
            var t = trips.GetValueOrDefault(b.TripId);
            var bp = stages.GetValueOrDefault(b.BoardingStageId); var dp = stages.GetValueOrDefault(b.DroppingStageId);
            return (object)new
            {
                b.Pnr, b.Status, b.Channel, travelDate = t?.TravelDate, service = t?.ServiceNumber, tripId = b.TripId, amount = b.TotalFare, issuedAt = b.DateOfIssue,
                from = bp?.Name, to = dp?.Name, boardingTime = bp?.Time, contact = Mask(b.ContactMobile, canSeePhone), email = canSeePhone ? b.ContactEmail : null,
                passengers = b.Passengers.Select(p => new { p.SeatCode, p.Name, p.Age, p.Gender, p.Status, p.BoardingStatus, p.Fare }),
            };
        }).ToList();
    }

    public async Task<object> PassengerSearchAsync(string mode, string? q, bool canSeePhone)
    {
        mode = (mode ?? "").ToLowerInvariant();
        var raw = (q ?? "").Trim();
        if (mode is not ("phone" or "email" or "pnr")) throw new GdsException("VALIDATION", "Choose phone, email or pnr");
        if (raw.Length == 0) return new { mode, query = "", total = 0, customers = Array.Empty<object>() };
        if (raw.Length > 160) throw new GdsException("VALIDATION", "Search query too long");
        List<Booking> match;
        if (mode == "phone")
        {
            var d = Digits(raw);
            if (d.Length < 7) throw new GdsException("VALIDATION", "Enter at least 7 phone digits");
            match = await BookingsQ.Where(b => b.ContactMobile != null && b.ContactMobile.EndsWith(d)).OrderByDescending(b => b.DateOfIssue).Take(500).ToListAsync();
        }
        else if (mode == "email")
        {
            if (!EmailRx().IsMatch(raw)) throw new GdsException("VALIDATION", "Enter a valid email");
            var e = raw.ToLowerInvariant();
            match = await BookingsQ.Where(b => b.ContactEmail != null && b.ContactEmail.ToLower() == e).OrderByDescending(b => b.DateOfIssue).Take(500).ToListAsync();
        }
        else
        {
            if (raw.Length < 4) throw new GdsException("VALIDATION", "Enter at least 4 PNR characters");
            var p = raw.ToUpperInvariant();
            match = await BookingsQ.Where(b => b.Pnr.ToUpper() == p).ToListAsync();
        }
        var phones = match.Select(b => b.ContactMobile).Where(p => p != null).Distinct().ToList();
        var customers = new List<object>();
        foreach (var phone in phones)
        {
            var mine = await db.Bookings.AsNoTracking().Where(b => b.ContactMobile == phone).Select(b => new { b.Status, b.TotalFare, b.TripId, b.Trip!.TravelDate }).ToListAsync();
            var loyalty = await db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Phone == phone);
            var conf = mine.Where(b => b.Status != "CANCELLED").ToList();
            var today = DateOnly.FromDateTime(Now);
            var name = match.First(b => b.ContactMobile == phone).Passengers.FirstOrDefault(p => p.IsPrimary)?.Name ?? loyalty?.Name ?? "";
            customers.Add(new
            {
                phone = Mask(phone, canSeePhone), phoneKey = canSeePhone ? phone : null, name, tier = loyalty?.Tier ?? "Bronze", miles = loyalty?.Miles ?? 0,
                totalTrips = conf.Count, totalBookings = mine.Count, cancelled = mine.Count - conf.Count, upcoming = conf.Count(b => b.TravelDate >= today),
                cancellationPct = mine.Count > 0 ? Math.Round(100m * (mine.Count - conf.Count) / mine.Count, 2) : 0, spend = conf.Sum(b => b.TotalFare),
                lastTravel = mine.Count > 0 ? mine.Max(b => b.TravelDate) : (DateOnly?)null,
                bookings = await DisplayAsync(match.Where(b => b.ContactMobile == phone).ToList(), canSeePhone),
            });
        }
        return new { mode, query = raw, total = match.Count, customers };
    }

    public async Task<object> CustomerAsync(string phone, bool canSeePhone)
    {
        var bookings = await BookingsQ.Where(b => b.ContactMobile == phone).OrderByDescending(b => b.DateOfIssue).Take(200).ToListAsync();
        var loyalty = await db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Phone == phone);
        if (bookings.Count == 0 && loyalty is null) throw new GdsException("NOT_FOUND", "Customer not found", 404);
        return new
        {
            phone = Mask(phone, canSeePhone), name = bookings.SelectMany(b => b.Passengers).FirstOrDefault(p => p.IsPrimary)?.Name ?? loyalty?.Name,
            loyalty = new { tier = loyalty?.Tier ?? "Bronze", miles = loyalty?.Miles ?? 0 },
            bookings = await DisplayAsync(bookings, canSeePhone),
            messages = await db.ChatMessages.AsNoTracking().Where(m => m.Phone == phone).OrderByDescending(m => m.Ts).Take(50).ToListAsync(),
            calls = await db.CallLogs.AsNoTracking().Where(c => c.Phone == phone).OrderByDescending(c => c.Ts).Take(50).ToListAsync(),
            ratings = await db.OtaRatings.AsNoTracking().Where(r => r.Phone == phone).OrderByDescending(r => r.RatedAt).ToListAsync(),
            notes = await db.CrmNotes.AsNoTracking().Where(n => n.Phone == phone).OrderByDescending(n => n.At).ToListAsync(),
        };
    }

    public async Task<CrmNote> AddNoteAsync(string phone, NoteInput i, string actor)
    {
        var text = (i.Text ?? "").Trim();
        if (text.Length is 0 or > 2000) throw new GdsException("VALIDATION", "Note must be 1–2000 characters");
        var n = new CrmNote { TenantId = T, Phone = phone, Text = text, By = actor, At = Now };
        db.CrmNotes.Add(n);
        await db.SaveChangesAsync();
        return n;
    }

    // ---------------- chats ----------------
    public async Task<object> ConversationsAsync(string? filter, string? q)
    {
        var msgs = await db.ChatMessages.AsNoTracking().OrderBy(m => m.Ts).ToListAsync();
        var blocked = await db.ChatBlocks.AsNoTracking().Select(b => b.Phone).ToHashSetAsync();
        var list = msgs.GroupBy(m => m.ConversationId).Select(g =>
        {
            var last = g.Last(); var parts = g.Key.Split('_');
            var firstIn = g.FirstOrDefault(m => m.Direction == "in");
            return new
            {
                conversationId = g.Key, name = firstIn?.By is { } by && by != "system" ? by : parts[0], phone = last.Phone,
                service = parts.ElementAtOrDefault(1), travelDate = parts.ElementAtOrDefault(2), lastMessage = last.Text, lastTs = last.Ts, channel = last.Channel,
                unread = g.Count(m => m.Direction == "in" && !m.Read), blocked = blocked.Contains(last.Phone),
            };
        });
        if (filter == "unread") list = list.Where(c => c.unread > 0);
        if (!string.IsNullOrWhiteSpace(q)) list = list.Where(c => $"{c.name} {c.phone} {c.conversationId}".Contains(q, StringComparison.OrdinalIgnoreCase));
        var rows = list.OrderByDescending(c => c.lastTs).ToList();
        return new { conversations = rows, unreadTotal = rows.Sum(c => c.unread) };
    }

    public async Task<object> ConversationAsync(string id)
    {
        var msgs = await db.ChatMessages.Where(m => m.ConversationId == id).OrderBy(m => m.Ts).ToListAsync();
        if (msgs.Count == 0) throw new GdsException("NOT_FOUND", "Conversation not found", 404);
        foreach (var m in msgs.Where(m => m.Direction == "in" && !m.Read)) m.Read = true;
        await db.SaveChangesAsync();
        return new { messages = msgs, templates = new[] { "Your bus is delayed by 15 minutes. Sorry for the inconvenience.", "Pickup point: {boarding}. Please reach 10 minutes early.", "Thank you for travelling with us!" } };
    }

    public async Task<ChatMessage> SendAsync(string id, ChatSendInput i, string actor)
    {
        var last = await db.ChatMessages.Where(m => m.ConversationId == id).OrderByDescending(m => m.Ts).FirstOrDefaultAsync()
                   ?? throw new GdsException("NOT_FOUND", "Conversation not found", 404);
        var text = (i.Text ?? "").Trim();
        if (text.Length == 0) throw new GdsException("VALIDATION", "Message is empty");
        if (await db.ChatBlocks.AnyAsync(b => b.Phone == last.Phone)) throw new GdsException("BLOCKED", "User is blocked", 409);
        var m = new ChatMessage { TenantId = T, ConversationId = id, Direction = "out", Channel = i.Channel ?? last.Channel, Text = text[..Math.Min(2000, text.Length)],
            Phone = last.Phone, Ts = Now, Read = true, By = actor, DeliveryStatus = "recorded" };
        db.ChatMessages.Add(m);
        await db.SaveChangesAsync();
        return m;
    }

    public async Task<bool> ToggleBlockAsync(string id, string? reason, string actor)
    {
        var last = await db.ChatMessages.Where(m => m.ConversationId == id).OrderByDescending(m => m.Ts).FirstOrDefaultAsync()
                   ?? throw new GdsException("NOT_FOUND", "Conversation not found", 404);
        var ex = await db.ChatBlocks.FirstOrDefaultAsync(b => b.Phone == last.Phone);
        if (ex is not null) db.ChatBlocks.Remove(ex);
        else db.ChatBlocks.Add(new ChatBlock { TenantId = T, Phone = last.Phone, Reason = reason ?? "spam", By = actor, At = Now });
        await db.SaveChangesAsync();
        return ex is null;
    }

    // ---------------- calls ----------------
    public async Task<object> CallsAsync(string? status, string? direction, string? q)
    {
        var rows = db.CallLogs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrEmpty(status)) rows = rows.Where(c => c.Status == status);
        if (!string.IsNullOrEmpty(direction)) rows = rows.Where(c => c.Direction == direction);
        if (!string.IsNullOrWhiteSpace(q)) rows = rows.Where(c => c.Phone.Contains(q) || (c.PassengerName != null && c.PassengerName.ToLower().Contains(q.ToLower())) || c.Pnr == q);
        var list = await rows.OrderByDescending(c => c.Ts).Take(500).ToListAsync();
        return new { calls = list, stats = new { total = list.Count, answered = list.Count(c => c.Status == "answered"), missed = list.Count(c => c.Status == "missed"),
            avgDuration = list.Count > 0 ? (int)list.Average(c => c.DurationS) : 0 }, provider = (string?)null };
    }

    public async Task<CallLog> LogCallAsync(CallInput i, string actor)
    {
        var b = i.Pnr is { Length: > 0 } ? await BookingsQ.FirstOrDefaultAsync(x => x.Pnr == i.Pnr) : null;
        if (i.Pnr is { Length: > 0 } && b is null) throw new GdsException("NOT_FOUND", "PNR not found", 404);
        var phone = Digits(i.Phone ?? b?.ContactMobile ?? "");
        if (phone.Length > 10) phone = phone[^10..];
        if (phone.Length != 10) throw new GdsException("VALIDATION", "Valid 10-digit phone required");
        if (i.Status is not null && !CallStatuses.Contains(i.Status)) throw new GdsException("VALIDATION", "Invalid call status");
        var c = new CallLog
        {
            TenantId = T, Direction = i.Direction == "incoming" ? "incoming" : "outgoing", Kind = i.Kind ?? "manual", Phone = phone,
            PassengerName = b?.Passengers.FirstOrDefault(p => p.IsPrimary)?.Name ?? i.Name, Pnr = b?.Pnr, TripId = b?.TripId, Status = i.Status ?? "logged",
            DurationS = Math.Max(0, i.DurationS ?? 0), Notes = i.Notes, Agent = actor, Ts = Now,
        };
        db.CallLogs.Add(c);
        await db.SaveChangesAsync();
        return c;
    }

    public async Task<CallLog> UpdateCallAsync(long id, CallUpdate u)
    {
        var c = await db.CallLogs.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "Call not found", 404);
        if (u.Status is not null) { if (!CallStatuses.Contains(u.Status)) throw new GdsException("VALIDATION", "Invalid call status"); c.Status = u.Status; }
        if (u.DurationS is not null) c.DurationS = Math.Max(0, u.DurationS.Value);
        if (u.Notes is not null) c.Notes = u.Notes;
        await db.SaveChangesAsync();
        return c;
    }

    // ---------------- ratings ----------------
    public async Task<object> RatingsAsync(int? max, string? ota)
    {
        var all = await db.OtaRatings.AsNoTracking().ToListAsync();
        var rows = all.Where(x => (max is null || x.Rating <= max) && (ota is null || x.Ota == ota)).OrderByDescending(x => x.RatedAt).ToList();
        return new { rows, avg = all.Count > 0 ? Math.Round(all.Average(x => x.Rating), 2) : 0, distribution = Enumerable.Range(1, 5).Select(n => all.Count(x => x.Rating == n)) };
    }

    public async Task<OtaRating> ReplyAsync(long id, ReplyInput i, string actor)
    {
        var r = await db.OtaRatings.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "Rating not found", 404);
        var text = (i.Reply ?? "").Trim();
        if (text.Length is 0 or > 1000) throw new GdsException("VALIDATION", "Reply must be 1–1000 characters");
        r.OperatorReply = text; r.RepliedBy = actor; r.RepliedAt = Now; // stored only; not published to the OTA (no ratings API integration)
        await db.SaveChangesAsync();
        return r;
    }

    public async Task<OtaRating> FollowUpAsync(long id, FollowUpInput i, string actor)
    {
        var r = await db.OtaRatings.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "Rating not found", 404);
        if (i.Status is not null) r.FollowUpStatus = i.Status[..Math.Min(40, i.Status.Length)];
        if (i.Note is not null) r.FollowUpNote = i.Note[..Math.Min(1000, i.Note.Length)];
        r.FollowUpBy = actor; r.FollowUpAt = Now;
        await db.SaveChangesAsync();
        return r;
    }
}
