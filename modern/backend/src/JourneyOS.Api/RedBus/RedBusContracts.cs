using System.Text.Json.Serialization;

namespace JourneyOS.Api.RedBus;

// Field names follow "Sample Integration Docs (1).docx" exactly. Ambiguities are recorded in
// docs/modernization/REDBUS_CONTRACT_MATRIX.md and must be confirmed with RedBus before go-live.

public sealed record RbPoint(
    [property: JsonPropertyName("bpId")] long BpId,
    [property: JsonPropertyName("bpName")] string BpName,
    [property: JsonPropertyName("location")] string Location,
    [property: JsonPropertyName("time")] string Time,
    [property: JsonPropertyName("prime")] bool Prime,
    [property: JsonPropertyName("address")] string Address,
    [property: JsonPropertyName("contactNumber")] string ContactNumber,
    [property: JsonPropertyName("landmark")] string Landmark,
    [property: JsonPropertyName("latitude")] decimal? Latitude,
    [property: JsonPropertyName("longitude")] decimal? Longitude);

public sealed record RbFareDetail(
    [property: JsonPropertyName("baseFare")] decimal BaseFare,
    [property: JsonPropertyName("totalFare")] decimal TotalFare);

public sealed class RbTrip
{
    [JsonPropertyName("id")] public long Id { get; init; }
    [JsonPropertyName("travels")] public string Travels { get; init; } = "";
    [JsonPropertyName("vehicleType")] public string VehicleType { get; init; } = "";
    [JsonPropertyName("busType")] public string BusType { get; init; } = "";
    [JsonPropertyName("operator")] public long Operator { get; init; }
    [JsonPropertyName("routeId")] public long RouteId { get; init; }
    [JsonPropertyName("doj")] public string Doj { get; init; } = "";
    [JsonPropertyName("departureTime")] public string DepartureTime { get; init; } = "";
    [JsonPropertyName("arrivalTime")] public string ArrivalTime { get; init; } = "";
    [JsonPropertyName("boardingTimes")] public List<RbPoint> BoardingTimes { get; init; } = [];
    [JsonPropertyName("droppingTimes")] public List<RbPoint> DroppingTimes { get; init; } = [];
    [JsonPropertyName("availableSeats")] public int AvailableSeats { get; init; }
    [JsonPropertyName("fares")] public List<decimal> Fares { get; init; } = [];
    [JsonPropertyName("fareDetails")] public List<RbFareDetail> FareDetails { get; init; } = [];
    [JsonPropertyName("cancellationPolicy")] public string CancellationPolicy { get; init; } = "";
    [JsonPropertyName("partialCancellationAllowed")] public bool PartialCancellationAllowed { get; init; }
    [JsonPropertyName("source")] public long Source { get; init; }
    [JsonPropertyName("destination")] public long Destination { get; init; }
    [JsonPropertyName("bookable")] public bool Bookable { get; init; }
    [JsonPropertyName("serviceId")] public string ServiceId { get; init; } = "";
    [JsonPropertyName("maxSeatsPerTicket")] public int MaxSeatsPerTicket { get; init; }
    [JsonPropertyName("avlWindowSeats")] public int AvlWindowSeats { get; init; }
    [JsonPropertyName("busRoutes")] public string BusRoutes { get; init; } = "";
    [JsonPropertyName("singleLadies")] public bool SingleLadies { get; init; }
    [JsonPropertyName("ac")] public bool Ac { get; init; }
    [JsonPropertyName("nonAC")] public bool NonAc { get; init; }
    [JsonPropertyName("seater")] public bool Seater { get; init; }
    [JsonPropertyName("sleeper")] public bool Sleeper { get; init; }
    [JsonPropertyName("primaryPaxCancellable")] public bool PrimaryPaxCancellable { get; init; }
    // The sample lists both "ac" and "AC"; both are emitted until RedBus confirms which one is read.
    [JsonPropertyName("AC")] public bool AcUpper { get; init; }
}

public sealed class RbSearchResponse
{
    [JsonPropertyName("availableTrips")] public List<RbTrip> AvailableTrips { get; init; } = [];
}

public sealed record RbSeat(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("row")] int Row,
    [property: JsonPropertyName("column")] int Column,
    [property: JsonPropertyName("zIndex")] int ZIndex,
    [property: JsonPropertyName("length")] int Length,
    [property: JsonPropertyName("width")] int Width,
    [property: JsonPropertyName("fare")] decimal Fare,
    [property: JsonPropertyName("baseFare")] decimal BaseFare,
    [property: JsonPropertyName("available")] bool Available,
    [property: JsonPropertyName("ladiesSeat")] bool LadiesSeat,
    [property: JsonPropertyName("malesSeat")] bool MalesSeat);

public sealed class RbSeatLayoutResponse
{
    [JsonPropertyName("seats")] public List<RbSeat> Seats { get; init; } = [];
    [JsonPropertyName("travels")] public string Travels { get; init; } = "";
    [JsonPropertyName("busType")] public string BusType { get; init; } = "";
    [JsonPropertyName("operator")] public long Operator { get; init; }
    [JsonPropertyName("routeId")] public long RouteId { get; init; }
    [JsonPropertyName("doj")] public string Doj { get; init; } = "";
    [JsonPropertyName("departureTime")] public string DepartureTime { get; init; } = "";
    [JsonPropertyName("arrivalTime")] public string ArrivalTime { get; init; } = "";
    [JsonPropertyName("boardingTimes")] public List<RbPoint> BoardingTimes { get; init; } = [];
    [JsonPropertyName("droppingTimes")] public List<RbPoint> DroppingTimes { get; init; } = [];
    [JsonPropertyName("cancellationPolicy")] public string CancellationPolicy { get; init; } = "";
    [JsonPropertyName("maxSeatsPerTicket")] public int MaxSeatsPerTicket { get; init; }
    [JsonPropertyName("avlWindowSeats")] public int AvlWindowSeats { get; init; }
    [JsonPropertyName("busRoutes")] public string BusRoutes { get; init; } = "";
    [JsonPropertyName("ac")] public bool Ac { get; init; }
    [JsonPropertyName("nonAC")] public bool NonAc { get; init; }
    [JsonPropertyName("seater")] public bool Seater { get; init; }
    [JsonPropertyName("sleeper")] public bool Sleeper { get; init; }
    [JsonPropertyName("primaryPaxCancellable")] public bool PrimaryPaxCancellable { get; init; }
    [JsonPropertyName("AC")] public bool AcUpper { get; init; }
}

public sealed class RbPassenger
{
    [JsonPropertyName("name")] public string? Name { get; init; }
    [JsonPropertyName("mobile")] public string? Mobile { get; init; }
    [JsonPropertyName("title")] public string? Title { get; init; }
    [JsonPropertyName("email")] public string? Email { get; init; }
    [JsonPropertyName("age")] public int Age { get; init; }
    [JsonPropertyName("gender")] public string? Gender { get; init; }
    [JsonPropertyName("address")] public string? Address { get; init; }
    [JsonPropertyName("idType")] public string? IdType { get; init; }
    [JsonPropertyName("idNumber")] public string? IdNumber { get; init; }
    [JsonPropertyName("primary")] public bool Primary { get; init; }
}

public sealed class RbInventoryItem
{
    [JsonPropertyName("seatName")] public string? SeatName { get; init; }
    [JsonPropertyName("fare")] public decimal Fare { get; init; }
    [JsonPropertyName("ladiesSeat")] public bool LadiesSeat { get; init; }
    [JsonPropertyName("passenger")] public RbPassenger? Passenger { get; init; }
}

public sealed class RbBlockRequest
{
    // Sample uses "Inventoryid"; binding is case-insensitive so "inventoryId" is also accepted.
    [JsonPropertyName("Inventoryid")] public long InventoryId { get; init; }
    [JsonPropertyName("boardingPointId")] public long BoardingPointId { get; init; }
    [JsonPropertyName("droppingPointId")] public long DroppingPointId { get; init; }
    [JsonPropertyName("source")] public long Source { get; init; }
    [JsonPropertyName("destination")] public long Destination { get; init; }
    [JsonPropertyName("inventoryItems")] public List<RbInventoryItem>? InventoryItems { get; init; }
}

public sealed record RbFareBreakup(
    [property: JsonPropertyName("fare")] decimal Fare,
    [property: JsonPropertyName("baseFare")] decimal BaseFare,
    [property: JsonPropertyName("gst")] decimal Gst,
    [property: JsonPropertyName("passenger_type")] string PassengerType);

public sealed record RbBlockResponse(
    [property: JsonPropertyName("blockKey")] string BlockKey,
    [property: JsonPropertyName("currency")] string Currency,
    [property: JsonPropertyName("totalFare")] string TotalFare,
    [property: JsonPropertyName("fareBreakupList")] List<RbFareBreakup> FareBreakupList);

public sealed class RbConfirmRequest
{
    [JsonPropertyName("Blockkey")] public string? BlockKey { get; init; }
    [JsonPropertyName("Fare")] public decimal Fare { get; init; }
}

public sealed record RbConfirmResponse(
    [property: JsonPropertyName("pnr")] string Pnr,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("dateOfIssue")] string DateOfIssue,
    [property: JsonPropertyName("travels")] string Travels,
    [property: JsonPropertyName("busType")] string BusType,
    [property: JsonPropertyName("refundAmount")] decimal RefundAmount,
    [property: JsonPropertyName("cancellationCharges")] decimal CancellationCharges,
    [property: JsonPropertyName("cancellationPolicy")] string CancellationPolicy);

public sealed class RbCancelRequest
{
    [JsonPropertyName("pnr")] public string? Pnr { get; init; }
    [JsonPropertyName("seatsToCancel")] public List<string>? SeatsToCancel { get; init; }
    [JsonPropertyName("notes")] public string? Notes { get; init; }
}

public sealed record RbCancelResponse(
    [property: JsonPropertyName("cancellationCharge")] decimal CancellationCharge,
    [property: JsonPropertyName("refundAmount")] decimal RefundAmount,
    [property: JsonPropertyName("pnr")] string Pnr,
    [property: JsonPropertyName("Dateofcancel")] string DateOfCancel,
    [property: JsonPropertyName("cancellationPolicy")] string CancellationPolicy);

public sealed record RbCity(
    [property: JsonPropertyName("id")] long Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("countryId")] long CountryId,
    [property: JsonPropertyName("countryName")] string CountryName,
    [property: JsonPropertyName("locationType")] string LocationType);

public sealed record RbCities([property: JsonPropertyName("cities")] List<RbCity> Cities);

public sealed class RbTicketPassengerItem
{
    [JsonPropertyName("seatName")] public string SeatName { get; init; } = "";
    [JsonPropertyName("fare")] public decimal Fare { get; init; }
    [JsonPropertyName("ladiesSeat")] public bool LadiesSeat { get; init; }
    [JsonPropertyName("passenger")] public RbTicketPassenger Passenger { get; init; } = new();
}

public sealed class RbTicketPassenger
{
    [JsonPropertyName("name")] public string Name { get; init; } = "";
    [JsonPropertyName("mobile")] public string? Mobile { get; init; }
    [JsonPropertyName("title")] public string? Title { get; init; }
    [JsonPropertyName("email")] public string? Email { get; init; }
    [JsonPropertyName("age")] public int Age { get; init; }
    [JsonPropertyName("gender")] public string Gender { get; init; } = "";
    [JsonPropertyName("idType")] public string? IdType { get; init; }
    [JsonPropertyName("idNumber")] public string? IdNumber { get; init; }
    [JsonPropertyName("address")] public string? Address { get; init; }
    [JsonPropertyName("primary")] public bool Primary { get; init; }
    [JsonPropertyName("nationality")] public string? Nationality { get; init; }
    [JsonPropertyName("passengerType")] public string PassengerType { get; init; } = "ALL";
    // GDS extension (not in sample): per-seat status so partially cancelled tickets are unambiguous.
    [JsonPropertyName("status")] public string Status { get; init; } = "";
}

public sealed class RbTicketResponse
{
    [JsonPropertyName("pnr")] public string Pnr { get; init; } = "";
    [JsonPropertyName("inventoryItems")] public List<RbTicketPassengerItem> InventoryItems { get; init; } = [];
    [JsonPropertyName("inventoryId")] public long InventoryId { get; init; }
    [JsonPropertyName("doj")] public string Doj { get; init; } = "";
    [JsonPropertyName("sourceCityId")] public long SourceCityId { get; init; }
    [JsonPropertyName("pickupLocationId")] public long PickupLocationId { get; init; }
    [JsonPropertyName("pickupLocation")] public string PickupLocation { get; init; } = "";
    [JsonPropertyName("pickUpLocationAddress")] public string PickUpLocationAddress { get; init; } = "";
    [JsonPropertyName("pickupLocationLandmark")] public string PickupLocationLandmark { get; init; } = "";
    [JsonPropertyName("pickUpContactNo")] public string PickUpContactNo { get; init; } = "";
    [JsonPropertyName("pickupTime")] public int PickupTime { get; init; }
    [JsonPropertyName("dropLocationId")] public long DropLocationId { get; init; }
    [JsonPropertyName("dropLocation")] public string DropLocation { get; init; } = "";
    [JsonPropertyName("dropLocationAddress")] public string DropLocationAddress { get; init; } = "";
    [JsonPropertyName("dropLocationLandmark")] public string DropLocationLandmark { get; init; } = "";
    [JsonPropertyName("dropTime")] public int DropTime { get; init; }
    [JsonPropertyName("destinationCityId")] public long DestinationCityId { get; init; }
    [JsonPropertyName("cancellationPolicy")] public string CancellationPolicy { get; init; } = "";
    [JsonPropertyName("partialCancellationAllowed")] public bool PartialCancellationAllowed { get; init; }
    [JsonPropertyName("status")] public string Status { get; init; } = "";
    [JsonPropertyName("dateOfIssue")] public string DateOfIssue { get; init; } = "";
    [JsonPropertyName("travels")] public string Travels { get; init; } = "";
    [JsonPropertyName("busType")] public string BusType { get; init; } = "";
    [JsonPropertyName("refundAmount")] public decimal RefundAmount { get; init; }
    [JsonPropertyName("cancellationCharges")] public decimal CancellationCharges { get; init; }
    [JsonPropertyName("dateOfCancellation")] public string? DateOfCancellation { get; init; }
    [JsonPropertyName("primeDepartureTime")] public int PrimeDepartureTime { get; init; }
    [JsonPropertyName("sourceCity")] public string SourceCity { get; init; } = "";
    [JsonPropertyName("destinationCity")] public string DestinationCity { get; init; } = "";
    [JsonPropertyName("totalFare")] public decimal TotalFare { get; init; }
}

public sealed class RbUpdateRequest
{
    [JsonPropertyName("pnr")] public string? Pnr { get; init; }
    [JsonPropertyName("mobile_number")] public string? MobileNumber { get; init; }
    [JsonPropertyName("boarding_at")] public long? BoardingAt { get; init; }
    [JsonPropertyName("drop_off")] public long? DropOff { get; init; }
}

public sealed record RbStatusMessage(
    [property: JsonPropertyName("status")] bool Status,
    [property: JsonPropertyName("message")] string Message);

public sealed class RbTripStatusRequest
{
    [JsonPropertyName("pnr")] public string? Pnr { get; init; }
    [JsonPropertyName("Operator_id")] public string? OperatorId { get; init; }
}

public sealed record RbTripStatusRow(
    [property: JsonPropertyName("pnr_number")] string PnrNumber,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("seat_number")] string SeatNumber,
    [property: JsonPropertyName("time")] string? Time);

public sealed class RbReleaseRequest
{
    [JsonPropertyName("blockKey")] public string? BlockKey { get; init; }
    [JsonPropertyName("seatNos")] public List<string>? SeatNos { get; init; }
}

public sealed record RbError(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("errorCode")] string ErrorCode,
    [property: JsonPropertyName("message")] string Message);
