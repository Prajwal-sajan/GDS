using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using JourneyOS.Api.Import;
using JourneyOS.Api.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;
using Testcontainers.Redis;

namespace JourneyOS.Tests;

/// <summary>Scriptable stand-in for the RedBus callback endpoint (never talks to RedBus).</summary>
public sealed class MockRedBusHandler : HttpMessageHandler
{
    public List<(string Url, string Body)> Received { get; } = [];
    public Func<string, string, HttpResponseMessage> Respond { get; set; } = (_, _) => Ok("{\"status\":\"ok\"}");

    public static HttpResponseMessage Ok(string body) => new(HttpStatusCode.OK) { Content = new StringContent(body) };

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
        lock (Received) Received.Add((request.RequestUri!.ToString(), body));
        return Respond(request.RequestUri!.ToString(), body);
    }
}

public sealed class GdsFactory(string pg, string redis, Dictionary<string, string?>? extra = null, string environment = "Testing",
    Action<IServiceCollection>? services = null)
    : WebApplicationFactory<Program>
{
    public MockRedBusHandler RedBus { get; } = new();
    public const string OwnerKey = "test-owner-key";
    public const string OtherTenantKey = "test-other-key";

    private static string Sha(string s) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(s)));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environment);
        builder.ConfigureAppConfiguration((_, c) =>
        {
            var settings = new Dictionary<string, string?>
            {
                ["ConnectionStrings:Postgres"] = pg,
                ["ConnectionStrings:Redis"] = redis,
                ["Workers:Enabled"] = "false",
                ["Database:MigrateOnStartup"] = "true",
                ["RedBus:TenantCode"] = "demo",
                ["RedBus:RatePerMinute"] = "100000",
                ["Auth:LoginPerMinute"] = "100000",
                ["Admin:Keys:0:Name"] = "test-owner", ["Admin:Keys:0:KeySha256"] = Sha(OwnerKey), ["Admin:Keys:0:TenantCode"] = "demo", ["Admin:Keys:0:Role"] = "owner",
                ["Admin:Keys:1:Name"] = "other-owner", ["Admin:Keys:1:KeySha256"] = Sha(OtherTenantKey), ["Admin:Keys:1:TenantCode"] = "other", ["Admin:Keys:1:Role"] = "owner",
            };
            foreach (var kv in extra ?? []) settings[kv.Key] = kv.Value;
            c.AddInMemoryCollection(settings);
        });
        builder.ConfigureServices(s => s.AddHttpClient<JourneyOS.Api.Outbox.RedBusCallbackClient>().ConfigurePrimaryHttpMessageHandler(() => RedBus));
        if (services is not null) builder.ConfigureServices(services);
    }

    public HttpClient Admin(string key = OwnerKey)
    {
        var c = CreateClient();
        c.DefaultRequestHeaders.Add("X-Admin-Key", key);
        return c;
    }
}

/// <summary>One PostgreSQL + Redis pair for the whole run, seeded from the legacy data/db.json.</summary>
public sealed class GdsFixture : IAsyncLifetime
{
    public PostgreSqlContainer Pg { get; } = new PostgreSqlBuilder().WithImage("postgres:17-alpine").Build();
    public RedisContainer Redis { get; } = new RedisBuilder().WithImage("redis:7.4-alpine").Build();
    public GdsFactory Factory { get; private set; } = null!;
    public static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(5.5));

    public async Task InitializeAsync()
    {
        await Task.WhenAll(Pg.StartAsync(), Redis.StartAsync());
        Factory = new GdsFactory(Pg.GetConnectionString(), Redis.GetConnectionString());
        using var scope = Factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<GdsDbContext>().Database.MigrateAsync();
        await scope.ServiceProvider.GetRequiredService<LegacyImporter>().ImportAsync(LegacyDbPath(), "demo", Today, "TESTOP");
        var db = scope.ServiceProvider.GetRequiredService<GdsDbContext>();
        await db.Database.ExecuteSqlRawAsync("INSERT INTO tenants (code, name, operator_id, time_zone, gst_percent) VALUES ('other','Other Operator', 9999, 'Asia/Kolkata', 5) ON CONFLICT DO NOTHING");
    }

    public async Task DisposeAsync()
    {
        await Factory.DisposeAsync();
        await Task.WhenAll(Pg.DisposeAsync().AsTask(), Redis.DisposeAsync().AsTask());
    }

    public static string LegacyDbPath()
    {
        // CI supplies an isolated synthetic seed. Never use or overwrite a
        // real operator database merely to make tests reproducible.
        var explicitFixture = Environment.GetEnvironmentVariable("JOURNEYOS_TEST_LEGACY_DB");
        if (!string.IsNullOrWhiteSpace(explicitFixture))
        {
            if (File.Exists(explicitFixture)) return explicitFixture;
            throw new FileNotFoundException("Configured synthetic GDS fixture is missing", explicitFixture);
        }

        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d is not null; d = d.Parent)
        {
            var p = Path.Combine(d.FullName, "data", "db.json");
            if (File.Exists(p)) return p;
        }
        throw new FileNotFoundException("legacy data/db.json not found above test output directory");
    }

    public async Task<T> Sql<T>(Func<GdsDbContext, Task<T>> f)
    {
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GdsDbContext>();
        var tc = (TenantContext)scope.ServiceProvider.GetRequiredService<ITenantContext>();
        tc.TenantId = await db.Tenants.Where(t => t.Code == "demo").Select(t => t.Id).FirstOrDefaultAsync();
        return await f(db);
    }
}

[CollectionDefinition("gds")]
public sealed class GdsCollection : ICollectionFixture<GdsFixture>;

/// <summary>RedBus-contract client helpers used by the tests (mirrors what RedBus would send).</summary>
public static class RedBusClient
{
    public sealed record Found(long InventoryId, long Source, long Destination, string Doj, long Bp, long Dp, JsonArray Seats);

    public static async Task<JsonNode> GetJson(this HttpClient c, string url)
    {
        var r = await c.GetAsync(url);
        var text = await r.Content.ReadAsStringAsync();
        Assert.True(r.IsSuccessStatusCode, $"{url} -> {(int)r.StatusCode} {text}");
        return JsonNode.Parse(text)!;
    }

    public static async Task<Found> FindTrip(HttpClient c, int seatsNeeded = 2, Func<JsonNode, bool>? filter = null, long? source = null, long? destination = null)
    {
        var cities = (await c.GetJson("/redbus/cities"))["cities"]!.AsArray();
        foreach (var s in cities.Where(x => source is null || (long)x!["id"]! == source))
        foreach (var d in (await c.GetJson($"/redbus/destinationBySource?source={s!["id"]}"))["cities"]!.AsArray().Where(x => destination is null || (long)x!["id"]! == destination))
        for (var off = 1; off <= 14; off++)
        {
            var doj = GdsFixture.Today.AddDays(off).ToString("yyyy-MM-dd");
            var trips = (await c.GetJson($"/redbus/search?source={s["id"]}&destination={d!["id"]}&doj={doj}"))["availableTrips"]!.AsArray();
            foreach (var t in trips.Where(t => (bool)t!["bookable"]! && (int)t["availableSeats"]! >= seatsNeeded && (filter?.Invoke(t!) ?? true)))
            {
                var layout = await c.GetJson($"/redbus/seatlayout?id={t!["id"]}&doj={doj}");
                var free = new JsonArray(layout["seats"]!.AsArray()
                    .Where(x => (bool)x!["available"]! && !(bool)x["ladiesSeat"]! && !(bool)x["malesSeat"]!)
                    .Select(x => x!.DeepClone()).ToArray());
                if (free.Count < seatsNeeded) continue;
                return new Found((long)t["id"]!, (long)t["source"]!, (long)t["destination"]!, doj,
                    (long)t["boardingTimes"]![0]!["bpId"]!, (long)t["droppingTimes"]!.AsArray()[^1]!["bpId"]!, free);
            }
        }
        throw new InvalidOperationException("No bookable trip with free seats found");
    }

    public static object BlockBody(Found f, params JsonNode[] seats) => new
    {
        Inventoryid = f.InventoryId, boardingPointId = f.Bp, droppingPointId = f.Dp, source = f.Source, destination = f.Destination,
        inventoryItems = seats.Select((s, i) => new
        {
            seatName = (string)s["name"]!, fare = (decimal)s["fare"]!, ladiesSeat = false,
            passenger = new { name = $"Test Pax {i + 1}", mobile = "9000000000", title = "Mr", email = "t@example.test", age = 30, gender = "MALE", address = "x", idType = "PAN", idNumber = "ABCDE1234F", primary = i == 0 },
        }).ToArray(),
    };

    public static async Task<(HttpStatusCode Status, JsonNode? Body)> Post(this HttpClient c, string url, object body)
    {
        var r = await c.PostAsJsonAsync(url, body);
        var text = await r.Content.ReadAsStringAsync();
        return (r.StatusCode, string.IsNullOrWhiteSpace(text) ? null : JsonNode.Parse(text));
    }

    public static async Task<(string BlockKey, decimal Total)> Block(HttpClient c, Found f, params JsonNode[] seats)
    {
        var (st, b) = await c.Post("/redbus/blockticket", BlockBody(f, seats));
        Assert.True(st == HttpStatusCode.OK, $"blockticket {st}: {b?.ToJsonString()}");
        return ((string)b!["blockKey"]!, decimal.Parse((string)b["totalFare"]!, System.Globalization.CultureInfo.InvariantCulture));
    }

    public static async Task<string> Book(HttpClient c, Found f, params JsonNode[] seats)
    {
        var (key, total) = await Block(c, f, seats);
        var (st, b) = await c.Post("/redbus/confirmticket", new { Blockkey = key, Fare = total });
        Assert.True(st == HttpStatusCode.OK, $"confirmticket {st}: {b?.ToJsonString()}");
        return (string)b!["pnr"]!;
    }
}
