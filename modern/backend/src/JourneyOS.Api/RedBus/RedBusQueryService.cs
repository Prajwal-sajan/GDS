using JourneyOS.Api.Caching;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.RedBus;

/// <summary>Read-side projections of the RedBus contract (search, seat layout, cities, ticket).</summary>
public sealed class RedBusQueryService(GdsDbContext db, InventoryService inventory, IGdsCache cache, TimeProvider clock)
{
    private long T => db.CurrentTenantId;

    public Task<RbCities> CitiesAsync() =>
        cache.GetScopedAsync(CacheKeys.CatalogScope(T), g => CacheKeys.Cities(T, g), TimeSpan.FromMinutes(10), async () =>
        {
            var activeCityIds = await db.RouteStops.Where(s => db.Routes.Any(r => r.Id == s.RouteId && r.Status == "active"))
                .Select(s => s.CityId).Distinct().ToListAsync();
            var cities = await db.Cities.Where(c => c.IsActive && activeCityIds.Contains(c.Id)).OrderBy(c => c.Name).ToListAsync();
            return new RbCities(cities.Select(ToRb).ToList());
        });

    public Task<RbCities> DestinationsAsync(long source) =>
        cache.GetScopedAsync(CacheKeys.CatalogScope(T), g => CacheKeys.Destinations(T, source, g), TimeSpan.FromMinutes(10), async () =>
        {
            var routes = await db.Routes.Where(r => r.Status == "active").Include(r => r.Stops).Include(r => r.Fares).ToListAsync();
            var ids = new HashSet<long>();
            foreach (var r in routes)
                foreach (var f in r.Fares)
                {
                    var s = r.Stops.FirstOrDefault(x => x.Sequence == f.FromSequence);
                    var d = r.Stops.FirstOrDefault(x => x.Sequence == f.ToSequence);
                    if (s?.CityId == source && d is not null) ids.Add(d.CityId);
                }
            var cities = await db.Cities.Where(c => c.IsActive && ids.Contains(c.Id)).OrderBy(c => c.Name).ToListAsync();
            return new RbCities(cities.Select(ToRb).ToList());
        });

    private static RbCity ToRb(City c) => new(c.Id, c.Name, c.CountryId, c.CountryName, "CITY");

    public Task<RbSearchResponse> SearchAsync(long source, long destination, DateOnly doj) =>
        cache.GetScopedAsync(CacheKeys.SearchScope(T), g => CacheKeys.Search(T, source, destination, doj, g), TimeSpan.FromSeconds(30), async () =>
        {
            var tenant = await inventory.TenantAsync();
            var provider = await db.OtaProviders.AsNoTracking().FirstOrDefaultAsync(p => p.Provider == "REDBUS");
            var candidates = await db.Trips.AsNoTracking()
                .Where(t => t.TravelDate >= doj.AddDays(-3) && t.TravelDate <= doj && t.Status == "active")
                .ToListAsync();
            var result = new RbSearchResponse();
            foreach (var trip in candidates)
            {
                var route = await inventory.LoadRouteAsync(trip.RouteId);
                if (route.Status != "active") continue;
                var src = route.Stops.FirstOrDefault(s => s.CityId == source);
                var dst = route.Stops.FirstOrDefault(s => s.CityId == destination && src != null && s.Sequence > src.Sequence);
                if (src is null || dst is null) continue;
                if (trip.TravelDate.AddDays(src.Day - 1) != doj) continue; // doj is the boarding date at the source city
                if (route.Fares.All(f => !(f.FromSequence == src.Sequence && f.ToSequence == dst.Sequence))) continue;
                var bps = route.Stages.Where(s => s.Kind == "pickup" && s.StopSequence == src.Sequence).ToList();
                var dps = route.Stages.Where(s => s.Kind == "drop" && s.StopSequence == dst.Sequence).ToList();
                if (bps.Count == 0 || dps.Count == 0) continue;
                var firstBoardUtc = bps.Min(b => TripClock.ToUtc(TripClock.Local(trip.TravelDate, b.Day, b.Time), tenant.TimeZone));
                if (firstBoardUtc <= clock.GetUtcNow().UtcDateTime) continue;

                var inv = await EnsureInventoryAsync(trip.Id, src.Sequence, dst.Sequence);
                var states = await inventory.SeatStatesAsync(trip, route, src.Sequence, dst.Sequence);
                var avail = states.Where(s => s.Available).ToList();
                var prices = states.Where(s => s.Price != null).Select(s => s.Price!).DistinctBy(p => p.Fare).OrderBy(p => p.Fare).ToList();
                var meta = Meta(route, tenant);
                result.AvailableTrips.Add(new RbTrip
                {
                    Id = inv.Id, Travels = tenant.Name, VehicleType = meta.Sleeper ? "SLEEPER" : "SEATER", BusType = route.CoachTemplate!.Name,
                    Operator = tenant.OperatorId, RouteId = route.Id, Doj = doj.ToString("yyyy-MM-dd"),
                    DepartureTime = TripClock.Fmt(TripClock.Local(trip.TravelDate, src.Day, src.Time)),
                    ArrivalTime = TripClock.Fmt(TripClock.Local(trip.TravelDate, dst.Day, dst.Time)),
                    BoardingTimes = bps.Select(b => Point(trip, b)).ToList(),
                    DroppingTimes = dps.Select(b => Point(trip, b)).ToList(),
                    AvailableSeats = avail.Count,
                    Fares = prices.Select(p => p.Fare).ToList(),
                    FareDetails = prices.Select(p => new RbFareDetail(p.BaseFare, p.Fare)).ToList(),
                    CancellationPolicy = CancellationPolicy.FromRefundSlabs(route.RefundSlabs),
                    PartialCancellationAllowed = route.PartialCancellationAllowed,
                    Source = source, Destination = destination,
                    Bookable = trip.Bookable && avail.Count > 0,
                    ServiceId = route.ServiceNumber, MaxSeatsPerTicket = route.MaxSeatsPerTicket,
                    AvlWindowSeats = avail.Count(s => s.Seat.IsWindow), BusRoutes = meta.BusRoutes,
                    SingleLadies = avail.Any(s => s.LadiesOnly), Ac = meta.Ac, NonAc = !meta.Ac, AcUpper = meta.Ac,
                    Seater = meta.Seater, Sleeper = meta.Sleeper, PrimaryPaxCancellable = route.PrimaryPaxCancellable,
                });
            }
            return result;
        });

    public async Task<RbSeatLayoutResponse> SeatLayoutAsync(long inventoryId, DateOnly doj)
    {
        var inv = await db.OtaInventories.AsNoTracking().FirstOrDefaultAsync(i => i.Id == inventoryId)
                  ?? throw new GdsException("INVENTORY_NOT_FOUND", "Unknown inventory id", 404);
        return await cache.GetScopedAsync(CacheKeys.TripScope(T, inv.TripId), g => CacheKeys.SeatLayout(T, inventoryId, doj, g), TimeSpan.FromSeconds(10), async () =>
        {
            var trip = await db.Trips.AsNoTracking().FirstAsync(t => t.Id == inv.TripId);
            var route = await inventory.LoadRouteAsync(trip.RouteId);
            var tenant = await inventory.TenantAsync();
            var src = route.Stops.Single(s => s.Sequence == inv.FromSeq);
            var dst = route.Stops.Single(s => s.Sequence == inv.ToSeq);
            if (trip.TravelDate.AddDays(src.Day - 1) != doj) throw new GdsException("DOJ_MISMATCH", "doj does not match inventory id");
            var states = await inventory.SeatStatesAsync(trip, route, inv.FromSeq, inv.ToSeq);
            var meta = Meta(route, tenant);
            var bookable = trip.Status == "active" && trip.Bookable;
            return new RbSeatLayoutResponse
            {
                Seats = states.Select(s => new RbSeat(s.Seat.Code, s.Seat.Row, s.Seat.Col, s.Seat.Deck == "UPPER" ? 1 : 0, s.Seat.Length, s.Seat.Width,
                    s.Price?.Fare ?? 0, s.Price?.BaseFare ?? 0, bookable && s.Available, s.LadiesOnly, s.MalesOnly)).ToList(),
                Travels = tenant.Name, BusType = route.CoachTemplate!.Name, Operator = tenant.OperatorId, RouteId = route.Id,
                Doj = doj.ToString("yyyy-MM-dd"),
                DepartureTime = TripClock.Fmt(TripClock.Local(trip.TravelDate, src.Day, src.Time)),
                ArrivalTime = TripClock.Fmt(TripClock.Local(trip.TravelDate, dst.Day, dst.Time)),
                BoardingTimes = route.Stages.Where(s => s.Kind == "pickup" && s.StopSequence == src.Sequence).Select(b => Point(trip, b)).ToList(),
                DroppingTimes = route.Stages.Where(s => s.Kind == "drop" && s.StopSequence == dst.Sequence).Select(b => Point(trip, b)).ToList(),
                CancellationPolicy = CancellationPolicy.FromRefundSlabs(route.RefundSlabs), MaxSeatsPerTicket = route.MaxSeatsPerTicket,
                AvlWindowSeats = states.Count(s => s.Available && s.Seat.IsWindow), BusRoutes = meta.BusRoutes,
                Ac = meta.Ac, NonAc = !meta.Ac, AcUpper = meta.Ac, Seater = meta.Seater, Sleeper = meta.Sleeper,
                PrimaryPaxCancellable = route.PrimaryPaxCancellable,
            };
        });
    }

    public async Task<RbTicketResponse> TicketAsync(string pnr)
    {
        var b = await db.Bookings.AsNoTracking().Include(x => x.Passengers).FirstOrDefaultAsync(x => x.Pnr == pnr)
                ?? throw new GdsException("PNR_NOT_FOUND", "PNR not found", 404);
        var trip = await db.Trips.AsNoTracking().FirstAsync(t => t.Id == b.TripId);
        var route = await inventory.LoadRouteAsync(trip.RouteId);
        var tenant = await inventory.TenantAsync();
        var src = route.Stops.Single(s => s.Sequence == b.FromSeq);
        var dst = route.Stops.Single(s => s.Sequence == b.ToSeq);
        var cities = await db.Cities.AsNoTracking().Where(c => c.Id == src.CityId || c.Id == dst.CityId).ToDictionaryAsync(c => c.Id);
        var bp = route.Stages.First(s => s.Id == b.BoardingStageId);
        var dp = route.Stages.First(s => s.Id == b.DroppingStageId);
        static int Minutes(int day, TimeOnly t) => (day - 1) * 1440 + t.Hour * 60 + t.Minute;
        var cancelled = b.Passengers.Where(p => p.Status == "CANCELLED").ToList();
        return new RbTicketResponse
        {
            Pnr = b.Pnr,
            InventoryItems = b.Passengers.OrderBy(p => p.Id).Select(p => new RbTicketPassengerItem
            {
                SeatName = p.SeatCode, Fare = p.Fare, LadiesSeat = p.LadiesSeat,
                Passenger = new RbTicketPassenger
                {
                    Name = p.Name, Mobile = p.Mobile, Title = p.Title, Email = p.Email, Age = p.Age, Gender = p.Gender,
                    IdType = p.IdType, IdNumber = p.IdNumber, Address = p.Address, Primary = p.IsPrimary, Status = p.Status,
                },
            }).ToList(),
            InventoryId = b.InventoryId ?? 0,
            Doj = trip.TravelDate.AddDays(src.Day - 1).ToString("yyyy-MM-dd"),
            SourceCityId = src.CityId, DestinationCityId = dst.CityId,
            PickupLocationId = bp.Id, PickupLocation = bp.Name, PickUpLocationAddress = bp.Address ?? "", PickupLocationLandmark = bp.Landmark ?? "",
            PickUpContactNo = bp.ContactNumber ?? "", PickupTime = Minutes(bp.Day, bp.Time),
            DropLocationId = dp.Id, DropLocation = dp.Name, DropLocationAddress = dp.Address ?? "", DropLocationLandmark = dp.Landmark ?? "",
            DropTime = Minutes(dp.Day, dp.Time),
            CancellationPolicy = b.CancellationPolicy, PartialCancellationAllowed = route.PartialCancellationAllowed,
            Status = b.Status, DateOfIssue = b.DateOfIssue.ToString("yyyy-MM-dd HH:mm:ss"), Travels = tenant.Name, BusType = route.CoachTemplate!.Name,
            RefundAmount = cancelled.Sum(p => p.RefundAmount), CancellationCharges = cancelled.Sum(p => p.CancellationCharge),
            DateOfCancellation = b.DateOfCancellation?.ToString("yyyy-MM-dd HH:mm:ss"),
            PrimeDepartureTime = Minutes(src.Day, src.Time),
            SourceCity = cities[src.CityId].Name, DestinationCity = cities[dst.CityId].Name,
            TotalFare = b.TotalFare,
        };
    }

    public async Task<List<RbTripStatusRow>> TripStatusAsync(string pnr)
    {
        var b = await db.Bookings.AsNoTracking().Include(x => x.Passengers).FirstOrDefaultAsync(x => x.Pnr == pnr)
                ?? throw new GdsException("PNR_NOT_FOUND", "PNR not found", 404);
        var tenant = await inventory.TenantAsync();
        var zone = TimeZoneInfo.FindSystemTimeZoneById(tenant.TimeZone);
        return b.Passengers.Where(p => p.Status == "CONFIRMED").OrderBy(p => p.Id).Select(p => new RbTripStatusRow(b.Pnr, p.BoardingStatus, p.SeatCode,
            p.BoardingStatusAt is { } at ? TimeZoneInfo.ConvertTimeFromUtc(at, zone).ToString("yyyy-MM-dd HH:mm:ss") : null)).ToList();
    }

    public async Task<OtaInventory> EnsureInventoryAsync(long tripId, int from, int to)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($@"
INSERT INTO ota_inventories (tenant_id, trip_id, from_seq, to_seq, created_at)
VALUES ({T}, {tripId}, {from}, {to}, {clock.GetUtcNow().UtcDateTime})
ON CONFLICT (trip_id, from_seq, to_seq) DO NOTHING");
        return await db.OtaInventories.AsNoTracking().FirstAsync(i => i.TripId == tripId && i.FromSeq == from && i.ToSeq == to);
    }

    private static RbPoint Point(Trip trip, RouteStage s) => new(s.Id, s.Name, s.Name, TripClock.Fmt(TripClock.Local(trip.TravelDate, s.Day, s.Time)), s.Prime,
        s.Address ?? "", s.ContactNumber ?? "", s.Landmark ?? "", s.Lat, s.Lng);

    private sealed record RouteMeta(bool Ac, bool Seater, bool Sleeper, string BusRoutes);

    private RouteMeta Meta(Route route, Tenant tenant)
    {
        var seats = route.CoachTemplate!.Seats;
        var names = route.Stops.OrderBy(s => s.Sequence).Select(s => s.City?.Name ?? s.CityId.ToString());
        return new RouteMeta(route.CoachTemplate.IsAc, seats.Any(s => s.SeatType == "seater"), seats.Any(s => s.SeatType == "sleeper"), string.Join('-', names));
    }
}
