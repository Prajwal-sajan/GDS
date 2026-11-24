using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using System.Text.Json;
using StackExchange.Redis;

namespace JourneyOS.Api.Caching;

/// <summary>
/// Centralised, tenant-scoped, non-authoritative cache. Every method degrades to a cache miss
/// (never an exception) when Redis is unavailable; PostgreSQL remains the source of truth.
/// Invalidation uses generation counters so that stale entries simply become unreachable.
/// </summary>
public interface IGdsCache
{
    Task<T> GetOrCreateAsync<T>(string key, TimeSpan ttl, Func<Task<T>> factory);
    Task<long> GenerationAsync(string scope);
    Task BumpAsync(params string[] scopes);
    bool IsConnected { get; }
}

public static class CacheKeys
{
    public static string SearchScope(long tenant) => $"t:{tenant}:gen:search";
    public static string TripScope(long tenant, long tripId) => $"t:{tenant}:gen:trip:{tripId}";
    public static string CatalogScope(long tenant) => $"t:{tenant}:gen:catalog";
    public static string Search(long tenant, long src, long dst, DateOnly doj, long gen) => $"t:{tenant}:search:{src}:{dst}:{doj:yyyy-MM-dd}:g{gen}";
    public static string SeatLayout(long tenant, long inventoryId, DateOnly doj, long gen) => $"t:{tenant}:seatlayout:{inventoryId}:{doj:yyyy-MM-dd}:g{gen}";
    public static string Cities(long tenant, long gen) => $"t:{tenant}:cities:g{gen}";
    public static string Destinations(long tenant, long src, long gen) => $"t:{tenant}:dests:{src}:g{gen}";
}

public sealed record RedisConnection(IConnectionMultiplexer? Multiplexer);

public sealed class RedisGdsCache : IGdsCache
{
    private static readonly Meter Meter = new("JourneyOS.Cache");
    private static readonly Counter<long> Hits = Meter.CreateCounter<long>("gds_cache_hits");
    private static readonly Counter<long> Misses = Meter.CreateCounter<long>("gds_cache_misses");
    private static readonly Counter<long> Errors = Meter.CreateCounter<long>("gds_cache_errors");

    private readonly IConnectionMultiplexer? _mux;
    private readonly ILogger<RedisGdsCache> _log;
    // Single-flight per key within this instance (stampede protection).
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new();
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = false };

    public RedisGdsCache(RedisConnection redis, ILogger<RedisGdsCache> log)
    {
        _mux = redis.Multiplexer;
        _log = log;
    }

    public bool IsConnected => _mux?.IsConnected == true;
    private IDatabase? Db => IsConnected ? _mux!.GetDatabase() : null;

    public async Task<T> GetOrCreateAsync<T>(string key, TimeSpan ttl, Func<Task<T>> factory)
    {
        var db = Db;
        if (db is null) { Misses.Add(1); return await factory(); }
        var cached = await TryGet(db, key);
        if (cached is not null) { Hits.Add(1); return JsonSerializer.Deserialize<T>(cached, Json)!; }

        var gate = _locks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync();
        try
        {
            cached = await TryGet(db, key);
            if (cached is not null) { Hits.Add(1); return JsonSerializer.Deserialize<T>(cached, Json)!; }
            Misses.Add(1);
            var value = await factory();
            try { await db.StringSetAsync(key, JsonSerializer.Serialize(value, Json), ttl); }
            catch (Exception ex) { Errors.Add(1); _log.LogWarning(ex, "Redis set failed for {Key}", key); }
            return value;
        }
        finally
        {
            gate.Release();
            if (gate.CurrentCount == 1) _locks.TryRemove(key, out _);
        }
    }

    private async Task<string?> TryGet(IDatabase db, string key)
    {
        try { var v = await db.StringGetAsync(key); return v.HasValue ? v.ToString() : null; }
        catch (Exception ex) { Errors.Add(1); _log.LogWarning(ex, "Redis get failed for {Key}", key); return null; }
    }

    public async Task<long> GenerationAsync(string scope)
    {
        var db = Db;
        if (db is null) return -1;
        try { var v = await db.StringGetAsync(scope); return v.HasValue ? (long)v : 0; }
        catch (Exception ex) { Errors.Add(1); _log.LogWarning(ex, "Redis generation read failed"); return -1; }
    }

    public async Task BumpAsync(params string[] scopes)
    {
        var db = Db;
        if (db is null) return; // nothing cached can be served while disconnected; entries also expire by TTL
        foreach (var s in scopes)
        {
            try { await db.StringIncrementAsync(s); }
            catch (Exception ex) { Errors.Add(1); _log.LogWarning(ex, "Redis invalidation failed for {Scope}", s); }
        }
    }
}

/// <summary>Helpers that refuse to serve cached data when the generation cannot be read.</summary>
public static class CacheExtensions
{
    public static async Task<T> GetScopedAsync<T>(this IGdsCache cache, string scope, Func<long, string> keyFor, TimeSpan ttl, Func<Task<T>> factory)
    {
        var gen = await cache.GenerationAsync(scope);
        if (gen < 0) return await factory();
        return await cache.GetOrCreateAsync(keyFor(gen), ttl, factory);
    }
}
