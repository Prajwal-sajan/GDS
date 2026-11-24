using System.Globalization;
using System.Net;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Operations;

public sealed record PassengerBookingShare(
    long TripId, string ServiceNumber, string From, string To,
    DateOnly BoardingDate, string Url, string Message,
    string LinkType = "route_date_search", bool PreselectsService = false);

/// <summary>
/// Reproduces legacy v50 route/date Share with an explicit, operator-owned
/// HTTPS passenger site and explicit third-party city ID mapping.
/// Never assume another operator's domain, or fabricate an exact-service link.
/// </summary>
public sealed class PassengerBookingShareService(
    GdsDbContext db, IConfiguration configuration, TimeProvider clock)
{
    public static Uri ValidatePublicSite(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new GdsException("BOOKING_SITE_NOT_CONFIGURED",
                "Configure your operator's public HTTPS booking search website before sharing.", 409);
        if (value.Length > 512 || !Uri.TryCreate(value, UriKind.Absolute, out var url) ||
            url.Scheme != Uri.UriSchemeHttps || url.HostNameType != UriHostNameType.Dns ||
            !string.IsNullOrEmpty(url.UserInfo) || !string.IsNullOrEmpty(url.Query) ||
            !string.IsNullOrEmpty(url.Fragment) || !url.IsDefaultPort ||
            url.Host.EndsWith(".local", StringComparison.OrdinalIgnoreCase) ||
            url.Host.EndsWith(".internal", StringComparison.OrdinalIgnoreCase) ||
            url.Host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) ||
            url.Host.EndsWith(".test", StringComparison.OrdinalIgnoreCase) ||
            url.Host.EndsWith(".invalid", StringComparison.OrdinalIgnoreCase) ||
            url.Host.TrimEnd('.').Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
            !url.Host.Contains('.') || IPAddress.TryParse(url.Host, out _))
            throw new GdsException("UNSAFE_BOOKING_SITE",
                "Passenger booking Search URL must be a public HTTPS hostname without credentials, query or fragment.", 409);
        return url;
    }

    public static PassengerBookingShare Compose(
        long tripId, string serviceNumber, string source, string destination,
        DateOnly boardingDate, long siteSourceId, long siteDestinationId, Uri site)
    {
        if (siteSourceId <= 0 || siteDestinationId <= 0 || siteSourceId == siteDestinationId)
            throw new GdsException("BOOKING_CITY_MAPPING",
                "Configure distinct external city IDs for this route segment.", 409);
        var query = $"fromCity={siteSourceId}&toCity={siteDestinationId}&journeyDate={boardingDate:yyyy-MM-dd}";
        var url = site.AbsoluteUri + (site.AbsoluteUri.EndsWith("?") ? "" : "?") + query;
        var day = boardingDate.ToDateTime(TimeOnly.MinValue)
            .ToString("ddd, dd MMM, yyyy", CultureInfo.InvariantCulture);
        return new PassengerBookingShare(tripId, serviceNumber, source, destination,
            boardingDate, url,
            $"{source} → {destination} on {day} — pick your seat and book: {url}");
    }

    public async Task<PassengerBookingShare> ForTripAsync(long tripId, int? fromSeq, int? toSeq)
    {
        var trip = await db.Trips.AsNoTracking()
            .Include(t => t.Route!).ThenInclude(r => r.Stops).ThenInclude(s => s.City)
            .FirstOrDefaultAsync(t => t.Id == tripId)
            ?? throw new GdsException("SERVICE_NOT_FOUND", "Schedule not found", 404);
        if (trip.Status != "active" || !trip.Bookable)
            throw new GdsException("NOT_BOOKABLE", "This schedule is not available for passenger booking.", 409);
        var route = trip.Route
            ?? throw new GdsException("ROUTE_NOT_FOUND", "Schedule route not found", 404);
        var stops = route.Stops.OrderBy(s => s.Sequence).ToList();
        if (stops.Count < 2) throw new GdsException("NO_ROUTE", "Route has fewer than two cities", 409);
        var from = fromSeq ?? stops[0].Sequence;
        var to = toSeq ?? stops[^1].Sequence;
        var source = stops.FirstOrDefault(s => s.Sequence == from);
        var destination = stops.FirstOrDefault(s => s.Sequence == to);
        if (from >= to || source is null || destination is null)
            throw new GdsException("INVALID_SEGMENT",
                "Select two ordered cities on this schedule before sharing.", 400);

        var tenant = await db.Tenants.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == db.CurrentTenantId)
            ?? throw new GdsException("TENANT_NOT_FOUND", "Operator not found", 404);
        var today = TimeZoneInfo.ConvertTime(clock.GetUtcNow(), TimeZoneInfo.FindSystemTimeZoneById(tenant.TimeZone));
        var boardingDate = trip.TravelDate.AddDays(source.Day - 1);
        var boardingLocal = boardingDate.ToDateTime(source.Time);
        if (boardingLocal <= today.DateTime)
            throw new GdsException("DEPARTURE_PASSED",
                "The selected city boarding time has already passed.", 409);
        var siteConfig = configuration.GetSection($"PublicBooking:Operators:{tenant.Code}");
        var site = ValidatePublicSite(siteConfig["SearchUrl"]);
        var fromPublic = siteConfig.GetValue<long?>($"CityMap:{source.CityId}");
        var toPublic = siteConfig.GetValue<long?>($"CityMap:{destination.CityId}");
        if (fromPublic is null || toPublic is null)
            throw new GdsException("BOOKING_CITY_MAPPING",
                "This operator's website city IDs have not been mapped for both selected cities.", 409);

        return Compose(tripId, route.ServiceNumber,
            source.City?.Name ?? $"City #{source.CityId}",
            destination.City?.Name ?? $"City #{destination.CityId}",
            boardingDate, fromPublic.Value, toPublic.Value, site);
    }
}
