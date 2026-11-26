using System.Globalization;
using JourneyOS.Api.Persistence;

namespace JourneyOS.Api.Inventory;

public sealed record SeatPrice(decimal BaseFare, decimal Gst, decimal Fare);

/// <summary>
/// Fare engine. Parity with legacy server/domain.js fareFor(): segment fare matrix by fare class,
/// plus route seat_fare_rules (amount / percent, optionally day-restricted). GST is GST-exclusive
/// listed fare × tenant GST %. Legacy fare_groups and auto_price are NOT yet migrated (see parity matrix).
/// </summary>
public static class FareCalculator
{
    private static readonly string[] DayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    /// <summary>Trip fare override (legacy schedule.fare_override) when set, otherwise the route fare matrix.</summary>
    public static IReadOnlyList<RouteFare> FaresFor(Route route, Trip? trip)
    {
        if (string.IsNullOrEmpty(trip?.FareOverrideJson)) return route.Fares;
        var o = System.Text.Json.JsonSerializer.Deserialize<List<TripFare>>(trip.FareOverrideJson) ?? [];
        return o.Select(x => new RouteFare { RouteId = route.Id, FromSequence = x.FromSequence, ToSequence = x.ToSequence, Seater = x.Seater, SleeperLower = x.SleeperLower, SleeperUpper = x.SleeperUpper }).ToList();
    }

    public static decimal? ListedFare(Route route, CoachSeat seat, int fromSeq, int toSeq, DateOnly travelDate, Trip? trip = null)
    {
        var f = FaresFor(route, trip).FirstOrDefault(x => x.FromSequence == fromSeq && x.ToSequence == toSeq);
        if (f is null) return null;
        var fare = seat.FareClass switch
        {
            "sleeper_lower" => f.SleeperLower,
            "sleeper_upper" => f.SleeperUpper,
            _ => f.Seater,
        };
        if (fare <= 0) fare = f.Seater;
        var dayNo = (int)travelDate.DayOfWeek;
        decimal pct = 0, fixedAmt = 0;
        foreach (var rule in route.SeatFareRules)
        {
            if (!rule.Seats.Contains(seat.Code)) continue;
            if (rule.Days.Length > 0 && !rule.Days.Any(d =>
                    string.Equals(d, DayNames[dayNo], StringComparison.OrdinalIgnoreCase) || d == dayNo.ToString(CultureInfo.InvariantCulture)))
                continue;
            if (rule.Kind == "percent") pct += rule.Value; else fixedAmt += rule.Value;
        }
        return Math.Round(Math.Max(0, fare + fare * pct / 100m + fixedAmt), 2, MidpointRounding.AwayFromZero);
    }

    public static SeatPrice Price(decimal listed, decimal gstPercent)
    {
        var gst = Math.Round(listed * gstPercent / 100m, 2, MidpointRounding.AwayFromZero);
        return new SeatPrice(listed, gst, listed + gst);
    }
}

/// <summary>
/// RedBus cancellation policy string "fromHrs:toHrs:chargePct:flag;..." (e.g. "0:12:100:0;12:24:50:0;24:-1:10:0").
/// Hours are measured before departure; -1 = open-ended. The 4th field is treated as "0 = percentage";
/// its other meanings are undocumented in the sample (see ambiguity register) and are never emitted.
/// </summary>
public static class CancellationPolicy
{
    public static string FromRefundSlabs(IEnumerable<RefundSlab> slabs)
    {
        var ordered = slabs.OrderBy(s => s.HoursBefore).ToList();
        if (ordered.Count == 0) return "0:-1:100:0";
        var parts = new List<string>();
        if (ordered[0].HoursBefore > 0) parts.Add($"0:{ordered[0].HoursBefore}:100:0");
        for (var i = 0; i < ordered.Count; i++)
        {
            var from = ordered[i].HoursBefore;
            var to = i + 1 < ordered.Count ? ordered[i + 1].HoursBefore : -1;
            var charge = 100m - ordered[i].RefundPercent;
            parts.Add(string.Create(CultureInfo.InvariantCulture, $"{from}:{to}:{charge:0.##}:0"));
        }
        return string.Join(';', parts);
    }

    public static decimal ChargePercent(string policy, double hoursBeforeDeparture)
    {
        if (hoursBeforeDeparture < 0) return 100m;
        foreach (var part in policy.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var f = part.Split(':');
            var from = double.Parse(f[0], CultureInfo.InvariantCulture);
            var to = double.Parse(f[1], CultureInfo.InvariantCulture);
            if (hoursBeforeDeparture >= from && (to < 0 || hoursBeforeDeparture < to))
                return decimal.Parse(f[2], CultureInfo.InvariantCulture);
        }
        return 100m;
    }
}

public static class TripClock
{
    /// <summary>Local wall-clock time of a stop/stage relative to the trip's origin travel date.</summary>
    public static DateTime Local(DateOnly travelDate, int day, TimeOnly time) =>
        travelDate.AddDays(day - 1).ToDateTime(time);

    public static DateTime ToUtc(DateTime local, string tz)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(tz);
        return TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), zone);
    }

    public static string Fmt(DateTime local) => local.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
}
