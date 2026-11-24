using System.Text.Json;
using JourneyOS.Api.Inventory;
using JourneyOS.Api.Persistence;
using JourneyOS.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Admin;

public sealed record BookingEditInput(string? Mobile, long? BoardingAt, long? DropOff);
public sealed record BookingCommentInput(string Text);
public sealed record BookingCancelInput(List<string> Seats, string Reason, string Notes);

/// <summary>
/// Native React booking workspace. Uses the existing authoritative .NET
/// InventoryService for edits, shift and cancellation; never bypasses PG
/// seat-allocation exclusion constraints or settles a refund prematurely.
/// </summary>
public static class BookingWorkspaceEndpoints
{
    public static void MapBookingWorkspace(this IEndpointRouteBuilder app)
    {
        var g=app.MapGroup("/api/admin").WithTags("Operator bookings");
        g.MapGet("/bookings", async (DateOnly date, string? q, int? take, GdsDbContext db) =>
        {
            var query = db.Bookings.AsNoTracking().Where(b => b.Trip!.TravelDate == date);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var needle = q.Trim();
                if (needle.Length > 80) return Results.BadRequest(new { message = "Search is too long" });
                var pattern = "%" + needle.Replace("%", @"\%").Replace("_", @"\_") + "%";
                query=query.Where(b => EF.Functions.ILike(b.Pnr,pattern) ||
                    b.Passengers.Any(p => EF.Functions.ILike(p.Name,pattern)));
            }
            var rows=await query.OrderByDescending(x => x.DateOfIssue)
                .Take(Math.Clamp(take ?? 100,1,250))
                .Select(b => new { b.Pnr,b.TripId,b.Channel,b.Status,b.TotalFare,b.DateOfIssue,
                    seatCount=b.Passengers.Count(p => p.Status=="CONFIRMED"),
                    passengers=b.Passengers.Select(p => new {
                        p.SeatCode,p.Name,p.Status,p.BoardingStatus
                    })}).ToArrayAsync();
            return Results.Ok(rows);
        }).RequireAuthorization(Policies.BookingDetail);

        g.MapGet("/bookings/{pnr}/workspace", async (string pnr, GdsDbContext db, HttpContext h) =>
        {
            h.Response.Headers.CacheControl="private, no-store";
            var b=await db.Bookings.AsNoTracking().Include(x => x.Passengers)
                .Include(x => x.Trip).ThenInclude(t => t!.Route).ThenInclude(r => r!.Stops).ThenInclude(s => s.City)
                .Include(x => x.Trip).ThenInclude(t => t!.Route).ThenInclude(r => r!.Stages)
                .Include(x => x.Trip).ThenInclude(t => t!.Route).ThenInclude(r => r!.CoachTemplate)
                .AsSplitQuery().FirstOrDefaultAsync(x => x.Pnr == pnr);
            if (b is null) return Results.NotFound(new { message = "PNR not found" });
            if (b.Trip?.Route is not { } route)
                return Results.Conflict(new { message = "Booking route reference is missing" });
            var from=route.Stops.FirstOrDefault(s => s.Sequence == b.FromSeq);
            var to=route.Stops.FirstOrDefault(s => s.Sequence == b.ToSeq);
            var board=route.Stages.FirstOrDefault(s => s.Id == b.BoardingStageId);
            var drop=route.Stages.FirstOrDefault(s => s.Id == b.DroppingStageId);
            var settlement=await db.Refunds.AsNoTracking()
                .Join(db.Cancellations.AsNoTracking(),r => r.CancellationId,c=>c.Id,(r,c)=>new{r,c})
                .Where(x => x.c.BookingId == b.Id)
                .Select(x => new { x.r.Amount,x.r.Status,x.r.CreatedAt,
                    x.c.Seats,x.c.Charge,x.c.Refund }).ToArrayAsync();
            return Results.Ok(new {
                b.Id,b.Pnr,b.Status,b.Channel,b.TripId,b.FromSeq,b.ToSeq,
                b.TotalFare,b.Currency,b.DateOfIssue,b.DateOfCancellation,b.CancellationPolicy,
                b.ContactMobile,b.ContactEmail,
                b.BoardingStageId,b.DroppingStageId,
                travelDate=b.Trip.TravelDate.ToString("yyyy-MM-dd"),
                routeId=route.Id,routeName=route.Name,serviceNumber=route.ServiceNumber,
                coachName=route.CoachTemplate?.Name,
                fromCity=from?.City?.Name ?? $"City #{from?.CityId}",
                toCity=to?.City?.Name ?? $"City #{to?.CityId}",
                fromCityId=from?.CityId,toCityId=to?.CityId,
                boarding=board is null ? null : new {board.Id,board.Name,board.Address,board.Landmark,
                    board.ContactNumber,board.Day,board.Time,board.StopSequence},
                dropping=drop is null ? null : new {drop.Id,drop.Name,drop.Address,drop.Landmark,
                    drop.ContactNumber,drop.Day,drop.Time,drop.StopSequence},
                availableBoarding=route.Stages.Where(s => s.Kind=="pickup"&&s.StopSequence==b.FromSeq)
                    .OrderBy(s=>s.Time).Select(s=>new{s.Id,s.Name,s.Day,s.Time}).ToArray(),
                availableDropping=route.Stages.Where(s => s.Kind=="drop"&&s.StopSequence==b.ToSeq)
                    .OrderBy(s=>s.Time).Select(s=>new{s.Id,s.Name,s.Day,s.Time}).ToArray(),
                passengers=b.Passengers.OrderBy(p=>p.Id).Select(p=>new {
                    p.Id,p.SeatCode,p.Name,p.Title,p.Gender,p.Age,p.Status,p.BoardingStatus,
                    p.Fare,p.BaseFare,p.Gst,p.IsPrimary,
                    p.CancellationCharge,p.RefundAmount,p.CancelledAt
                }).ToArray(),
                refunds=settlement
            });
        }).RequireAuthorization(Policies.BookingDetail);

        g.MapGet("/bookings/{pnr}/history", async (string pnr,GdsDbContext db) =>
        {
            var booking=await db.Bookings.AsNoTracking()
                .Where(b=>b.Pnr==pnr).Select(b=>new {b.Pnr,b.DateOfIssue}).FirstOrDefaultAsync();
            if(booking is null)return Results.NotFound(new {message="PNR not found"});
            var audit=await db.AuditLogs.AsNoTracking()
                .Where(a=>a.Entity=="booking"&&a.EntityId==pnr)
                .OrderBy(a=>a.At).ThenBy(a=>a.Id)
                .Select(a=>new {a.Id,a.At,a.Actor,a.Action,a.DataJson}).Take(300).ToArrayAsync();
            var events=new List<object> { new {
                id=0L,at=booking.DateOfIssue,actor="Booking system",action="BOOKING_CREATED",
                comment=(string?)null
            } };
            foreach(var a in audit)
            {
                string? comment=null;
                if(a.Action=="BOOKING_COMMENT")
                {
                    try
                    {
                        using var data=JsonDocument.Parse(a.DataJson);
                        if(data.RootElement.TryGetProperty("text",out var text))comment=text.GetString();
                    }
                    catch(JsonException) { /* malformed historical audit payload is not evidence */ }
                }
                events.Add(new { id=a.Id,at=a.At,actor=a.Actor,action=a.Action,comment });
            }
            return Results.Ok(events);
        }).RequireAuthorization(Policies.BookingDetail);

        g.MapGet("/bookings/{pnr}/shift-options", async (string pnr, DateOnly date,GdsDbContext db) =>
        {
            var original=await db.Bookings.AsNoTracking().Where(b=>b.Pnr==pnr)
                .Select(b=>new {b.FromSeq,b.ToSeq,b.TripId,b.Status}).FirstOrDefaultAsync();
            if(original is null)return Results.NotFound(new {message="PNR not found"});
            if(original.Status=="CANCELLED")return Results.Conflict(new {message="Cannot shift a cancelled ticket"});
            var trip=await db.Trips.AsNoTracking().FirstAsync(t=>t.Id==original.TripId);
            var stops=await db.RouteStops.AsNoTracking().Where(s=>s.RouteId==trip.RouteId)
                .ToArrayAsync();
            var from=stops.FirstOrDefault(s=>s.Sequence==original.FromSeq);
            var to=stops.FirstOrDefault(s=>s.Sequence==original.ToSeq);
            if(from is null||to is null)return Results.Conflict(new {message="Booking city segment not found"});
            var today=DateOnly.FromDateTime(DateTime.UtcNow);
            if(date<today || date>today.AddDays(120))
                return Results.BadRequest(new {message="Choose a future service date within 120 days"});
            var candidates=await db.Trips.AsNoTracking().Where(t=>t.TravelDate==date && t.Id!=trip.Id &&
                t.Status=="active"&&t.Bookable&&t.Route!.Status=="active" &&
                t.Route.Stops.Any(s=>s.CityId==from.CityId) &&
                t.Route.Stops.Any(s=>s.CityId==to.CityId))
                .Include(t=>t.Route).ThenInclude(r=>r!.Stops)
                .Include(t=>t.Route).ThenInclude(r=>r!.Stages)
                .Include(t=>t.Route).ThenInclude(r=>r!.CoachTemplate)
                .AsSplitQuery().Take(100).ToArrayAsync();
            var options=candidates.Select(t=>{
                var sorted=t.Route!.Stops.OrderBy(s=>s.Sequence).ToArray();
                var f=sorted.FirstOrDefault(s=>s.CityId==from.CityId);
                var dest=sorted.FirstOrDefault(s=>s.CityId==to.CityId&&s.Sequence>f?.Sequence);
                return new {t.Id,t.TravelDate,t.RouteId,serviceNumber=t.Route.ServiceNumber,
                    routeName=t.Route.Name,coachName=t.Route.CoachTemplate?.Name,
                    fromSequence=f?.Sequence,toSequence=dest?.Sequence,
                    departure=f?.Time.ToString("HH:mm"),
                    stagesOkay=f is not null&&dest is not null&&
                        t.Route.Stages.Any(s=>s.Kind=="pickup"&&s.StopSequence==f.Sequence) &&
                        t.Route.Stages.Any(s=>s.Kind=="drop"&&s.StopSequence==dest.Sequence)};
            }).Where(x=>x.stagesOkay).ToArray();
            return Results.Ok(options);
        }).RequireAuthorization(Policies.Operations);

        g.MapGet("/bookings/{pnr}/cancellation-quote", async (string pnr,string seats,
            GdsDbContext db) =>
        {
            var booking=await db.Bookings.AsNoTracking().Include(b=>b.Passengers)
                .FirstOrDefaultAsync(b=>b.Pnr==pnr);
            if(booking is null)return Results.NotFound(new {message="PNR not found"});
            var selected=seats.Split(',',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries)
                .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            if(selected.Length==0||selected.Length>12)
                return Results.BadRequest(new {message="Select 1–12 booked seats"});
            var current=booking.Passengers.Where(p=>p.Status=="CONFIRMED").ToArray();
            var targets=current.Where(p=>selected.Contains(p.SeatCode,StringComparer.OrdinalIgnoreCase)).ToArray();
            if(targets.Length!=selected.Length)
                return Results.Conflict(new {message="Selection contains a seat not confirmed on this PNR"});
            var trip=await db.Trips.AsNoTracking().FirstAsync(t=>t.Id==booking.TripId);
            var route=await db.Routes.AsNoTracking().Include(r=>r.Stages)
                .FirstAsync(r=>r.Id==trip.RouteId);
            if(targets.Length<current.Length && !route.PartialCancellationAllowed)
                return Results.Conflict(new {message="Partial cancellations are disabled on this route"});
            if(targets.Length<current.Length && targets.Any(p=>p.IsPrimary) && !route.PrimaryPaxCancellable)
                return Results.Conflict(new {message="Primary passenger may not be cancelled alone"});
            var boarding=route.Stages.First(s=>s.Id==booking.BoardingStageId);
            var tz=(await db.Tenants.AsNoTracking().FirstAsync(t=>t.Id==db.CurrentTenantId)).TimeZone;
            var boardTime=TripClock.ToUtc(TripClock.Local(trip.TravelDate,boarding.Day,boarding.Time),tz);
            var now=DateTime.UtcNow;
            if(boardTime<=now)return Results.Conflict(new {message="Boarding time has passed"});
            var chargePct=CancellationPolicy.ChargePercent(booking.CancellationPolicy,
                (boardTime-now).TotalHours);
            var breakdown=targets.Select(p=>{
                var charge=Math.Round(p.Fare*chargePct/100m,2,MidpointRounding.AwayFromZero);
                return new {p.SeatCode,p.Name,p.Fare,charge,refund=p.Fare-charge};
            }).ToArray();
            return Results.Ok(new {
                booking.Pnr,
                percent=chargePct,totalFare=breakdown.Sum(x=>x.Fare),
                charge=breakdown.Sum(x=>x.charge),refund=breakdown.Sum(x=>x.refund),
                breakdown,subjectToRevalidation=true,
                payoutStatus="PENDING_SETTLEMENT_IF_CONFIRMED"
            });
        }).RequireAuthorization(Policies.Operations);

        g.MapPut("/bookings/{pnr}/update",async(string pnr,BookingEditInput input,
            InventoryService service) =>
        {
            await service.UpdateAsync(pnr,input.Mobile,input.BoardingAt,input.DropOff);
            return Results.Ok(new{pnr,notice="Booking updated under route cutoff rules"});
        }).RequireAuthorization(Policies.Operations);

        g.MapPost("/bookings/{pnr}/comments",async(string pnr,BookingCommentInput input,
            GdsDbContext db,HttpContext h) =>
        {
            if(string.IsNullOrWhiteSpace(input.Text)||input.Text.Length>2000)
                return Results.BadRequest(new{message="Enter a staff note of up to 2000 characters"});
            if(!await db.Bookings.AnyAsync(b=>b.Pnr==pnr))
                return Results.NotFound(new{message="PNR not found"});
            db.AuditLogs.Add(new AuditLog{
                TenantId=db.CurrentTenantId,Actor=h.User.Identity?.Name??"operator",
                Action="BOOKING_COMMENT",Entity="booking",EntityId=pnr,
                DataJson=JsonSerializer.Serialize(new{text=input.Text.Trim()}),
                At=DateTime.UtcNow
            });
            await db.SaveChangesAsync();
            return Results.Ok(new{notice="Internal booking comment saved"});
        }).RequireAuthorization(Policies.Operations);

        g.MapPost("/bookings/{pnr}/cancel",async(string pnr,BookingCancelInput input,
            InventoryService service) =>
        {
            if(input.Seats is null || input.Seats.Count<1 ||
                input.Seats.Count>12 || input.Seats.Distinct(StringComparer.OrdinalIgnoreCase).Count()!=input.Seats.Count)
                return Results.BadRequest(new{message="Select distinct booked seats"});
            if(input.Reason is not ("customer" or "operator_request"))
                return Results.BadRequest(new{message="Invalid cancellation reason"});
            if(string.IsNullOrWhiteSpace(input.Notes)||input.Notes.Length>2000)
                return Results.BadRequest(new{message="A cancellation note/reason is required"});
            var result=await service.CancelAsync(pnr,input.Seats,input.Notes.Trim(),input.Reason);
            return Results.Ok(new{
                result.Booking.Pnr,result.Booking.Status,
                result.Charge,result.Refund,result.At,
                refundPaymentCompleted=false,
                refundObligation="PENDING_SETTLEMENT"
            });
        }).RequireAuthorization(Policies.Operations);
    }
}
