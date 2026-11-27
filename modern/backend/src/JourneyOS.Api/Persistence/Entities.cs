namespace JourneyOS.Api.Persistence;

// ---------- Tenancy ----------
public sealed class Tenant
{
    public long Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>Operator id exposed to OTAs ("operator" field in RedBus search).</summary>
    public long OperatorId { get; set; }
    public string TimeZone { get; set; } = "Asia/Kolkata";
    public decimal GstPercent { get; set; } = 5m;
}

public interface ITenantOwned { long TenantId { get; set; } }

// ---------- Master data ----------
public sealed class City : ITenantOwned
{
    public long Id { get; set; }            // legacy / externally published city id
    public long TenantId { get; set; }
    public string Name { get; set; } = "";
    public string? State { get; set; }
    public long CountryId { get; set; } = 1;
    public string CountryName { get; set; } = "India";
    public decimal? Lat { get; set; }
    public decimal? Lng { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class CoachTemplate : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Name { get; set; } = "";
    public string BusType { get; set; } = "";
    public string Pattern { get; set; } = "";      // 2+1 / 2+2
    public bool IsAc { get; set; }
    public string Status { get; set; } = "active";
    public string AmenitiesJson { get; set; } = "[]";   // jsonb string[]
    public List<CoachSeat> Seats { get; set; } = [];
}

public sealed class CoachSeat
{
    public long Id { get; set; }
    public long CoachTemplateId { get; set; }
    public string Code { get; set; } = "";
    public string Deck { get; set; } = "LOWER";    // LOWER / UPPER
    public int Row { get; set; }
    public int Col { get; set; }
    public int Width { get; set; } = 1;
    public int Length { get; set; } = 1;
    public string SeatType { get; set; } = "seater"; // seater / sleeper
    public bool IsWindow { get; set; }
    /// <summary>Fare class used by the fare matrix: seater, sleeper_lower, sleeper_upper.</summary>
    public string FareClass => SeatType == "sleeper" ? (Deck == "UPPER" ? "sleeper_upper" : "sleeper_lower") : "seater";
}

public sealed class Route : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string ServiceNumber { get; set; } = "";
    public string Name { get; set; } = "";
    public long CoachTemplateId { get; set; }
    public CoachTemplate? CoachTemplate { get; set; }
    public TimeOnly DepartureTime { get; set; }
    public string Status { get; set; } = "active";
    // Legacy route header (routes list card). Nullable: routes created outside the import simply have no value.
    public string? AltName { get; set; }
    public TimeOnly? ArrivalTime { get; set; }
    public int? ArrivalDay { get; set; }
    public int? DurationMinutes { get; set; }
    public decimal? DistanceKm { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public bool PartialCancellationAllowed { get; set; } = true;
    public bool PrimaryPaxCancellable { get; set; } = false;
    public int MaxSeatsPerTicket { get; set; } = 6;
    /// <summary>Update-ticket cutoff, minutes before boarding time.</summary>
    public int UpdateCutoffMinutes { get; set; } = 120;
    /// <summary>Legacy route General-tab settings kept in their legacy shape (jsonb): hub, business_rules {gents_next_to_ladies,
    /// ladies_next_to_gents, ladies_fill_doubles_first, seat_sharing, boarding_check}, call_settings, escalation_contacts, cabs,
    /// assignments [{vehicle_id, crew:[{staff_id, role}], pickup_vans}], tags {name: value}, run_pattern. Null = legacy defaults.</summary>
    public string? SettingsJson { get; set; }
    public List<RouteStop> Stops { get; set; } = [];
    public List<RouteStage> Stages { get; set; } = [];
    public List<RouteFare> Fares { get; set; } = [];
    public List<RefundSlab> RefundSlabs { get; set; } = [];
    public List<SeatFareRule> SeatFareRules { get; set; } = [];
    public List<RouteExpenseItem> ExpenseItems { get; set; } = [];
    public List<RouteSeatBlock> SeatBlocks { get; set; } = [];
}

/// <summary>
/// Legacy route.seat_blocks: a standing quota (crew berth, staff seats) applied to every departure of the route whose travel date
/// falls in [FromDate, ToDate]. Materialised as Blocked seat allocations (reason <c>route_block:{Id}</c>) when the block is saved
/// and when trips are generated, so the allocation table stays the single source of seat availability. AutoReleaseHours releases
/// the seats that many hours before departure (RouteBlockReleaser) so they can still be sold late.
/// </summary>
public sealed class RouteSeatBlock
{
    public long Id { get; set; }
    public long RouteId { get; set; }
    public string[] Seats { get; set; } = [];
    public string Reason { get; set; } = "";
    public DateOnly? FromDate { get; set; }
    public DateOnly? ToDate { get; set; }
    public int? AutoReleaseHours { get; set; }
    public string CreatedBy { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Per-trip cost estimate for a route (legacy route.expenses). Fixed items accrue every scheduled day (EMI, permit, insurance);
/// running items only when the trip runs. A recorded trip expense with the same key/label supersedes the estimate.
/// </summary>
public sealed class RouteExpenseItem
{
    public long Id { get; set; }
    public long RouteId { get; set; }
    public string Type { get; set; } = "running";   // fixed / running
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public decimal PerTrip { get; set; }
}

/// <summary>Ordered city on a route. Sequence defines segment boundaries.</summary>
public sealed class RouteStop
{
    public long Id { get; set; }
    public long RouteId { get; set; }
    public int Sequence { get; set; }
    public long CityId { get; set; }
    public City? City { get; set; }
    public int Day { get; set; } = 1;
    public TimeOnly Time { get; set; }
}

/// <summary>Boarding (pickup) or dropping point.</summary>
public sealed class RouteStage
{
    public long Id { get; set; }                   // legacy stage id, published as bpId
    public long RouteId { get; set; }
    public long CityId { get; set; }
    public int StopSequence { get; set; }
    public string Kind { get; set; } = "pickup";   // pickup / drop
    public string Name { get; set; } = "";
    public string? Address { get; set; }
    public string? Landmark { get; set; }
    public string? ContactNumber { get; set; }
    public decimal? Lat { get; set; }
    public decimal? Lng { get; set; }
    public int Day { get; set; } = 1;
    public TimeOnly Time { get; set; }
    public bool Prime { get; set; }
    // Legacy free-metro pickup: passengers ride the metro to an interchange station and board the bus there.
    public string? PickupType { get; set; }        // e.g. "Metro"
    public string? ExchangePoint { get; set; }
    public TimeOnly? ExchangeTime { get; set; }
    public string? MetroDescription { get; set; }
}

public sealed class RouteFare
{
    public long Id { get; set; }
    public long RouteId { get; set; }
    public int FromSequence { get; set; }
    public int ToSequence { get; set; }
    public decimal Seater { get; set; }
    public decimal SleeperLower { get; set; }
    public decimal SleeperUpper { get; set; }
}

public sealed class RefundSlab
{
    public long Id { get; set; }
    public long RouteId { get; set; }
    public int HoursBefore { get; set; }
    public decimal RefundPercent { get; set; }
}

public sealed class SeatFareRule
{
    public long Id { get; set; }
    public long RouteId { get; set; }
    public string Kind { get; set; } = "amount"; // amount / percent
    public string Label { get; set; } = "";
    public string[] Seats { get; set; } = [];
    public string[] Days { get; set; } = [];
    public decimal Value { get; set; }
}

// ---------- Operations ----------
public sealed class Trip : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long RouteId { get; set; }
    public Route? Route { get; set; }
    public DateOnly TravelDate { get; set; }
    public string Status { get; set; } = "active";  // active / cancelled / completed
    public bool Bookable { get; set; } = true;
    // Daily Ops trip record (legacy schedule fields). Null = not recorded; never estimated.
    public TimeOnly? DepartureTime { get; set; }   // trip-level override of the route departure
    public string? TripStatus { get; set; }         // scheduled / running / completed
    public decimal? Km { get; set; }                // GPS km reported for the trip
    public decimal? FuelL { get; set; }             // fuel litres reported for the trip
    public int? DelayMinutes { get; set; }
    public string? TelemetryJson { get; set; }      // driving_score, hard_brake, harsh_accel, over_speed, idling, max_speed_kmh ... as received
    public string? StopEventsJson { get; set; }     // per-stage GPS stop stamps as received
    /// <summary>Legacy schedule.fare_override: per-trip segment fare matrix (JSON list of TripFare). Null = follow route fares.</summary>
    public string? FareOverrideJson { get; set; }
    public DateTime? FareOverrideAt { get; set; }
    /// <summary>Legacy schedule.pnl_expense_version: optimistic-concurrency counter for the Trip P&amp;L expense editor.</summary>
    public int PnlExpenseVersion { get; set; }
    public DateTime? DeletedAt { get; set; }
    /// <summary>Legacy schedule.delay_reason (operator-entered reason for the current timing change).</summary>
    public string? DelayReason { get; set; }
    /// <summary>Legacy schedule.sync_with_route. False once the trip carries its own assignment / call / cab overrides.</summary>
    public bool SyncWithRoute { get; set; } = true;
    /// <summary>Legacy schedule.update_v51 (call_settings / escalation_contacts / cab_mode overrides), jsonb. Null = follow route.</summary>
    public string? UpdateSettingsJson { get; set; }
}

/// <summary>One per-trip segment fare (legacy fare_override row), keyed by route stop sequence.</summary>
public sealed record TripFare(int FromSequence, int ToSequence, decimal Seater, decimal SleeperLower, decimal SleeperUpper);

public enum AllocationKind { Hold = 1, Booked = 2, Blocked = 3 }

/// <summary>
/// One physical seat occupied on [FromSeq, ToSeq) of a trip. A PostgreSQL exclusion constraint
/// guarantees that two active allocations of the same seat never overlap in segment.
/// </summary>
public sealed class SeatAllocation : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long TripId { get; set; }
    public long CoachSeatId { get; set; }
    public string SeatCode { get; set; } = "";
    public int FromSeq { get; set; }
    public int ToSeq { get; set; }
    public AllocationKind Kind { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Gender { get; set; }
    public long? HoldId { get; set; }
    public long? BookingPassengerId { get; set; }
    public string? Reason { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ReleasedAt { get; set; }
}

public enum HoldStatus { Held = 1, Confirmed = 2, Released = 3, Expired = 4 }

public sealed class SeatHold : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string BlockKey { get; set; } = "";
    public string Channel { get; set; } = "redbus";
    public long TripId { get; set; }
    public long InventoryId { get; set; }
    public long BoardingStageId { get; set; }
    public long DroppingStageId { get; set; }
    public int FromSeq { get; set; }
    public int ToSeq { get; set; }
    public HoldStatus Status { get; set; } = HoldStatus.Held;
    public DateTime ExpiresAt { get; set; }
    public decimal TotalFare { get; set; }
    public string Currency { get; set; } = "INR";
    public DateTime CreatedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public List<HoldPassenger> Passengers { get; set; } = [];
}

public sealed class HoldPassenger
{
    public long Id { get; set; }
    public long HoldId { get; set; }
    public long CoachSeatId { get; set; }
    public string SeatCode { get; set; } = "";
    public decimal Fare { get; set; }
    public decimal BaseFare { get; set; }
    public decimal Gst { get; set; }
    public bool LadiesSeat { get; set; }
    public string Name { get; set; } = "";
    public string? Mobile { get; set; }
    public string? Title { get; set; }
    public string? Email { get; set; }
    public int Age { get; set; }
    public string Gender { get; set; } = "";
    public string? Address { get; set; }
    public string? IdType { get; set; }
    public string? IdNumber { get; set; }
    public bool IsPrimary { get; set; }
}

public sealed class Booking : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Pnr { get; set; } = "";
    public long TripId { get; set; }
    public Trip? Trip { get; set; }
    public long? HoldId { get; set; }            // unique → one booking per blockKey
    public long? InventoryId { get; set; }
    public string Channel { get; set; } = "redbus";
    public string Status { get; set; } = "CONFIRMED"; // CONFIRMED / PARTIALLY_CANCELLED / CANCELLED
    public long BoardingStageId { get; set; }
    public long DroppingStageId { get; set; }
    public int FromSeq { get; set; }
    public int ToSeq { get; set; }
    public string? ContactMobile { get; set; }
    public string? ContactEmail { get; set; }
    /// <summary>Contact person when edited separately from the primary passenger (legacy booking.contact.name).</summary>
    public string? ContactName { get; set; }
    public decimal TotalFare { get; set; }
    public string Currency { get; set; } = "INR";
    public string CancellationPolicy { get; set; } = "";
    public DateTime DateOfIssue { get; set; }
    public DateTime? DateOfCancellation { get; set; }
    public string? BookedBy { get; set; }      // principal who created a counter/agent booking
    public string? AgentPhone { get; set; }    // agent channel attribution (ledger agent:{phone})
    public List<BookingPassenger> Passengers { get; set; } = [];
}

public sealed class BookingPassenger
{
    public long Id { get; set; }
    public long BookingId { get; set; }
    public long CoachSeatId { get; set; }
    public string SeatCode { get; set; } = "";
    public decimal Fare { get; set; }
    public decimal BaseFare { get; set; }
    public decimal Gst { get; set; }
    public bool LadiesSeat { get; set; }
    public string Name { get; set; } = "";
    public string? Mobile { get; set; }
    public string? Title { get; set; }
    public string? Email { get; set; }
    public int Age { get; set; }
    public string Gender { get; set; } = "";
    public string? Address { get; set; }
    public string? IdType { get; set; }
    public string? IdNumber { get; set; }
    public bool IsPrimary { get; set; }
    public string Status { get; set; } = "CONFIRMED"; // CONFIRMED / CANCELLED
    public string BoardingStatus { get; set; } = "Yet-To-Board"; // Boarded / No-Show / Yet-To-Board / Checked-In / Dropped
    public DateTime? BoardingStatusAt { get; set; }
    public string? CallStatus { get; set; }                       // to_call / called / not_reachable (legacy p.call_status)
    public string? SeatUpgradeJson { get; set; }                  // legacy p.seat_upgrade (v39 loyalty offer/apply/decline)
    public decimal CancellationCharge { get; set; }
    public decimal RefundAmount { get; set; }
    public DateTime? CancelledAt { get; set; }
}

public sealed class Cancellation : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long BookingId { get; set; }
    public string[] Seats { get; set; } = [];
    public decimal Charge { get; set; }
    public decimal Refund { get; set; }
    public string Reason { get; set; } = "customer"; // customer / bus_cancellation / shift
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>Refund obligation. Kept separate from cancellation and from settlement.</summary>
public sealed class Refund : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long CancellationId { get; set; }
    public decimal Amount { get; set; }
    public string Status { get; set; } = "PENDING_SETTLEMENT"; // settled via OTA invoice reconciliation
    public DateTime CreatedAt { get; set; }
}

/// <summary>Published OTA inventory: a (trip, boarding-city, dropping-city) segment.</summary>
public sealed class OtaInventory : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long TripId { get; set; }
    public int FromSeq { get; set; }
    public int ToSeq { get; set; }
    public DateTime CreatedAt { get; set; }
}

// ---------- Integration ----------
public sealed class OtaProviderConfig : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Provider { get; set; } = "REDBUS";
    public string OperatorCode { get; set; } = "";
    /// <summary>Verified callback endpoint. Null ⇒ outbound delivery is disabled.</summary>
    public string? CallbackUrl { get; set; }
    public bool OutboundEnabled { get; set; }
    public DateTime? LastSuccessfulSyncAt { get; set; }
}

/// <summary>
/// Pending → Delivering → Acknowledged | Pending (retry) | Failed (exhausted) | Blocked (ambiguous, needs operator)
/// | Superseded (a newer pending message carries the same logical notification).
/// </summary>
public enum OutboxStatus { Pending = 1, Delivering = 2, Acknowledged = 3, Failed = 4, Blocked = 5, Superseded = 6 }

public sealed class OutboxMessage : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Provider { get; set; } = "REDBUS";
    public string ActionType { get; set; } = "";
    public string DedupKey { get; set; } = "";
    public string PayloadJson { get; set; } = "{}";
    public OutboxStatus Status { get; set; } = OutboxStatus.Pending;
    public int Attempts { get; set; }
    public DateTime NextAttemptAt { get; set; }
    public int? LastHttpStatus { get; set; }
    public string? LastError { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? AcknowledgedAt { get; set; }
}

public sealed class OutboxAttempt
{
    public long Id { get; set; }
    public long OutboxMessageId { get; set; }
    public DateTime At { get; set; }
    public int? HttpStatus { get; set; }
    public string? ResponseBody { get; set; }
    public string? Error { get; set; }
    public bool Acknowledged { get; set; }
}

public sealed class AuditLog : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public string Actor { get; set; } = "";
    public string Action { get; set; } = "";
    public string Entity { get; set; } = "";
    public string EntityId { get; set; } = "";
    public string? DataJson { get; set; }
    public DateTime At { get; set; }
}

/// <summary>Staff comment on a booking (legacy bookings[].comments: {text, by, at}).</summary>
public sealed class BookingComment : ITenantOwned
{
    public long Id { get; set; }
    public long TenantId { get; set; }
    public long BookingId { get; set; }
    public string Text { get; set; } = "";
    public string By { get; set; } = "";
    public DateTime At { get; set; }
}
