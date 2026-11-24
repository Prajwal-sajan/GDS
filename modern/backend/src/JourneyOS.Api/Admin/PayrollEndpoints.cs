using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record AttendanceRangeInput(DateOnly From, DateOnly To);
public sealed record AttendanceApproveInput(long[]? Ids, DateOnly? From, DateOnly? To);
public sealed record AttendanceCreateInput(long StaffId, DateOnly Date, string? Status, decimal? Amount);
public sealed record AttendanceUpdateInput(string? Status, decimal? Amount, string? State);
public sealed record PayoutGenerateInput(DateOnly From, DateOnly To, long[]? StaffIds, bool DeductAdvances);
public sealed record PayoutPayInput(string? PaymentMode, string? Reference);
public sealed record PayoutAdjustInput(decimal? Gross, decimal? Deductions);
public sealed record AdvanceInput(long StaffId, decimal Amount, string? AdvanceType, DateOnly? DateIssued, string? Reason, string? PaymentMode,
    string? RecoveryMethod, int? NumInstallments, decimal? InterestRate);
public sealed record AmountInput(decimal Amount);
public sealed record ReimbursementInput(long StaffId, decimal Amount, string? Category, DateOnly? Date, string? Description, string? Receipt);

/// <summary>
/// Staff payroll: port of legacy master.js attendance / payouts / ledger / advances / reimbursements.
/// Rules are kept identical to legacy (auto attendance from trip crew, monthly gross = salary × days / 30, advance deduction
/// capped at gross, approved reimbursements rolled into the payout). Every mutation is audited.
/// </summary>
public sealed class PayrollService(GdsDbContext db, TimeProvider clock)
{
    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    public DateOnly Today => DateOnly.FromDateTime(Now.AddHours(5.5));
    private long T => db.CurrentTenantId;

    private void Audit(string actor, string action, string entity, long id, object data) =>
        db.AuditLogs.Add(new AuditLog { TenantId = T, Actor = actor, Action = action, Entity = entity, EntityId = id.ToString(), DataJson = System.Text.Json.JsonSerializer.Serialize(data), At = Now });

    private static GdsException NotFound(string what) => new("NOT_FOUND", $"{what} not found", 404);

    // ---------- attendance ----------
    public async Task<object> AttendanceAsync(DateOnly? from, DateOnly? to, long? staffId)
    {
        var f = from ?? Today.AddDays(-7); var t = to ?? Today;
        var rows = await db.StaffAttendance.AsNoTracking().Where(a => a.Date >= f && a.Date <= t && (staffId == null || a.StaffId == staffId)).OrderBy(a => a.Id).ToListAsync();
        var ids = rows.Select(a => a.StaffId).Distinct().ToList();
        var staff = await db.Staff.AsNoTracking().Where(s => ids.Contains(s.Id)).ToDictionaryAsync(s => s.Id);
        var tripIds = rows.Where(a => a.TripId != null).Select(a => a.TripId!.Value).Distinct().ToList();
        var services = await db.Trips.AsNoTracking().Where(x => tripIds.Contains(x.Id)).Select(x => new { x.Id, x.Route!.ServiceNumber }).ToDictionaryAsync(x => x.Id, x => x.ServiceNumber);
        var dates = new List<string>();
        for (var d = f; d <= t; d = d.AddDays(1)) dates.Add(d.ToString("yyyy-MM-dd"));
        return new
        {
            from = f, to = t, dates,
            staff = ids.Select(id =>
            {
                var mine = rows.Where(a => a.StaffId == id).ToList();
                staff.TryGetValue(id, out var s);
                return new
                {
                    staff_id = id, name = s?.Name, role = s?.Role, phone = s?.Phone,
                    days = mine.ToDictionary(a => a.Date.ToString("yyyy-MM-dd"), a => new { id = a.Id, status = a.Status, state = a.State, amount = a.Amount, service = a.TripId is { } tr ? services.GetValueOrDefault(tr) : null }),
                    present = mine.Count(a => a.Status == "present"), amount = mine.Sum(a => a.Amount), draft = mine.Count(a => a.State == "draft"),
                };
            }),
        };
    }

    public async Task<int> GenerateAttendanceAsync(DateOnly from, DateOnly to, string actor)
    {
        var today = Today;
        var crew = await db.TripAssignments.AsNoTracking()
            .Where(a => a.IsActive && a.Kind == "staff" && a.StaffId != null)
            .Join(db.Trips.Where(t => t.TravelDate >= from && t.TravelDate <= to && t.TravelDate <= today && t.Status == "active"), a => a.TripId, t => t.Id, (a, t) => new { a.StaffId, t.TravelDate, TripId = t.Id })
            .OrderBy(x => x.TravelDate).ThenBy(x => x.TripId).ToListAsync();
        var existing = (await db.StaffAttendance.Where(a => a.Date >= from && a.Date <= to).Select(a => new { a.StaffId, a.Date }).ToListAsync())
            .Select(x => (x.StaffId, x.Date)).ToHashSet();
        var salary = await db.Staff.AsNoTracking().ToDictionaryAsync(s => s.Id, s => s.SalaryAmount ?? 0);
        var n = 0;
        foreach (var c in crew)
        {
            if (!existing.Add((c.StaffId!.Value, c.TravelDate))) continue;
            db.StaffAttendance.Add(new StaffAttendance { TenantId = T, StaffId = c.StaffId.Value, Date = c.TravelDate, Status = "present", TripId = c.TripId, Source = "auto", State = "draft", Amount = salary.GetValueOrDefault(c.StaffId.Value) });
            n++;
        }
        Audit(actor, "ATTENDANCE_GENERATE", "attendance", 0, new { from, to, generated = n });
        await db.SaveChangesAsync();
        return n;
    }

    public async Task<StaffAttendance> CreateAttendanceAsync(AttendanceCreateInput i, string actor)
    {
        if (!await db.Staff.AnyAsync(s => s.Id == i.StaffId)) throw NotFound("Staff");
        if (i.Status is not (null or "present" or "absent" or "leave")) throw new GdsException("VALIDATION", "Status must be present, absent or leave");
        if (i.Amount is < 0) throw new GdsException("VALIDATION", "Amount cannot be negative");
        if (await db.StaffAttendance.AnyAsync(a => a.StaffId == i.StaffId && a.Date == i.Date)) throw new GdsException("DUPLICATE", "Attendance already recorded for this day", 409);
        var a = new StaffAttendance { TenantId = T, StaffId = i.StaffId, Date = i.Date, Status = i.Status ?? "present", Source = "manual", State = "draft", Amount = i.Amount ?? 0 };
        db.StaffAttendance.Add(a);
        await db.SaveChangesAsync();
        Audit(actor, "ATTENDANCE_CREATE", "attendance", a.Id, i);
        await db.SaveChangesAsync();
        return a;
    }

    public async Task<StaffAttendance> UpdateAttendanceAsync(long id, AttendanceUpdateInput i, string actor)
    {
        var a = await db.StaffAttendance.FirstOrDefaultAsync(x => x.Id == id) ?? throw NotFound("Attendance");
        if (i.Status is not (null or "present" or "absent" or "leave")) throw new GdsException("VALIDATION", "Status must be present, absent or leave");
        if (i.State is not (null or "draft" or "approved")) throw new GdsException("VALIDATION", "Invalid state");
        if (i.Amount is < 0) throw new GdsException("VALIDATION", "Amount cannot be negative");
        a.Status = i.Status ?? a.Status; a.Amount = i.Amount ?? a.Amount; a.State = i.State ?? a.State; a.Source = "manual_edited";
        Audit(actor, "ATTENDANCE_UPDATE", "attendance", id, i);
        await db.SaveChangesAsync();
        return a;
    }

    public async Task<int> ApproveAttendanceAsync(AttendanceApproveInput i, string actor)
    {
        var q = db.StaffAttendance.Where(a => a.State == "draft");
        if (i.Ids is { Length: > 0 } ids) q = q.Where(a => ids.Contains(a.Id));
        else if (i.From is { } f && i.To is { } t) q = q.Where(a => a.Date >= f && a.Date <= t);
        else throw new GdsException("VALIDATION", "Provide ids or a from/to range");
        var rows = await q.ToListAsync();
        foreach (var a in rows) a.State = "approved";
        Audit(actor, "ATTENDANCE_APPROVE", "attendance", 0, new { i.Ids, i.From, i.To, approved = rows.Count });
        await db.SaveChangesAsync();
        return rows.Count;
    }

    // ---------- payouts ----------
    private static decimal MonthlyGross(Staff s, DateOnly from, DateOnly to) => Math.Round((s.SalaryAmount ?? 0) * (to.DayNumber - from.DayNumber + 1) / 30m, MidpointRounding.AwayFromZero);

    public async Task<object> PayoutsAsync(string? status)
    {
        var staff = await db.Staff.AsNoTracking().ToDictionaryAsync(s => s.Id);
        var list = await db.StaffPayouts.AsNoTracking().Where(p => status == null || p.Status == status).OrderByDescending(p => p.PeriodEnd).ThenBy(p => p.Id).ToListAsync();
        return new { payouts = list.Select(p => Payout(p, staff.GetValueOrDefault(p.StaffId))) };
    }

    private static object Payout(StaffPayout p, Staff? s) => new
    {
        id = p.Id, payout_no = p.PayoutNo, staff_id = p.StaffId, period_start = p.PeriodStart, period_end = p.PeriodEnd, days = p.Days, gross = p.Gross,
        deductions = p.Deductions, advances_recovered = p.AdvancesRecovered, reimbursements = p.Reimbursements, net = p.Net, status = p.Status,
        approved_by = p.ApprovedBy, paid_at = p.PaidAt, payment_mode = p.PaymentMode, reference = p.Reference, staff_name = s?.Name, staff_role = s?.Role,
    };

    public async Task<object> PayoutSummaryAsync()
    {
        var m0 = new DateOnly(Today.Year, Today.Month, 1); var m1 = m0.AddMonths(1);
        var p = await db.StaffPayouts.AsNoTracking().ToListAsync();
        bool ThisMonth(StaffPayout x) => x.PaidAt is { } d && d >= m0 && d < m1;
        return new
        {
            total_paid_this_month = p.Where(x => x.Status == "paid" && ThisMonth(x)).Sum(x => x.Net),
            total_pending_approval = p.Where(x => x.Status == "draft").Sum(x => x.Net),
            total_approved_unpaid = p.Where(x => x.Status == "approved").Sum(x => x.Net),
            payouts_count_this_month = p.Count(ThisMonth),
        };
    }

    private async Task<decimal> PrevBalanceAsync(long staffId, DateOnly before)
    {
        var credits = await db.StaffAttendance.Where(a => a.StaffId == staffId && a.Date < before && a.State == "approved").SumAsync(a => a.Amount);
        var paid = await db.StaffPayouts.Where(x => x.StaffId == staffId && x.PeriodEnd < before && x.Status == "paid").SumAsync(x => x.Net);
        var adv = await db.StaffAdvances.Where(a => a.StaffId == staffId && a.DateIssued < before).SumAsync(a => a.Amount);
        return credits - paid - adv;
    }

    public async Task<object> PayoutPreviewAsync(DateOnly from, DateOnly to)
    {
        var rows = new List<object>();
        foreach (var s in await db.Staff.AsNoTracking().Where(x => x.Status == "active").OrderBy(x => x.Id).ToListAsync())
        {
            var att = await db.StaffAttendance.AsNoTracking().Where(a => a.StaffId == s.Id && a.Date >= from && a.Date <= to && a.State == "approved").ToListAsync();
            if (att.Count == 0 && s.SalaryType != "monthly") continue;
            if (await db.StaffPayouts.AnyAsync(p => p.StaffId == s.Id && p.PeriodStart == from && p.PeriodEnd == to)) continue;
            var gross = s.SalaryType == "monthly" ? MonthlyGross(s, from, to) : att.Sum(a => a.Amount);
            var adv = await db.StaffAdvances.Where(a => a.StaffId == s.Id && a.Status == "disbursed").SumAsync(a => a.Amount - a.AmountRecovered);
            var reimb = await db.StaffReimbursements.Where(x => x.StaffId == s.Id && x.Status == "approved").SumAsync(x => x.Amount);
            rows.Add(new { staff_id = s.Id, name = s.Name, role = s.Role, days = att.Count, gross, advances_outstanding = adv, reimbursements = reimb, prev_balance = await PrevBalanceAsync(s.Id, from), net = gross + reimb });
        }
        return new { from, to, rows };
    }

    public async Task<object> GeneratePayoutsAsync(PayoutGenerateInput i, string actor)
    {
        if (i.To < i.From) throw new GdsException("VALIDATION", "Period end is before start");
        var ids = i.StaffIds ?? [];
        var seq = await db.StaffPayouts.CountAsync() + 1;
        var created = new List<StaffPayout>();
        foreach (var s in await db.Staff.Where(x => ids.Contains(x.Id)).OrderBy(x => x.Id).ToListAsync())
        {
            var att = await db.StaffAttendance.Where(a => a.StaffId == s.Id && a.Date >= i.From && a.Date <= i.To && a.State == "approved").ToListAsync();
            var gross = s.SalaryType == "monthly" ? MonthlyGross(s, i.From, i.To) : att.Sum(a => a.Amount);
            decimal ded = 0;
            if (i.DeductAdvances)
                foreach (var a in await db.StaffAdvances.Where(x => x.StaffId == s.Id && x.Status == "disbursed").OrderBy(x => x.Id).ToListAsync())
                {
                    var take = Math.Max(0, Math.Min(a.Amount - a.AmountRecovered, gross - ded));
                    a.AmountRecovered += take;
                    if (a.AmountRecovered >= a.Amount) a.Status = "recovered";
                    ded += take;
                }
            var reimb = await db.StaffReimbursements.Where(x => x.StaffId == s.Id && x.Status == "approved").ToListAsync();
            foreach (var r in reimb) r.Status = "in_payout";
            var rsum = reimb.Sum(x => x.Amount);
            string no;
            do no = $"PAY-{i.To:yyyy-MM}-{seq++:000}"; while (await db.StaffPayouts.AnyAsync(p => p.PayoutNo == no) || created.Any(p => p.PayoutNo == no));
            var p = new StaffPayout { TenantId = T, PayoutNo = no, StaffId = s.Id, PeriodStart = i.From, PeriodEnd = i.To, Days = att.Count, Gross = gross, AdvancesRecovered = ded, Reimbursements = rsum, Net = gross - ded + rsum, Status = "draft" };
            db.StaffPayouts.Add(p);
            created.Add(p);
        }
        await db.SaveChangesAsync();
        foreach (var p in created) Audit(actor, "PAYOUT_GENERATE", "payout", p.Id, new { p.PayoutNo, p.StaffId, p.Gross, p.AdvancesRecovered, p.Reimbursements, p.Net });
        await db.SaveChangesAsync();
        var staff = await db.Staff.AsNoTracking().ToDictionaryAsync(s => s.Id);
        return new { created = created.Count, payouts = created.Select(p => Payout(p, staff.GetValueOrDefault(p.StaffId))) };
    }

    public async Task<object> ApprovePayoutAsync(long id, string actor)
    {
        var p = await db.StaffPayouts.FirstOrDefaultAsync(x => x.Id == id) ?? throw NotFound("Payout");
        if (p.Status == "paid") throw new GdsException("PAYOUT_PAID", "Payout is already paid", 409);
        p.Status = "approved"; p.ApprovedBy = actor;
        Audit(actor, "PAYOUT_APPROVE", "payout", id, new { p.PayoutNo, p.Net });
        await db.SaveChangesAsync();
        return Payout(p, null);
    }

    public async Task<object> PayPayoutAsync(long id, PayoutPayInput i, string actor)
    {
        var p = await db.StaffPayouts.FirstOrDefaultAsync(x => x.Id == id) ?? throw NotFound("Payout");
        if (p.Status == "paid") throw new GdsException("PAYOUT_PAID", "Payout is already paid", 409);
        p.Status = "paid"; p.PaidAt = Today; p.PaymentMode = i.PaymentMode ?? "bank"; p.Reference = i.Reference;
        foreach (var r in await db.StaffReimbursements.Where(r => r.StaffId == p.StaffId && r.Status == "in_payout").ToListAsync()) r.Status = "paid";
        Audit(actor, "PAYOUT_PAY", "payout", id, new { p.PayoutNo, p.Net, p.PaymentMode, p.Reference });
        await db.SaveChangesAsync();
        return Payout(p, null);
    }

    public async Task<object> AdjustPayoutAsync(long id, PayoutAdjustInput i, string actor)
    {
        var p = await db.StaffPayouts.FirstOrDefaultAsync(x => x.Id == id) ?? throw NotFound("Payout");
        if (p.Status == "paid") throw new GdsException("PAYOUT_PAID", "Paid payouts cannot be adjusted", 409);
        if (i.Gross is < 0 || i.Deductions is < 0) throw new GdsException("VALIDATION", "Amounts cannot be negative");
        p.Gross = i.Gross ?? p.Gross; p.Deductions = i.Deductions ?? p.Deductions;
        p.Net = p.Gross - p.Deductions - p.AdvancesRecovered + (p.Reimbursements ?? 0); p.Status = "draft";
        Audit(actor, "PAYOUT_ADJUST", "payout", id, i);
        await db.SaveChangesAsync();
        return Payout(p, null);
    }

    public async Task DeletePayoutAsync(long id, string actor)
    {
        var p = await db.StaffPayouts.FirstOrDefaultAsync(x => x.Id == id) ?? throw NotFound("Payout");
        if (p.Status == "paid") throw new GdsException("PAYOUT_PAID", "Paid payouts cannot be deleted", 409);
        db.StaffPayouts.Remove(p);
        Audit(actor, "PAYOUT_DELETE", "payout", id, new { p.PayoutNo, p.StaffId, p.Net });
        await db.SaveChangesAsync();
    }

    public async Task<object> LedgerAsync(long id)
    {
        var s = await db.Staff.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) ?? throw NotFound("Staff");
        var e = new List<(DateOnly date, string kind, decimal credit, decimal debit, string note)>();
        e.AddRange((await db.StaffAttendance.AsNoTracking().Where(a => a.StaffId == id && a.State == "approved").ToListAsync()).Select(a => (a.Date, "duty", a.Amount, 0m, a.Status)));
        e.AddRange((await db.StaffAdvances.AsNoTracking().Where(a => a.StaffId == id).ToListAsync()).Select(a => (a.DateIssued, "advance", 0m, a.Amount, a.AdvanceType)));
        e.AddRange((await db.StaffPayouts.AsNoTracking().Where(p => p.StaffId == id && p.Status == "paid").ToListAsync()).Select(p => (p.PaidAt ?? p.PeriodEnd, "payout", 0m, p.Net, p.PayoutNo)));
        e.AddRange((await db.StaffReimbursements.AsNoTracking().Where(r => r.StaffId == id && (r.Status == "approved" || r.Status == "paid" || r.Status == "in_payout")).ToListAsync()).Select(r => (r.Date, "reimbursement", r.Amount, 0m, r.Category)));
        decimal bal = 0;
        var entries = e.OrderBy(x => x.date).Select(x => { bal += x.credit - x.debit; return new { date = x.date, kind = x.kind, credit = x.credit, debit = x.debit, note = x.note, balance = bal }; }).ToList();
        return new { staff_id = id, staff_name = s.Name, entries, total_credits = e.Sum(x => x.credit), total_debits = e.Sum(x => x.debit), balance = bal };
    }

    // ---------- advances ----------
    public async Task<object> AdvancesAsync()
    {
        var staff = await db.Staff.AsNoTracking().ToDictionaryAsync(s => s.Id);
        var list = await db.StaffAdvances.AsNoTracking().OrderByDescending(a => a.Id).ToListAsync();
        var m0 = new DateOnly(Today.Year, Today.Month, 1); var m1 = m0.AddMonths(1);
        return new
        {
            advances = list.Select(a => new
            {
                id = a.Id, staff_id = a.StaffId, advance_type = a.AdvanceType, amount = a.Amount, date_issued = a.DateIssued, reason = a.Reason, payment_mode = a.PaymentMode,
                recovery_method = a.RecoveryMethod, num_installments = a.NumInstallments, interest_rate = a.InterestRate, amount_recovered = a.AmountRecovered, status = a.Status,
                balance = a.Amount - a.AmountRecovered, staff_name = staff.GetValueOrDefault(a.StaffId)?.Name, staff_role = staff.GetValueOrDefault(a.StaffId)?.Role,
            }),
            summary = new { total_outstanding = list.Sum(a => a.Amount - a.AmountRecovered), total_disbursed_this_month = list.Where(a => a.DateIssued >= m0 && a.DateIssued < m1).Sum(a => a.Amount), overdue_count = 0 },
        };
    }

    public async Task<StaffAdvance> CreateAdvanceAsync(AdvanceInput i, string actor)
    {
        if (!(i.Amount > 0) || !await db.Staff.AnyAsync(s => s.Id == i.StaffId)) throw new GdsException("VALIDATION", "Staff and amount required");
        var a = new StaffAdvance
        {
            TenantId = T, StaffId = i.StaffId, Amount = i.Amount, AdvanceType = i.AdvanceType ?? "salary", DateIssued = i.DateIssued ?? Today, Reason = i.Reason,
            PaymentMode = i.PaymentMode ?? "cash", RecoveryMethod = i.RecoveryMethod ?? "one_time", NumInstallments = i.NumInstallments, InterestRate = i.InterestRate, Status = "disbursed",
        };
        db.StaffAdvances.Add(a);
        await db.SaveChangesAsync();
        Audit(actor, "ADVANCE_CREATE", "advance", a.Id, i);
        await db.SaveChangesAsync();
        return a;
    }

    public async Task<StaffAdvance> RecoverAdvanceAsync(long id, decimal amount, string actor)
    {
        if (!(amount > 0)) throw new GdsException("VALIDATION", "Recovery amount must be positive");
        var a = await db.StaffAdvances.FirstOrDefaultAsync(x => x.Id == id) ?? throw NotFound("Advance");
        a.AmountRecovered = Math.Min(a.Amount, a.AmountRecovered + amount);
        if (a.AmountRecovered >= a.Amount) a.Status = "recovered";
        Audit(actor, "ADVANCE_RECOVER", "advance", id, new { amount, a.AmountRecovered });
        await db.SaveChangesAsync();
        return a;
    }

    public async Task DeleteAdvanceAsync(long id, string actor)
    {
        var a = await db.StaffAdvances.FirstOrDefaultAsync(x => x.Id == id) ?? throw NotFound("Advance");
        db.StaffAdvances.Remove(a);
        Audit(actor, "ADVANCE_DELETE", "advance", id, new { a.StaffId, a.Amount, a.AmountRecovered });
        await db.SaveChangesAsync();
    }

    // ---------- reimbursements ----------
    public async Task<object> ReimbursementsAsync()
    {
        var staff = await db.Staff.AsNoTracking().ToDictionaryAsync(s => s.Id);
        var list = await db.StaffReimbursements.AsNoTracking().OrderByDescending(a => a.Id).ToListAsync();
        return new
        {
            reimbursements = list.Select(x => new { id = x.Id, staff_id = x.StaffId, category = x.Category, amount = x.Amount, date = x.Date, description = x.Description, receipt = x.Receipt, status = x.Status, by = x.By, staff_name = staff.GetValueOrDefault(x.StaffId)?.Name }),
            summary = new { total_pending = list.Where(x => x.Status == "pending").Sum(x => x.Amount), pending_count = list.Count(x => x.Status == "pending") },
        };
    }

    public async Task<StaffReimbursement> CreateReimbursementAsync(ReimbursementInput i, string actor)
    {
        if (!(i.Amount > 0) || !await db.Staff.AnyAsync(s => s.Id == i.StaffId)) throw new GdsException("VALIDATION", "Staff and amount required");
        var r = new StaffReimbursement { TenantId = T, StaffId = i.StaffId, Amount = i.Amount, Category = i.Category ?? "Other", Date = i.Date ?? Today, Description = i.Description ?? "", Receipt = i.Receipt, Status = "pending" };
        db.StaffReimbursements.Add(r);
        await db.SaveChangesAsync();
        Audit(actor, "REIMBURSEMENT_CREATE", "reimbursement", r.Id, i);
        await db.SaveChangesAsync();
        return r;
    }

    public async Task<StaffReimbursement> ReimbursementActionAsync(long id, string action, string actor)
    {
        var st = action switch { "approve" => "approved", "reject" => "rejected", "pay" => "paid", _ => throw new GdsException("VALIDATION", "Unknown action") };
        var r = await db.StaffReimbursements.FirstOrDefaultAsync(x => x.Id == id) ?? throw NotFound("Reimbursement");
        r.Status = st; r.By = actor;
        Audit(actor, "REIMBURSEMENT_" + action.ToUpperInvariant(), "reimbursement", id, new { r.Amount, status = st });
        await db.SaveChangesAsync();
        return r;
    }

    public async Task DeleteReimbursementAsync(long id, string actor)
    {
        var r = await db.StaffReimbursements.FirstOrDefaultAsync(x => x.Id == id) ?? throw NotFound("Reimbursement");
        db.StaffReimbursements.Remove(r);
        Audit(actor, "REIMBURSEMENT_DELETE", "reimbursement", id, new { r.StaffId, r.Amount, r.Status });
        await db.SaveChangesAsync();
    }
}

public static class PayrollEndpoints
{
    private static string Actor(HttpContext h) => h.User.Identity!.Name!;

    public static void MapPayroll(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin/payroll").RequireAuthorization(Policies.Operations).WithTags("Payroll");

        g.MapGet("/attendance", async (DateOnly? from, DateOnly? to, long? staffId, PayrollService s) => Results.Ok(await s.AttendanceAsync(from, to, staffId)));
        g.MapPost("/attendance/generate", async (AttendanceRangeInput i, PayrollService s, HttpContext h) => Results.Ok(new { generated = await s.GenerateAttendanceAsync(i.From, i.To, Actor(h)) }));
        g.MapPost("/attendance/approve", async (AttendanceApproveInput i, PayrollService s, HttpContext h) => Results.Ok(new { approved = await s.ApproveAttendanceAsync(i, Actor(h)) }));
        g.MapPost("/attendance", async (AttendanceCreateInput i, PayrollService s, HttpContext h) => Results.Ok(await s.CreateAttendanceAsync(i, Actor(h))));
        g.MapPut("/attendance/{id:long}", async (long id, AttendanceUpdateInput i, PayrollService s, HttpContext h) => Results.Ok(await s.UpdateAttendanceAsync(id, i, Actor(h))));

        g.MapGet("/payouts", async (string? status, PayrollService s) => Results.Ok(await s.PayoutsAsync(status)));
        g.MapGet("/payouts/summary", async (PayrollService s) => Results.Ok(await s.PayoutSummaryAsync()));
        g.MapGet("/payouts/preview", async (DateOnly from, DateOnly to, PayrollService s) => Results.Ok(await s.PayoutPreviewAsync(from, to)));
        g.MapPost("/payouts/generate", async (PayoutGenerateInput i, PayrollService s, HttpContext h) => Results.Ok(await s.GeneratePayoutsAsync(i, Actor(h))));
        g.MapPost("/payouts/{id:long}/approve", async (long id, PayrollService s, HttpContext h) => Results.Ok(await s.ApprovePayoutAsync(id, Actor(h))));
        g.MapPost("/payouts/{id:long}/pay", async (long id, PayoutPayInput i, PayrollService s, HttpContext h) => Results.Ok(await s.PayPayoutAsync(id, i, Actor(h))));
        g.MapPut("/payouts/{id:long}", async (long id, PayoutAdjustInput i, PayrollService s, HttpContext h) => Results.Ok(await s.AdjustPayoutAsync(id, i, Actor(h))));
        g.MapDelete("/payouts/{id:long}", async (long id, PayrollService s, HttpContext h) => { await s.DeletePayoutAsync(id, Actor(h)); return Results.Ok(new { success = true }); });
        g.MapGet("/staff/{id:long}/ledger", async (long id, PayrollService s) => Results.Ok(await s.LedgerAsync(id)));

        g.MapGet("/advances", async (PayrollService s) => Results.Ok(await s.AdvancesAsync()));
        g.MapPost("/advances", async (AdvanceInput i, PayrollService s, HttpContext h) => Results.Ok(await s.CreateAdvanceAsync(i, Actor(h))));
        g.MapPost("/advances/{id:long}/recover", async (long id, AmountInput i, PayrollService s, HttpContext h) => Results.Ok(await s.RecoverAdvanceAsync(id, i.Amount, Actor(h))));
        g.MapDelete("/advances/{id:long}", async (long id, PayrollService s, HttpContext h) => { await s.DeleteAdvanceAsync(id, Actor(h)); return Results.Ok(new { success = true }); });

        g.MapGet("/reimbursements", async (PayrollService s) => Results.Ok(await s.ReimbursementsAsync()));
        g.MapPost("/reimbursements", async (ReimbursementInput i, PayrollService s, HttpContext h) => Results.Ok(await s.CreateReimbursementAsync(i, Actor(h))));
        g.MapPost("/reimbursements/{id:long}/{action:regex(^(approve|reject|pay)$)}", async (long id, string action, PayrollService s, HttpContext h) => Results.Ok(await s.ReimbursementActionAsync(id, action, Actor(h))));
        g.MapDelete("/reimbursements/{id:long}", async (long id, PayrollService s, HttpContext h) => { await s.DeleteReimbursementAsync(id, Actor(h)); return Results.Ok(new { success = true }); });
    }
}
