namespace JourneyOS.Api.Persistence;

// ---------- Fleet & staff ----------
public sealed class Vehicle : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string RegistrationNumber { get; set; } = "";
    public long? CoachTemplateId { get; set; }
    public string Status { get; set; } = "active";       // active / maintenance / retired
    public string? ModelName { get; set; }
    public int? ManufactureYear { get; set; }
    public string? OwnershipType { get; set; }
    public string? PhoneNumber { get; set; }
    public bool GpsEnabled { get; set; }
    public DateOnly? InsuranceExpiry { get; set; }
    public DateOnly? PermitExpiry { get; set; }
    public DateOnly? FitnessExpiry { get; set; }
    public DateOnly? PucExpiry { get; set; }
    public string? VehicleRole { get; set; }                // main / pickup_van / spare
    public int? OdometerReading { get; set; }
    /// <summary>Last reported telemetry as received (legacy <c>position</c> / <c>health</c> objects), jsonb. Null = never reported.</summary>
    public string? PositionJson { get; set; }
    public string? HealthJson { get; set; }
    /// <summary>Legacy vehicle-details-v19 fields: vehicle_number, chassis/engine numbers, GPS/DMS device+provider, dms_enabled,
    /// purchased_date, notes, tags. jsonb, null = never entered.</summary>
    public string? DetailsJson { get; set; }
}

/// <summary>Legacy vehicle_maintenance (vehicle-details-v19): service bills, job cards and next-due reminders.</summary>
public sealed class VehicleMaintenance : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long VehicleId { get; set; }
    public string Type { get; set; } = "service";     // service / repair / inspection / reminder
    public string Label { get; set; } = "";
    public DateOnly? ServiceDate { get; set; }
    public decimal? OdometerKm { get; set; }
    public DateOnly? NextDueDate { get; set; }
    public decimal? NextDueKm { get; set; }
    public decimal Cost { get; set; }
    public string Notes { get; set; } = "";
    public string? FileName { get; set; }
    public string? FileType { get; set; }
    public byte[]? FileData { get; set; }
    public string? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public DateTime? ArchivedAt { get; set; }
}

public sealed class Staff : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Role { get; set; } = "driver";         // driver / helper / conductor / ...
    public string Status { get; set; } = "active";
    public string? Designation { get; set; }
    public string? LicenseNumber { get; set; }
    public DateOnly? LicenseExpiry { get; set; }
    public string? SalaryType { get; set; }
    public decimal? SalaryAmount { get; set; }
    public decimal? BataPerTrip { get; set; }
    public string? Email { get; set; }
    public string? BloodGroup { get; set; }
    public DateOnly? JoiningDate { get; set; }
}

// ---------- Staff payroll (legacy attendance / advances / reimbursements / payouts) ----------
public sealed class StaffAttendance : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long StaffId { get; set; }
    public DateOnly Date { get; set; }
    public string Status { get; set; } = "present";     // present / absent / leave
    public long? TripId { get; set; }
    public string Source { get; set; } = "manual";      // auto / manual / manual_edited
    public string State { get; set; } = "draft";        // draft / approved
    public decimal Amount { get; set; }
}

public sealed class StaffAdvance : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long StaffId { get; set; }
    public string AdvanceType { get; set; } = "salary";
    public decimal Amount { get; set; }
    public DateOnly DateIssued { get; set; }
    public string? Reason { get; set; }
    public string PaymentMode { get; set; } = "cash";
    public string RecoveryMethod { get; set; } = "one_time";
    public int? NumInstallments { get; set; }
    public decimal? InterestRate { get; set; }
    public decimal AmountRecovered { get; set; }
    public string Status { get; set; } = "disbursed";   // disbursed / recovered
}

public sealed class StaffReimbursement : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long StaffId { get; set; }
    public string Category { get; set; } = "Other";
    public decimal Amount { get; set; }
    public DateOnly Date { get; set; }
    public string Description { get; set; } = "";
    public string? Receipt { get; set; }
    public string Status { get; set; } = "pending";     // pending / approved / rejected / in_payout / paid
    public string? By { get; set; }
}

public sealed class StaffPayout : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string PayoutNo { get; set; } = "";
    public long StaffId { get; set; }
    public DateOnly PeriodStart { get; set; }
    public DateOnly PeriodEnd { get; set; }
    public int Days { get; set; }
    public decimal Gross { get; set; }
    public decimal Deductions { get; set; }
    public decimal AdvancesRecovered { get; set; }
    public decimal? Reimbursements { get; set; }        // null on legacy payouts created before reimbursements existed
    public decimal Net { get; set; }
    public string Status { get; set; } = "draft";       // draft / approved / paid
    public string? ApprovedBy { get; set; }
    public DateOnly? PaidAt { get; set; }
    public string? PaymentMode { get; set; }
    public string? Reference { get; set; }
}

/// <summary>Vehicle and crew assigned to a trip. One active row per (trip, role slot).</summary>
public sealed class TripAssignment : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long TripId { get; set; }
    public string Kind { get; set; } = "staff";          // vehicle / staff
    public long? VehicleId { get; set; }
    public long? StaffId { get; set; }
    public string Role { get; set; } = "";               // Driver / Helper / vehicle
    public bool IsActive { get; set; } = true;
    public DateTime AssignedAt { get; set; }
    public DateTime? ReplacedAt { get; set; }
    public string? ReplacedReason { get; set; }
}

// ---------- Money ----------
/// <summary>Collected (or receivable) money for a booking. Separate from refunds and settlements.</summary>
public sealed class Payment : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long BookingId { get; set; }
    public decimal Amount { get; set; }
    public string Method { get; set; } = "";             // cash / card / upi / ota_receivable / agent_credit
    public string Status { get; set; } = "PAID";         // PAID / PENDING / RECEIVABLE / FAILED
    public string? Reference { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>OTA financial evidence captured at booking time; null fields mean "no evidence" (never guessed).</summary>
public sealed class BookingFinance
{
    public long Id { get; set; }
    public long BookingId { get; set; }
    public decimal? NetFare { get; set; }
    public decimal? Gst { get; set; }
    public decimal? OtaCommission { get; set; }
    public decimal? OtaCommissionGst { get; set; }
    public decimal? OperatorOffer { get; set; }
    public decimal? OtaTakeHome { get; set; }
}

// ---------- OTA invoice reconciliation ----------
public sealed class OtaInvoice : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Provider { get; set; } = "REDBUS";
    public string InvoiceNumber { get; set; } = "";
    public string? OperatorCode { get; set; }
    public string FileName { get; set; } = "";
    public string Sha256 { get; set; } = "";
    public DateOnly PeriodStart { get; set; }
    public DateOnly PeriodEnd { get; set; }
    public decimal? StatedAmount { get; set; }
    public decimal Tolerance { get; set; } = 1m;
    public string Status { get; set; } = "parsed";       // parsed / review_required
    public string? WarningsJson { get; set; }
    /// <summary>Payment-advice summary categories a–w + invoice_amount (legacy parsed.summary), JSON.</summary>
    public string? SummaryJson { get; set; }
    public decimal? ComputedAmount { get; set; }
    public string? OperatorGstin { get; set; }
    /// <summary>Original uploaded document, kept byte-for-byte for "View source PDF".</summary>
    public byte[]? SourcePdf { get; set; }
    public string UploadedBy { get; set; } = "";
    public DateTime UploadedAt { get; set; }
    public List<OtaInvoiceLine> Lines { get; set; } = [];
}

public sealed class OtaInvoiceLine
{
    public long Id { get; set; }
    public long InvoiceId { get; set; }
    public string LineKey { get; set; } = "";            // section:pnr:n  or  missing:{bookingId}
    public string Pnr { get; set; } = "";
    public string Section { get; set; } = "sold";        // sold / pax_cancelled / bus_cancelled / exceptional_refund / missing_in_ota
    public DateOnly? Doj { get; set; }
    public decimal? Fare { get; set; }
    public decimal? Tax { get; set; }
    public decimal? Commission { get; set; }
    public decimal? CommissionTax { get; set; }
    public decimal? OperatorOffer { get; set; }
    public decimal? CancellationCharge { get; set; }
    public decimal? TakeHome { get; set; }
    // comparison result
    public long? BookingId { get; set; }
    public string? BookingStatus { get; set; }
    public DateOnly? ExpectedDoj { get; set; }
    public decimal? ExpectedFare { get; set; }
    public decimal? ExpectedTax { get; set; }
    public decimal? ExpectedTakeHome { get; set; }
    public decimal? Delta { get; set; }
    public string Status { get; set; } = "needs_review"; // matched / mismatched / needs_review / unmatched_ota / unmatched_gds
    public string[] Differences { get; set; } = [];
    public string Why { get; set; } = "";
    public string? ResolutionAction { get; set; }        // accept_ota / dispute / investigating
    public string? ResolutionNote { get; set; }
    public string? ResolvedBy { get; set; }
    public DateTime? ResolvedAt { get; set; }
}
