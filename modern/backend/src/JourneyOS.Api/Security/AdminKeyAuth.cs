using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
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

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var key = Request.Headers["X-Admin-Key"].ToString();
        // Browsers cannot set custom headers on WebSocket upgrades; SignalR sends the key as a bearer header
        // (negotiate) or access_token query (socket). Accepted for /hubs only.
        if (string.IsNullOrEmpty(key) && Request.Path.StartsWithSegments("/hubs"))
        {
            var auth = Request.Headers.Authorization.ToString();
            key = auth.StartsWith("Bearer ", StringComparison.Ordinal) ? auth[7..] : Request.Query["access_token"].ToString();
        }
        if (string.IsNullOrEmpty(key)) return Task.FromResult(AuthenticateResult.NoResult());
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(key)));
        var entries = cfg.GetSection("Admin:Keys").Get<AdminKeyEntry[]>() ?? [];
        var match = entries.FirstOrDefault(x => System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(x.KeySha256.ToUpperInvariant()), System.Text.Encoding.UTF8.GetBytes(hash)));
        if (match is null) return Task.FromResult(AuthenticateResult.Fail("Invalid key"));
        var id = new ClaimsIdentity([
            new Claim(ClaimTypes.Name, match.Name),
            new Claim("tenant", match.TenantCode),
            new Claim(ClaimTypes.Role, match.Role),
        ], Scheme);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(id), Scheme)));
    }
}

public static class Policies
{
    public const string IntegrationRead = "integration.read";
    public const string IntegrationWrite = "integration.write";
    public const string Operations = "operations";
    public const string Accounts = "accounts";
}
