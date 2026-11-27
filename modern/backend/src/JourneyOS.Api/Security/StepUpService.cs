using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace JourneyOS.Api.Security;

/// <summary>
/// Port of legacy server/auth.js requestStepUp / checkStepUp: a single-use 6-digit code bound to (user, purpose), valid 5 minutes.
/// No SMS provider is connected, so the code is returned as <c>dev_hint</c> only in Development (legacy returned OTP_DEV the same
/// way). Outside Development the code is never echoed and cannot be delivered, so destructive actions stay blocked rather than faked.
/// </summary>
public sealed class StepUpService(IHostEnvironment env)
{
    private readonly ConcurrentDictionary<string, (string Code, DateTime Exp)> _codes = new();
    private static string Key(string user, string purpose) => $"{user}:{purpose}";

    public object Request(string user, string purpose)
    {
        var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
        _codes[Key(user, purpose)] = (code, DateTime.UtcNow.AddMinutes(5));
        return env.IsDevelopment() || env.IsEnvironment("Testing")
            ? new { ok = true, dev_hint = code }
            : new { ok = true, dev_hint = (string?)null, notice = "No SMS provider is connected; OTP cannot be delivered." };
    }

    public bool Check(string user, string purpose, string? otp)
    {
        var k = Key(user, purpose);
        if (!_codes.TryGetValue(k, out var rec) || DateTime.UtcNow > rec.Exp || rec.Code != (otp ?? "").Trim()) return false;
        _codes.TryRemove(k, out _); return true;
    }
}
