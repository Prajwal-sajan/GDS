using System.Text;
using Microsoft.EntityFrameworkCore;

namespace JourneyOS.Api.Persistence;

public interface ITenantContext
{
    long TenantId { get; }
}

public sealed class TenantContext : ITenantContext
{
    public long TenantId { get; set; }
}

public sealed class GdsDbContext(DbContextOptions<GdsDbContext> options, ITenantContext tenant) : DbContext(options)
{
    public long CurrentTenantId => tenant.TenantId;

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<City> Cities => Set<City>();
    public DbSet<CoachTemplate> CoachTemplates => Set<CoachTemplate>();
    public DbSet<CoachSeat> CoachSeats => Set<CoachSeat>();
    public DbSet<Route> Routes => Set<Route>();
    public DbSet<RouteStop> RouteStops => Set<RouteStop>();
    public DbSet<RouteStage> RouteStages => Set<RouteStage>();
    public DbSet<RouteFare> RouteFares => Set<RouteFare>();
    public DbSet<RefundSlab> RefundSlabs => Set<RefundSlab>();
    public DbSet<SeatFareRule> SeatFareRules => Set<SeatFareRule>();
    public DbSet<Trip> Trips => Set<Trip>();
    public DbSet<SeatAllocation> SeatAllocations => Set<SeatAllocation>();
    public DbSet<SeatHold> SeatHolds => Set<SeatHold>();
    public DbSet<HoldPassenger> HoldPassengers => Set<HoldPassenger>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<BookingPassenger> BookingPassengers => Set<BookingPassenger>();
    public DbSet<Cancellation> Cancellations => Set<Cancellation>();
    public DbSet<Refund> Refunds => Set<Refund>();
    public DbSet<OtaInventory> OtaInventories => Set<OtaInventory>();
    public DbSet<OtaProviderConfig> OtaProviders => Set<OtaProviderConfig>();
    public DbSet<OutboxMessage> Outbox => Set<OutboxMessage>();
    public DbSet<OutboxAttempt> OutboxAttempts => Set<OutboxAttempt>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<Staff> Staff => Set<Staff>();
    public DbSet<TripAssignment> TripAssignments => Set<TripAssignment>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<BookingFinance> BookingFinances => Set<BookingFinance>();
    public DbSet<OtaInvoice> OtaInvoices => Set<OtaInvoice>();
    public DbSet<OtaInvoiceLine> OtaInvoiceLines => Set<OtaInvoiceLine>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CrmNote> CrmNotes => Set<CrmNote>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<ChatBlock> ChatBlocks => Set<ChatBlock>();
    public DbSet<CallLog> CallLogs => Set<CallLog>();
    public DbSet<OtaRating> OtaRatings => Set<OtaRating>();
    public DbSet<LedgerEntry> LedgerEntries => Set<LedgerEntry>();
    public DbSet<TripExpense> TripExpenses => Set<TripExpense>();
    public DbSet<ComplianceDocument> ComplianceDocuments => Set<ComplianceDocument>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();
    public DbSet<Branch> Branches => Set<Branch>();
    public DbSet<SarathiConversation> SarathiConversations => Set<SarathiConversation>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasPostgresExtension("btree_gist");

        b.Entity<Vehicle>(e => { e.Property(x => x.Id).ValueGeneratedNever(); e.HasIndex(x => new { x.TenantId, x.RegistrationNumber }).IsUnique(); });
        b.Entity<Staff>(e => { e.Property(x => x.Id).ValueGeneratedNever(); e.HasIndex(x => new { x.TenantId, x.Phone }); });
        b.Entity<TripAssignment>(e =>
        {
            e.HasIndex(x => new { x.TripId, x.Role }).IsUnique().HasFilter("is_active");
            e.ToTable(t => t.HasCheckConstraint("ck_trip_assignments_kind", "(kind = 'vehicle' AND vehicle_id IS NOT NULL) OR (kind = 'staff' AND staff_id IS NOT NULL)"));
        });
        b.Entity<Payment>(e => e.HasIndex(x => x.BookingId));
        b.Entity<BookingFinance>(e => e.HasIndex(x => x.BookingId).IsUnique());
        b.Entity<OtaInvoice>(e =>
        {
            e.HasIndex(x => new { x.TenantId, x.Provider, x.Sha256 }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Provider, x.InvoiceNumber }).IsUnique();
            e.HasMany(x => x.Lines).WithOne().HasForeignKey(l => l.InvoiceId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<OtaInvoiceLine>(e => { e.HasIndex(x => new { x.InvoiceId, x.LineKey }).IsUnique(); e.HasIndex(x => x.Pnr); });

        b.Entity<Customer>(e => e.HasIndex(x => new { x.TenantId, x.Phone }).IsUnique());
        b.Entity<CrmNote>(e => e.HasIndex(x => new { x.TenantId, x.Phone }));
        b.Entity<ChatMessage>(e => { e.HasIndex(x => new { x.TenantId, x.ConversationId }); e.HasIndex(x => new { x.TenantId, x.Phone }); });
        b.Entity<ChatBlock>(e => e.HasIndex(x => new { x.TenantId, x.Phone }).IsUnique());
        b.Entity<CallLog>(e => { e.HasIndex(x => new { x.TenantId, x.Ts }); e.HasIndex(x => new { x.TenantId, x.Phone }); });
        b.Entity<OtaRating>(e => e.HasIndex(x => new { x.TenantId, x.RatedAt }));
        b.Entity<LedgerEntry>(e => { e.HasIndex(x => new { x.TenantId, x.ChannelKey }); e.ToTable(t => t.HasCheckConstraint("ck_ledger_entries_amount", "amount > 0")); });
        b.Entity<TripExpense>(e => { e.HasIndex(x => x.TripId); e.ToTable(t => t.HasCheckConstraint("ck_trip_expenses_amount", "amount >= 0")); });
        b.Entity<ComplianceDocument>(e => e.HasIndex(x => new { x.TenantId, x.ExpiryDate }));
        b.Entity<AppUser>(e => { e.ToTable("app_users"); e.HasIndex(x => new { x.TenantId, x.Phone }).IsUnique(); e.Property(x => x.CommissionPct).HasPrecision(5, 2); });
        b.Entity<UserSession>(e => { e.HasIndex(x => x.TokenSha256).IsUnique(); e.HasIndex(x => x.UserId); });
        b.Entity<Branch>(e => e.Property(x => x.Id).ValueGeneratedNever());
        b.Entity<SarathiConversation>(e => { e.Property(x => x.MessagesJson).HasColumnType("jsonb"); e.HasIndex(x => new { x.TenantId, x.Owner }); });

        b.Entity<Tenant>(e => { e.HasIndex(x => x.Code).IsUnique(); e.Property(x => x.GstPercent).HasPrecision(5, 2); });

        b.Entity<City>(e => { e.Property(x => x.Id).ValueGeneratedNever(); e.HasIndex(x => new { x.TenantId, x.Name }); });
        b.Entity<CoachTemplate>(e => e.Property(x => x.Id).ValueGeneratedNever());
        b.Entity<CoachSeat>(e => e.HasIndex(x => new { x.CoachTemplateId, x.Code }).IsUnique());

        b.Entity<Route>(e =>
        {
            e.Property(x => x.Id).ValueGeneratedNever();
            e.HasIndex(x => new { x.TenantId, x.ServiceNumber });
        });
        b.Entity<RouteStop>(e => e.HasIndex(x => new { x.RouteId, x.Sequence }).IsUnique());
        b.Entity<RouteStage>(e => { e.Property(x => x.Id).ValueGeneratedNever(); e.HasIndex(x => x.RouteId); });
        b.Entity<RouteFare>(e =>
        {
            e.HasIndex(x => new { x.RouteId, x.FromSequence, x.ToSequence }).IsUnique();
            e.ToTable(t => t.HasCheckConstraint("ck_route_fares_order", "from_sequence < to_sequence"));
        });

        b.Entity<Trip>(e =>
        {
            e.Property(x => x.Id).ValueGeneratedNever();
            e.HasIndex(x => new { x.TenantId, x.TravelDate });
            e.HasIndex(x => new { x.RouteId, x.TravelDate }).IsUnique();
        });

        b.Entity<SeatAllocation>(e =>
        {
            e.HasIndex(x => new { x.TripId, x.IsActive });
            e.HasIndex(x => x.HoldId);
            e.ToTable(t => t.HasCheckConstraint("ck_seat_allocations_segment", "from_seq < to_seq"));
            // Exclusion constraint (overlapping segment) is created in the migration via raw SQL.
        });

        b.Entity<SeatHold>(e =>
        {
            e.HasIndex(x => x.BlockKey).IsUnique();
            e.HasIndex(x => new { x.Status, x.ExpiresAt });
            e.HasMany(x => x.Passengers).WithOne().HasForeignKey(p => p.HoldId);
        });

        b.Entity<Booking>(e =>
        {
            e.HasIndex(x => x.Pnr).IsUnique();
            e.HasIndex(x => x.HoldId).IsUnique();     // duplicate confirmation guard
            e.HasIndex(x => x.TripId);
            e.HasMany(x => x.Passengers).WithOne().HasForeignKey(p => p.BookingId);
        });

        b.Entity<OtaInventory>(e => e.HasIndex(x => new { x.TripId, x.FromSeq, x.ToSeq }).IsUnique());
        b.Entity<OtaProviderConfig>(e => e.HasIndex(x => new { x.TenantId, x.Provider }).IsUnique());

        b.Entity<OutboxMessage>(e =>
        {
            e.ToTable("outbox_messages");
            // Coalesce: at most one *pending* message per logical notification. A message already being
            // delivered does not absorb newer changes, so no update is lost.
            e.HasIndex(x => new { x.Provider, x.DedupKey }).IsUnique().HasFilter("status = 1");
            e.HasIndex(x => new { x.Status, x.NextAttemptAt });
        });
        b.Entity<OutboxAttempt>(e => e.HasIndex(x => x.OutboxMessageId));
        b.Entity<AuditLog>(e => e.HasIndex(x => new { x.TenantId, x.Entity, x.EntityId }));

        foreach (var et in b.Model.GetEntityTypes())
        {
            foreach (var p in et.GetProperties().Where(p => p.ClrType == typeof(decimal) || p.ClrType == typeof(decimal?)))
                if (p.GetPrecision() is null) p.SetPrecision(12);
            foreach (var p in et.GetProperties().Where(p => p.ClrType == typeof(decimal) || p.ClrType == typeof(decimal?)))
                if (p.GetScale() is null) p.SetScale(p.Name is "Lat" or "Lng" ? 6 : 2);

            // Tenant isolation for every tenant-owned aggregate.
            if (typeof(ITenantOwned).IsAssignableFrom(et.ClrType))
            {
                var method = typeof(GdsDbContext).GetMethod(nameof(ApplyTenantFilter),
                    System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
                    .MakeGenericMethod(et.ClrType);
                method.Invoke(this, [b]);
            }
        }

        ApplySnakeCase(b);
    }

    private void ApplyTenantFilter<T>(ModelBuilder b) where T : class, ITenantOwned =>
        b.Entity<T>().HasQueryFilter(x => x.TenantId == CurrentTenantId);

    private static void ApplySnakeCase(ModelBuilder b)
    {
        foreach (var et in b.Model.GetEntityTypes())
        {
            et.SetTableName(Snake(et.GetTableName()!));
            foreach (var p in et.GetProperties()) p.SetColumnName(Snake(p.Name));
            foreach (var k in et.GetKeys()) k.SetName(Snake(k.GetName()!));
            foreach (var fk in et.GetForeignKeys()) fk.SetConstraintName(Snake(fk.GetConstraintName()!));
            foreach (var ix in et.GetIndexes()) ix.SetDatabaseName(Snake(ix.GetDatabaseName()!));
        }
    }

    public static string Snake(string name)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c))
            {
                if (i > 0 && name[i - 1] != '_' && (char.IsLower(name[i - 1]) || (i + 1 < name.Length && char.IsLower(name[i + 1]))))
                    sb.Append('_');
                sb.Append(char.ToLowerInvariant(c));
            }
            else sb.Append(c);
        }
        return sb.ToString();
    }
}
