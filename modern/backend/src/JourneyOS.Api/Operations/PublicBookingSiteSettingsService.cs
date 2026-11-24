using System.Globalization;
using System.Text.Json;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Operations;

public sealed record PublicCityInput(long CityId, long? PublicCityId);
public sealed record PublicBookingSiteDraft(string? SearchUrl, List<PublicCityInput>? CityMappings);
public sealed record PublicCityDetail(long CityId, string Name, long? PublicCityId);
public sealed record PublicBookingSiteView(string OperatorCode, string OperatorName, string SearchUrl,
    bool Configured, string Source, PublicCityDetail[] CityMappings, string? UpdatedBy, DateTime? UpdatedAt);

/// <summary>
/// Explicit per-operator mapping. Never invent a booking website or assume GDS
/// city IDs match website city IDs. URL validation is shared with the Share API.
/// </summary>
public sealed class PublicBookingSiteSettingsService(GdsDbContext db, IConfiguration configuration, TimeProvider clock)
{
    private async Task<Tenant> TenantAsync() =>
        await db.Tenants.AsNoTracking().FirstAsync(x => x.Id == db.CurrentTenantId);

    private async Task<(PublicBookingSite? Stored, string Url, Dictionary<long,long> Map, string Source)> EffectiveAsync(Tenant tenant)
    {
        var stored = await db.PublicBookingSites.AsNoTracking().SingleOrDefaultAsync();
        if (stored is not null)
        {
            var raw=JsonSerializer.Deserialize<Dictionary<string,long>>(stored.CityMapJson) ?? [];
            var mapped=raw.Where(x=>long.TryParse(x.Key,NumberStyles.None,
                CultureInfo.InvariantCulture,out _)&&x.Value>0)
                .ToDictionary(x=>long.Parse(x.Key,CultureInfo.InvariantCulture),x=>x.Value);
            return (stored,stored.SearchUrl,mapped,"database");
        }
        var section=configuration.GetSection($"PublicBooking:Operators:{tenant.Code}");
        var fromConfig=new Dictionary<long,long>();
        foreach (var field in section.GetSection("CityMap").GetChildren())
            if (long.TryParse(field.Key,NumberStyles.None,CultureInfo.InvariantCulture,out var id) &&
                long.TryParse(field.Value,NumberStyles.None,CultureInfo.InvariantCulture,out var external) &&
                id>0 && external>0) fromConfig[id]=external;
        return (null,section["SearchUrl"] ?? "",fromConfig,"server_configuration");
    }

    public async Task<PublicBookingSiteView> GetAsync()
    {
        var tenant=await TenantAsync();
        var (stored,url,map,source)=await EffectiveAsync(tenant);
        var cities=await db.Cities.AsNoTracking().Where(c=>c.IsActive)
            .OrderBy(c=>c.Name).ToArrayAsync();
        return new PublicBookingSiteView(tenant.Code,tenant.Name,url,
            !string.IsNullOrWhiteSpace(url),source,
            cities.Select(c=>new PublicCityDetail(c.Id,c.Name,map.GetValueOrDefault(c.Id)==0?
                null:map[c.Id])).ToArray(),stored?.UpdatedBy,stored?.UpdatedAt);
    }

    public async Task<PublicBookingSiteView> SaveAsync(PublicBookingSiteDraft input, string actor)
    {
        if(input is null)throw new GdsException("VALIDATION","Website configuration is required");
        var url=(input.SearchUrl??"").Trim();
        if(url.Length>0)
            _=PassengerBookingShareService.ValidatePublicSite(url);
        var entries=input.CityMappings??[];
        if(entries.Count>10000)throw new GdsException("CITY_MAP","Too many city mappings");
        var usedIds=new HashSet<long>();
        var usedPublic=new HashSet<long>();
        var map=new Dictionary<string,long>();
        foreach(var item in entries)
        {
            if(item.CityId<=0||!usedIds.Add(item.CityId))
                throw new GdsException("CITY_MAP","Duplicate or invalid GDS city in mapping");
            if(item.PublicCityId is not { } external)continue;
            if(external<=0||!usedPublic.Add(external))
                throw new GdsException("CITY_MAP","External city IDs must be distinct positive numbers");
            map[item.CityId.ToString(CultureInfo.InvariantCulture)]=external;
        }
        if(url.Length==0&&map.Count>0)
            throw new GdsException("CITY_MAP","Set an approved public HTTPS site before mapping external cities");
        var ids=usedIds.ToArray();
        var count=await db.Cities.CountAsync(c=>ids.Contains(c.Id)&&c.IsActive);
        if(count!=ids.Length)
            throw new GdsException("CITY_MAP","One or more selected cities do not belong to this operator",409);

        await using var tx=await db.Database.BeginTransactionAsync();
        var current=await db.PublicBookingSites.SingleOrDefaultAsync();
        if(current is null)
        {
            current=new PublicBookingSite{TenantId=db.CurrentTenantId};
            db.PublicBookingSites.Add(current);
        }
        current.SearchUrl=url;
        current.CityMapJson=JsonSerializer.Serialize(map);
        current.UpdatedBy=actor;
        current.UpdatedAt=clock.GetUtcNow().UtcDateTime;
        db.AuditLogs.Add(new AuditLog
        {
            TenantId=db.CurrentTenantId,Actor=actor,Action="BOOKING_SITE_CONFIG",
            Entity="public_booking_site",EntityId=db.CurrentTenantId.ToString(),
            DataJson=JsonSerializer.Serialize(new{searchHost=url.Length>0?new Uri(url).Host:null,mappedCities=map.Count}),
            At=current.UpdatedAt
        });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return await GetAsync();
    }
}
