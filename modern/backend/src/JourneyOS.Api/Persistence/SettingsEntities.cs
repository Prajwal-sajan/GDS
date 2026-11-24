namespace JourneyOS.Api.Persistence;

// ---------- Settings: tenant-scoped configuration documents ----------

/// <summary>
/// One JSON configuration document per tenant and key — the PostgreSQL home of the legacy <c>db.meta(key)</c> values and
/// small settings collections (roles, IAM groups / access rules, configuration sections, loyalty, branding, WhatsApp, …).
/// Writes go through the typed settings endpoints, which validate exactly like legacy before replacing the document.
/// </summary>
public sealed class TenantDocument : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Key { get; set; } = "";
    public string Json { get; set; } = "null";   // jsonb
    public DateTime UpdatedAt { get; set; }
}
