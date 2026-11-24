namespace JourneyOS.Api.Persistence;

// ---------- Accounts: loyalty coupons, operator statements, OTA settlement terms ----------

/// <summary>Operator-scoped discount code (legacy <c>coupons</c>). Codes are unique per tenant and never deleted (deactivate instead).</summary>
public sealed class Coupon : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Description { get; set; } = "";
    public string DiscountType { get; set; } = "flat";      // flat / percent (legacy also "percentage")
    public decimal DiscountValue { get; set; }
    public decimal? MinFare { get; set; }
    public decimal? MaxDiscountAmount { get; set; }
    public int? TotalLimit { get; set; }
    public int? PerUserLimit { get; set; }
    public DateOnly? ValidFrom { get; set; }
    public DateOnly? ValidUntil { get; set; }
    public string Audience { get; set; } = "all";            // all / new / repeat
    public string[] Channels { get; set; } = [];             // empty = all channels
    public bool Stackable { get; set; }
    public bool Private { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
}

/// <summary>Redemption of a coupon on a booking (legacy <c>coupon_redemptions</c>).</summary>
public sealed class CouponRedemption : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Code { get; set; } = "";
    public string? Pnr { get; set; }
    public string? Phone { get; set; }
    public decimal Amount { get; set; }
    public DateTime At { get; set; }
}

/// <summary>Platform-issued statement / tax invoice addressed to the operator (legacy <c>invoices</c>). Read-only for the operator.</summary>
public sealed class OperatorDocument : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Kind { get; set; } = "invoice";            // invoice / operator / metro / calls / ...
    public string Label { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Month { get; set; }                       // yyyy-MM
    public DateOnly Date { get; set; }
    public decimal? Amount { get; set; }
    public string? Status { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>Payment reference recorded against operator statements (legacy <c>invoice_payments</c>).</summary>
public sealed class OperatorPayment : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public decimal Amount { get; set; }
    public string Reference { get; set; } = "";
    public string By { get; set; } = "";
    public DateTime At { get; set; }
}

/// <summary>OTA financial terms used to verify settlement invoices (legacy <c>_meta.reconciliation_config</c>).</summary>
public sealed class OtaSettlementConfig : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string OtaSlug { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public decimal CommissionPercent { get; set; }
    public string CommissionBase { get; set; } = "fare_only"; // fare_only / fare_plus_gst
    public decimal TdsPercent { get; set; }
    public decimal GstOnCommissionPercent { get; set; } = 18;
    public decimal TaxOnFarePercent { get; set; }
    public string SettlementMode { get; set; } = "DOJ";       // DOJ / DOB
    public int SettlementCycleDays { get; set; } = 7;
    public string? TdsSection { get; set; }
    public decimal? MatchTolerance { get; set; }
    public bool TaxReceivableFromOta { get; set; }
    public bool CommissionKeptOnPassengerCancel { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}
