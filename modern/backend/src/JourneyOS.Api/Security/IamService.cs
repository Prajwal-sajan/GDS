using System.Security.Cryptography;
using System.Text;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Security;

public sealed record LoginInput(string Tenant, string Phone, string Password);
public sealed record UserInput(string Phone, string Name, string? Email, string Role, string? Status, decimal? CommissionPct, decimal? CreditLimit);
public sealed record PasswordInput(string Password);
public sealed record ActivateInput(string Tenant, string Phone, string Code, string Password);

/// <summary>
/// Operator user accounts and sessions. Passwords are PBKDF2-SHA256 (210k iterations); session tokens are random
/// 256-bit values stored only as SHA-256. Legacy SMS-OTP login is replaced by one-time invite codes (no SMS provider):
/// an admin issues a code, hands it over out-of-band, and the user chooses their own password. Admins never need to know it.
/// </summary>
public sealed class IamService(GdsDbContext db, TimeProvider clock, IConfiguration cfg)
{
    public static readonly string[] Roles = ["owner", "admin", "accounts", "ops", "viewer", "agent"];
    public const string TokenPrefix = "jos_";
    private const int Iterations = 210_000;
    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    public static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
        return $"pbkdf2-sha256${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool VerifyPassword(string password, string? stored)
    {
        var p = stored?.Split('$');
        if (p is not { Length: 4 } || p[0] != "pbkdf2-sha256" || !int.TryParse(p[1], out var it)) return false;
        var expected = Convert.FromBase64String(p[3]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(p[2]), it, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    public static string Sha(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s)));

    public static void ValidatePassword(string? p)
    {
        if (p is null || p.Length < 10) throw new GdsException("WEAK_PASSWORD", "Password must be at least 10 characters");
        if (p.Length > 200) throw new GdsException("WEAK_PASSWORD", "Password too long");
    }

    /// <summary>Same response for unknown user, wrong password, no password and inactive user (no account enumeration).</summary>
    public async Task<(string Token, AppUser User, DateTime ExpiresAt)> LoginAsync(LoginInput i)
    {
        var fail = new GdsException("INVALID_CREDENTIALS", "Invalid phone or password", 401);
        var tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Code == i.Tenant) ?? throw fail;
        var user = await db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.TenantId == tenant.Id && u.Phone == i.Phone);
        if (user is null) { VerifyPassword(i.Password ?? "", HashPassword("timing-equaliser")); throw fail; }
        if (user.LockedUntil is { } lu && lu > Now) throw new GdsException("ACCOUNT_LOCKED", "Too many failed attempts; try again later", 423);
        if (user.Status != "ACTIVE" || !VerifyPassword(i.Password ?? "", user.PasswordHash))
        {
            user.FailedLogins++;
            if (user.FailedLogins >= 5) { user.LockedUntil = Now.AddMinutes(15); user.FailedLogins = 0; }
            await db.SaveChangesAsync();
            throw fail;
        }
        user.FailedLogins = 0; user.LockedUntil = null; user.LastLoginAt = Now;
        var token = TokenPrefix + Base64Url(RandomNumberGenerator.GetBytes(32));
        var exp = Now.AddHours(cfg.GetValue("Auth:SessionHours", 12));
        db.UserSessions.Add(new UserSession { TenantId = tenant.Id, UserId = user.Id, TokenSha256 = Sha(token), CreatedAt = Now, ExpiresAt = exp });
        db.AuditLogs.Add(new AuditLog { TenantId = tenant.Id, Actor = user.Name, Action = "LOGIN", Entity = "user", EntityId = user.Id.ToString(), At = Now });
        await db.SaveChangesAsync();
        return (token, user, exp);
    }

    public async Task LogoutAsync(string token)
    {
        var s = await db.UserSessions.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.TokenSha256 == Sha(token));
        if (s is null || s.RevokedAt is not null) return;
        s.RevokedAt = Now;
        await db.SaveChangesAsync();
    }

    private static string Base64Url(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    // ---------------- user administration ----------------
    public async Task<AppUser> SaveUserAsync(long? id, UserInput i, string actor, string actorRole)
    {
        if (i.Phone is null || i.Phone.Length != 10 || !i.Phone.All(char.IsDigit)) throw new GdsException("VALIDATION", "Phone must be 10 digits");
        if (string.IsNullOrWhiteSpace(i.Name)) throw new GdsException("VALIDATION", "Name is required");
        if (!Roles.Contains(i.Role)) throw new GdsException("VALIDATION", "Unknown role");
        if (i.Status is not (null or "ACTIVE" or "INACTIVE")) throw new GdsException("VALIDATION", "Invalid status");
        if (i.CommissionPct is < 0 or > 100 || i.CreditLimit is < 0) throw new GdsException("VALIDATION", "Invalid commission or credit limit");
        // Only an owner may create or modify owners (prevents admin → owner escalation).
        if (actorRole != "owner" && i.Role == "owner") throw new GdsException("FORBIDDEN", "Only an owner can grant the owner role", 403);
        if (await db.Users.AnyAsync(u => u.Phone == i.Phone && u.Id != id)) throw new GdsException("DUPLICATE", "Phone already belongs to a user", 409);
        AppUser u;
        if (id is null) { u = new AppUser { TenantId = db.CurrentTenantId, CreatedAt = Now }; db.Users.Add(u); }
        else
        {
            u = await db.Users.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "User not found", 404);
            if (actorRole != "owner" && u.Role == "owner") throw new GdsException("FORBIDDEN", "Only an owner can modify an owner", 403);
            var demoted = u.Role == "owner" && (i.Role != "owner" || i.Status == "INACTIVE");
            if (demoted && !await db.Users.AnyAsync(x => x.Id != u.Id && x.Role == "owner" && x.Status == "ACTIVE"))
                throw new GdsException("LAST_OWNER", "At least one active owner is required", 409);
        }
        var deactivated = u.Status == "ACTIVE" && i.Status == "INACTIVE";
        var roleChanged = id is not null && u.Role != i.Role;
        u.Phone = i.Phone; u.Name = i.Name.Trim(); u.Email = i.Email; u.Role = i.Role; u.Status = i.Status ?? u.Status;
        u.CommissionPct = i.CommissionPct; u.CreditLimit = i.CreditLimit;
        if (deactivated || roleChanged) await RevokeSessionsAsync(u.Id);
        db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = actor, Action = id is null ? "USER_CREATE" : "USER_UPDATE", Entity = "user", EntityId = u.Id.ToString(),
            DataJson = System.Text.Json.JsonSerializer.Serialize(new { i.Phone, i.Role, i.Status }), At = Now });
        await db.SaveChangesAsync();
        return u;
    }

    public async Task SetPasswordAsync(long id, string password, string actor, string actorRole)
    {
        ValidatePassword(password);
        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "User not found", 404);
        if (actorRole != "owner" && u.Role == "owner") throw new GdsException("FORBIDDEN", "Only an owner can reset an owner's password", 403);
        u.PasswordHash = HashPassword(password); u.FailedLogins = 0; u.LockedUntil = null;
        await RevokeSessionsAsync(u.Id);
        db.AuditLogs.Add(new AuditLog { TenantId = db.CurrentTenantId, Actor = actor, Action = "PASSWORD_SET", Entity = "user", EntityId = u.Id.ToString(), At = Now });
        await db.SaveChangesAsync();
    }

    private async Task RevokeSessionsAsync(long userId)
    {
        foreach (var s in await db.UserSessions.Where(s => s.UserId == userId && s.RevokedAt == null).ToListAsync()) s.RevokedAt = Now;
    }

    // ---------------- invitations (replaces legacy SMS OTP onboarding) ----------------
    private const string CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
    public const int InviteHours = 72;

    /// <summary>12 chars from a 31-symbol alphabet ≈ 59 bits; shown once, stored only as SHA-256.</summary>
    public static string NewInviteCode()
    {
        var chars = new char[12];
        for (var i = 0; i < chars.Length; i++) chars[i] = CodeAlphabet[RandomNumberGenerator.GetInt32(CodeAlphabet.Length)];
        return $"{new string(chars, 0, 4)}-{new string(chars, 4, 4)}-{new string(chars, 8, 4)}";
    }

    private static string NormalizeCode(string? c) => new((c ?? "").ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    /// <summary>
    /// Issues a one-time activation code. The admin hands it to the user out-of-band (in person / phone); the user then
    /// chooses their own password. Re-issuing invalidates the previous code. Existing passwords keep working until activation.
    /// </summary>
    public async Task<(string Code, DateTime ExpiresAt)> InviteAsync(long id, string actor, string actorRole)
    {
        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == id) ?? throw new GdsException("NOT_FOUND", "User not found", 404);
        if (actorRole != "owner" && u.Role == "owner") throw new GdsException("FORBIDDEN", "Only an owner can invite an owner", 403);
        if (u.Status != "ACTIVE") throw new GdsException("USER_INACTIVE", "Activate the user before inviting", 409);
        var code = NewInviteCode();
        u.InviteCodeSha256 = Sha(NormalizeCode(code));
        u.InviteExpiresAt = Now.AddHours(InviteHours);
        u.FailedLogins = 0; u.LockedUntil = null;
        db.AuditLogs.Add(new AuditLog { TenantId = u.TenantId, Actor = actor, Action = "INVITE_ISSUED", Entity = "user", EntityId = u.Id.ToString(), At = Now });
        await db.SaveChangesAsync();
        return (code, u.InviteExpiresAt.Value);
    }

    /// <summary>Redeems an invite: sets the user's own password and signs them in. Wrong codes count toward lockout.</summary>
    public async Task<(string Token, AppUser User, DateTime ExpiresAt)> ActivateAsync(ActivateInput i)
    {
        var fail = new GdsException("INVALID_INVITE", "Invalid or expired invite code", 401);
        ValidatePassword(i.Password);
        var tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Code == i.Tenant) ?? throw fail;
        var u = await db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.TenantId == tenant.Id && x.Phone == i.Phone) ?? throw fail;
        if (u.LockedUntil is { } lu && lu > Now) throw new GdsException("ACCOUNT_LOCKED", "Too many failed attempts; try again later", 423);
        var ok = u.Status == "ACTIVE" && u.InviteCodeSha256 is not null && u.InviteExpiresAt > Now &&
                 CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(u.InviteCodeSha256), Encoding.ASCII.GetBytes(Sha(NormalizeCode(i.Code))));
        if (!ok)
        {
            u.FailedLogins++;
            if (u.FailedLogins >= 5) { u.LockedUntil = Now.AddMinutes(15); u.FailedLogins = 0; }
            await db.SaveChangesAsync();
            throw fail;
        }
        u.PasswordHash = HashPassword(i.Password);
        u.InviteCodeSha256 = null; u.InviteExpiresAt = null; u.FailedLogins = 0;
        foreach (var s in await db.UserSessions.IgnoreQueryFilters().Where(s => s.UserId == u.Id && s.RevokedAt == null).ToListAsync()) s.RevokedAt = Now;
        db.AuditLogs.Add(new AuditLog { TenantId = tenant.Id, Actor = u.Name, Action = "INVITE_REDEEMED", Entity = "user", EntityId = u.Id.ToString(), At = Now });
        await db.SaveChangesAsync();
        return await LoginAsync(new LoginInput(i.Tenant, i.Phone, i.Password));
    }
}
