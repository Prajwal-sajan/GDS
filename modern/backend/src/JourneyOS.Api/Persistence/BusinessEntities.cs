namespace JourneyOS.Api.Persistence;

// ---------- CRM ----------
/// <summary>Loyalty profile keyed by phone. Booking history is derived from bookings, never duplicated here.</summary>
public sealed class Customer : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Phone { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Email { get; set; }
    public string Tier { get; set; } = "Bronze";
    public int Miles { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class CrmNote : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Phone { get; set; } = "";
    public string Text { get; set; } = "";
    public string By { get; set; } = "";
    public DateTime At { get; set; }
}

/// <summary>Passenger conversation message. No messaging provider is connected: outbound messages are recorded, not delivered.</summary>
public sealed class ChatMessage : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string ConversationId { get; set; } = "";
    public string Direction { get; set; } = "in";          // in / out
    public string Channel { get; set; } = "whatsapp";
    public string Text { get; set; } = "";
    public string Phone { get; set; } = "";
    public DateTime Ts { get; set; }
    public bool Read { get; set; }
    public string? By { get; set; }
    public string DeliveryStatus { get; set; } = "recorded"; // recorded (no provider) / received
}

public sealed class ChatBlock : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Phone { get; set; } = "";
    public string Reason { get; set; } = "spam";
    public string By { get; set; } = "";
    public DateTime At { get; set; }
}

/// <summary>Operator-logged call record. No telephony provider: status is what the operator reports.</summary>
public sealed class CallLog : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Direction { get; set; } = "outgoing";
    public string Kind { get; set; } = "manual";
    public string Phone { get; set; } = "";
    public string? PassengerName { get; set; }
    public string? Pnr { get; set; }
    public long? TripId { get; set; }
    public string Status { get; set; } = "logged";        // answered / missed / busy / not_reachable / logged
    public int DurationS { get; set; }
    public string? Notes { get; set; }
    public string Agent { get; set; } = "";
    public DateTime Ts { get; set; }
}

public sealed class OtaRating : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Ota { get; set; } = "";
    public string? Pnr { get; set; }
    public string? PassengerName { get; set; }
    public string? Phone { get; set; }
    public long? TripId { get; set; }
    public DateOnly? TravelAt { get; set; }
    public int Rating { get; set; }
    public DateOnly RatedAt { get; set; }
    public string? Review { get; set; }
    public string? OperatorReply { get; set; }
    public string? RepliedBy { get; set; }
    public DateTime? RepliedAt { get; set; }
    public string? FollowUpStatus { get; set; }
    public string? FollowUpNote { get; set; }
    public string? FollowUpBy { get; set; }
    public DateTime? FollowUpAt { get; set; }
}

// ---------- Accounts ----------
/// <summary>Manual ledger movement against a sales channel (agent:{phone} / branch:{phone} / ota:{name}).</summary>
public sealed class LedgerEntry : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string ChannelKey { get; set; } = "";
    public string ChannelType { get; set; } = "";
    public string Type { get; set; } = "credit";           // credit (money received) / debit
    public decimal Amount { get; set; }
    public string Note { get; set; } = "";
    public DateOnly Date { get; set; }
    public string By { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public bool Voided { get; set; }                        // entries are voided, never deleted (audit)
    public string? VoidedBy { get; set; }
}

public sealed class TripExpense : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long TripId { get; set; }
    public string Category { get; set; } = "";
    public decimal Amount { get; set; }
    public string? Note { get; set; }
    public string By { get; set; } = "";
    public DateTime At { get; set; }
}

public sealed class ComplianceDocument : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string OwnerType { get; set; } = "vehicle";      // vehicle / staff
    public long OwnerId { get; set; }
    public string DocumentType { get; set; } = "";
    public string DocumentName { get; set; } = "";
    public DateOnly? ExpiryDate { get; set; }
    public string? Category { get; set; }
    public string? VerificationStatus { get; set; }
}

// ---------- IAM ----------
public sealed class AppUser : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Phone { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Email { get; set; }
    public string Role { get; set; } = "viewer";            // owner / admin / accounts / ops / viewer / agent
    public string Status { get; set; } = "ACTIVE";          // ACTIVE / INACTIVE
    public string? LegacyRole { get; set; }
    public decimal? CommissionPct { get; set; }             // agents
    public decimal? CreditLimit { get; set; }               // agents
    public string? AgentTermsJson { get; set; }             // agents: settlement / tax terms (legacy agent_terms), jsonb
    public string? PasswordHash { get; set; }               // PBKDF2; null ⇒ cannot sign in until activated via invite
    public string? InviteCodeSha256 { get; set; }           // one-time activation code (hash only), see IamService.InviteAsync
    public DateTime? InviteExpiresAt { get; set; }
    public int FailedLogins { get; set; }
    public DateTime? LockedUntil { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public int LoginCount { get; set; }
    public long? BranchId { get; set; }
    /// <summary>Legacy Team &amp; access profile (language, mode, agent category/type, master agent, route limits,
    /// extra/denied permission codes, corridor tags), jsonb.</summary>
    public string? ProfileJson { get; set; }
    /// <summary>Archived (legacy soft delete): hidden from Team &amp; access, cannot sign in.</summary>
    public DateTime? DeletedAt { get; set; }
}

public sealed class UserSession : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long UserId { get; set; }
    public string TokenSha256 { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? UserAgent { get; set; }
    public DateTime? LastSeenAt { get; set; }
}

public sealed class Branch : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Name { get; set; } = "";
    public long? CityId { get; set; }
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public string? Code { get; set; }
    /// <summary>Legacy branch extras (city label, operations_area, operation_city_ids, operation_route_ids), jsonb.</summary>
    public string? ExtraJson { get; set; }
}

// ---------- Sarathi ----------
public sealed class SarathiConversation : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Owner { get; set; } = "";                 // authenticated principal name
    public string Title { get; set; } = "";
    public string MessagesJson { get; set; } = "[]";        // jsonb
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
