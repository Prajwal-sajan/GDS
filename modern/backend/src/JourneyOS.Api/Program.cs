using System.Security.Claims;
using System.Threading.RateLimiting;
using JourneyOS.Api.Admin;
using JourneyOS.Api.Caching;
using JourneyOS.Api.Import;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Outbox;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.RedBus;
using JourneyOS.Api.Security;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<TenantContext>();
builder.Services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantContext>());
builder.Services.AddDbContext<GdsDbContext>((sp, o) => o.UseNpgsql(cfg.GetConnectionString("Postgres"))
    .AddInterceptors(sp.GetServices<Microsoft.EntityFrameworkCore.Diagnostics.IInterceptor>())); // test/diagnostic hook

// Redis is optional at runtime: the app starts and serves correct (uncached) data when it is down.
builder.Services.AddSingleton(sp =>
{
    var cs = cfg.GetConnectionString("Redis");
    if (string.IsNullOrWhiteSpace(cs)) return new RedisConnection(null);
    var options = ConfigurationOptions.Parse(cs);
    options.AbortOnConnectFail = false;
    options.ConnectTimeout = 2000;
    options.SyncTimeout = 1000;
    options.AsyncTimeout = 1000;
    return new RedisConnection(ConnectionMultiplexer.Connect(options));
});
builder.Services.AddSingleton<IGdsCache, RedisGdsCache>();

builder.Services.Configure<InventoryOptions>(cfg.GetSection("Inventory"));
builder.Services.Configure<OutboxOptions>(cfg.GetSection("Outbox"));
builder.Services.AddScoped<InventoryService>();
builder.Services.AddScoped<RedBusQueryService>();
builder.Services.AddScoped<OutboxWriter>();
builder.Services.AddScoped<RedBusNotifier>();
builder.Services.AddScoped<LegacyImporter>();
builder.Services.AddScoped<JourneyOS.Api.Operations.OperationsService>();
builder.Services.AddScoped<JourneyOS.Api.Accounts.ReconciliationService>();
builder.Services.AddScoped<JourneyOS.Api.Crm.CrmService>();
builder.Services.AddScoped<JourneyOS.Api.Reports.ReportsService>();
builder.Services.AddScoped<JourneyOS.Api.Sarathi.SarathiService>();
builder.Services.AddScoped<IamService>();
builder.Services.AddSingleton<JourneyOS.Api.Realtime.ITripEvents, JourneyOS.Api.Realtime.SignalRTripEvents>();
var signalR = builder.Services.AddSignalR();
// Multi-node: fan realtime events out through Redis. Off by default (single node); events are refetch hints only,
// so a Redis outage degrades to "no live push" — never to wrong data.
if (cfg.GetValue<bool>("Realtime:RedisBackplane") && cfg.GetConnectionString("Redis") is { Length: > 0 } rcs)
    signalR.AddStackExchangeRedis(rcs, o => { o.Configuration.ChannelPrefix = RedisChannel.Literal("journeyos-rt"); o.Configuration.AbortOnConnectFail = false; });
builder.Services.AddHttpClient<RedBusCallbackClient>(c => c.Timeout = TimeSpan.FromSeconds(cfg.GetValue("Outbox:TimeoutSeconds", 15)));
builder.Services.AddSingleton<OutboxDispatcher>();
builder.Services.AddSingleton<HoldExpirySweeper>();
if (cfg.GetValue("Workers:Enabled", true))
{
    builder.Services.AddHostedService(sp => sp.GetRequiredService<OutboxDispatcher>());
    builder.Services.AddHostedService(sp => sp.GetRequiredService<HoldExpirySweeper>());
}

builder.Services.AddAuthentication(AdminKeyHandler.Scheme)
    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, AdminKeyHandler>(AdminKeyHandler.Scheme, null);
builder.Services.AddAuthorizationBuilder()
    .AddPolicy(Policies.IntegrationRead, p => p.RequireRole("owner", "admin", "accounts", "ops", "viewer"))
    .AddPolicy(Policies.IntegrationWrite, p => p.RequireRole("owner", "admin"))
    .AddPolicy(Policies.Operations, p => p.RequireRole("owner", "admin", "ops"))
    .AddPolicy(Policies.Accounts, p => p.RequireRole("owner", "admin", "accounts"))
    .AddPolicy(Policies.Crm, p => p.RequireRole("owner", "admin", "ops"))
    .AddPolicy(Policies.Reports, p => p.RequireRole("owner", "admin", "accounts", "ops", "viewer"))
    .AddPolicy(Policies.Iam, p => p.RequireRole("owner", "admin"))
    .AddPolicy(Policies.Self, p => p.RequireAuthenticatedUser());

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("redbus", http => RateLimitPartition.GetFixedWindowLimiter(http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = cfg.GetValue("RedBus:RatePerMinute", 600), Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("login", http => RateLimitPartition.GetFixedWindowLimiter(http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = cfg.GetValue("Auth:LoginPerMinute", 20), Window = TimeSpan.FromMinutes(1) }));
});
builder.Services.AddHealthChecks();

var app = builder.Build();

// ---------- CLI: migrations / legacy import ----------
if (args.Length > 0 && args[0] is "migrate" or "import-legacy" or "invite-user")
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<GdsDbContext>();
    await db.Database.MigrateAsync();
    if (args[0] == "invite-user")
    {
        // Break-glass / first-owner bootstrap: prints a one-time code to the operator console. Requires server access.
        if (args.Length < 3) throw new ArgumentException("usage: invite-user <tenantCode> <phone>");
        var tid = await db.Tenants.Where(t => t.Code == args[1]).Select(t => (long?)t.Id).FirstOrDefaultAsync() ?? throw new ArgumentException("Unknown tenant");
        scope.ServiceProvider.GetRequiredService<TenantContext>().TenantId = tid;
        var uid = await db.Users.Where(u => u.Phone == args[2]).Select(u => (long?)u.Id).FirstOrDefaultAsync() ?? throw new ArgumentException("Unknown user phone");
        var (code, exp) = await scope.ServiceProvider.GetRequiredService<IamService>().InviteAsync(uid, "cli", "owner");
        Console.WriteLine($"Invite code for {args[2]}: {code} (expires {exp:u}). Redeem at sign-in → Activate with invite code.");
    }
    if (args[0] == "import-legacy")
    {
        var path = args.ElementAtOrDefault(1) ?? throw new ArgumentException("usage: import-legacy <db.json> [tenantCode] [fromDate] [redbusOperatorCode]");
        var report = await scope.ServiceProvider.GetRequiredService<LegacyImporter>().ImportAsync(path, args.ElementAtOrDefault(2) ?? "demo",
            args.ElementAtOrDefault(3) is { } d ? DateOnly.Parse(d) : DateOnly.FromDateTime(DateTime.UtcNow), args.ElementAtOrDefault(4));
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(report));
    }
    return;
}

if (cfg.GetValue<bool>("Database:MigrateOnStartup"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<GdsDbContext>().Database.MigrateAsync();
}

app.UseExceptionHandler(e => e.Run(async ctx =>
{
    var ex = ctx.Features.Get<IExceptionHandlerFeature>()?.Error;
    static bool StoreDown(Exception? e)
    {
        for (; e is not null; e = e.InnerException)
            if (e is Npgsql.NpgsqlException or System.Net.Sockets.SocketException or TimeoutException) return true;
        return false;
    }
    var (status, code, msg) = ex switch
    {
        GdsException g => (g.HttpStatus, g.Code, g.Message),
        BadHttpRequestException b => (400, "BAD_REQUEST", b.Message),
        FormatException => (400, "BAD_REQUEST", "Invalid date or number format"),
        _ when StoreDown(ex) => (503, "STORE_UNAVAILABLE", "Booking store temporarily unavailable; no change was committed"),
        _ => (500, "INTERNAL", "Unexpected error"),
    };
    if (status >= 500) ctx.RequestServices.GetRequiredService<ILogger<Program>>().LogError(ex, "Request failed");
    ctx.Response.StatusCode = status;
    await ctx.Response.WriteAsJsonAsync(new RbError("FAILED", code, msg));
}));

app.UseAuthentication();

// Tenant resolution: RedBus inbound → configured tenant; admin API → authenticated key's tenant.
var redbusPrefix = cfg["RedBus:PathPrefix"] ?? "/redbus";
app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path;
    string? code = null;
    if (path.StartsWithSegments(redbusPrefix)) code = cfg["RedBus:TenantCode"];
    else if (path.StartsWithSegments("/api/admin")) code = ctx.User.FindFirstValue("tenant");
    if (code is not null)
    {
        var db = ctx.RequestServices.GetRequiredService<GdsDbContext>();
        var id = await db.Tenants.Where(t => t.Code == code).Select(t => (long?)t.Id).FirstOrDefaultAsync();
        if (id is null) { ctx.Response.StatusCode = 503; await ctx.Response.WriteAsJsonAsync(new RbError("FAILED", "TENANT_NOT_CONFIGURED", "Tenant not configured")); return; }
        ctx.RequestServices.GetRequiredService<TenantContext>().TenantId = id.Value;
    }
    await next();
});
app.UseAuthorization();
app.UseRateLimiter();

app.MapHealthChecks("/health/live");
app.MapGet("/health/ready", async (GdsDbContext db, IGdsCache cache) =>
{
    var pg = await db.Database.CanConnectAsync();
    return Results.Json(new { postgres = pg, redis = cache.IsConnected, degraded = !cache.IsConnected }, statusCode: pg ? 200 : 503);
});
app.MapRedBus(redbusPrefix).RequireRateLimiting("redbus");
app.MapAdmin();
JourneyOS.Api.Admin.OperationsEndpoints.MapOperations(app);
JourneyOS.Api.Admin.BusinessEndpoints.MapBusiness(app);
JourneyOS.Api.Admin.ScheduleEndpoints.MapSchedules(app);
app.MapHub<JourneyOS.Api.Realtime.OpsHub>("/hubs/ops");

app.Run();

public partial class Program;
