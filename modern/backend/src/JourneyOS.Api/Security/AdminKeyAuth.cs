using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace JourneyOS.Api.Security;

public sealed class AdminKeyEntry
{
    public string Name { get; set; } = "";
    public string KeySha256 { get; set; } = "";   // hex SHA-256 of the key; raw keys are never stored
    public string TenantCode { get; set; } = "";
    public string Role { get; set; } = "viewer";   // owner / admin / accounts / ops / viewer
}

/// <summary>
/// Interim service-key authentication for the modernised admin API. It will be replaced by the
/// migrated JourneyOS IAM (OTP login + role permissions) — see parity matrix "Auth".
/// </summary>
public sealed class AdminKeyHandler(IOptionsMonitor<AuthenticationSchemeOptions> o, ILoggerFactory l, UrlEncoder e, IConfiguration cfg)
    : AuthenticationHandler<AuthenticationSchemeOptions>(o, l, e)
{
    public new const string Scheme = "AdminKey";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var key = Request.Headers["X-Admin-Key"].ToString();
        var auth = Request.Headers.Authorization.ToString();
        var bearer = auth.StartsWith("Bearer ", StringComparison.Ordinal) ? auth[7..] : null;
        // Browsers cannot set custom headers on WebSocket upgrades: SignalR sends the credential as access_token.
        if (bearer is null && Request.Path.StartsWithSegments("/hubs") && Request.Query["access_token"].ToString() is { Length: > 0 } qt) bearer = qt;

        // User session (IAM login).
        if (string.IsNullOrEmpty(key) && bearer is not null && bearer.StartsWith(IamService.TokenPrefix, StringComparison.Ordinal))
        {
            var db = Context.RequestServices.GetRequiredService<Persistence.GdsDbContext>();
            var hash = IamService.Sha(bearer);
            var now = DateTime.UtcNow;
            var s = await (from x in db.UserSessions.IgnoreQueryFilters()
                           join u in db.Users.IgnoreQueryFilters() on x.UserId equals u.Id
                           join t in db.Tenants on u.TenantId equals t.Id
                           where x.TokenSha256 == hash && x.RevokedAt == null && x.ExpiresAt > now && u.Status == "ACTIVE"
                           select new { u.Id, u.Name, u.Phone, u.Role, t.Code }).FirstOrDefaultAsync();
            if (s is null) return AuthenticateResult.Fail("Invalid or expired session");
            return Success(s.Name, s.Code, s.Role, [new Claim("uid", s.Id.ToString()), new Claim("phone", s.Phone), new Claim("auth", "session")]);
        }

        // Service key (interim; kept for automation and break-glass). /hubs may pass it as bearer.
        if (string.IsNullOrEmpty(key) && Request.Path.StartsWithSegments("/hubs")) key = bearer ?? "";
        if (string.IsNullOrEmpty(key)) return AuthenticateResult.NoResult();
        var khash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(key)));
        var entries = cfg.GetSection("Admin:Keys").Get<AdminKeyEntry[]>() ?? [];
        var match = entries.FirstOrDefault(x => System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(x.KeySha256.ToUpperInvariant()), System.Text.Encoding.UTF8.GetBytes(khash)));
        if (match is null) return AuthenticateResult.Fail("Invalid key");
        return Success(match.Name, match.TenantCode, match.Role, [new Claim("auth", "key")]);
    }

    private static AuthenticateResult Success(string name, string tenant, string role, Claim[] extra)
    {
        var id = new ClaimsIdentity([new Claim(ClaimTypes.Name, name), new Claim("tenant", tenant), new Claim(ClaimTypes.Role, role), .. extra], Scheme);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(id), Scheme));
    }
}

public static class Policies
{
    public const string IntegrationRead = "integration.read";
    public const string IntegrationWrite = "integration.write";
    public const string Operations = "operations";
    public const string Accounts = "accounts";
    public const string Crm = "crm";
    public const string Reports = "reports";
    public const string Iam = "iam";
    public const string Self = "self";
}
