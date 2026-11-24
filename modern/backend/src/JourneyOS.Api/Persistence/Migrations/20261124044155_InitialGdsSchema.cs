using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialGdsSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:btree_gist", ",,");

            migrationBuilder.CreateTable(
                name: "audit_logs",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    actor = table.Column<string>(type: "text", nullable: false),
                    action = table.Column<string>(type: "text", nullable: false),
                    entity = table.Column<string>(type: "text", nullable: false),
                    entity_id = table.Column<string>(type: "text", nullable: false),
                    data_json = table.Column<string>(type: "text", nullable: true),
                    at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_audit_logs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "cancellations",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    booking_id = table.Column<long>(type: "bigint", nullable: false),
                    seats = table.Column<string[]>(type: "text[]", nullable: false),
                    charge = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    refund = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    reason = table.Column<string>(type: "text", nullable: false),
                    notes = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_cancellations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "cities",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    state = table.Column<string>(type: "text", nullable: true),
                    country_id = table.Column<long>(type: "bigint", nullable: false),
                    country_name = table.Column<string>(type: "text", nullable: false),
                    lat = table.Column<decimal>(type: "numeric(12,6)", precision: 12, scale: 6, nullable: true),
                    lng = table.Column<decimal>(type: "numeric(12,6)", precision: 12, scale: 6, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_cities", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "coach_templates",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    bus_type = table.Column<string>(type: "text", nullable: false),
                    pattern = table.Column<string>(type: "text", nullable: false),
                    is_ac = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_coach_templates", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "ota_inventories",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    trip_id = table.Column<long>(type: "bigint", nullable: false),
                    from_seq = table.Column<int>(type: "integer", nullable: false),
                    to_seq = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ota_inventories", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "ota_providers",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    provider = table.Column<string>(type: "text", nullable: false),
                    operator_code = table.Column<string>(type: "text", nullable: false),
                    callback_url = table.Column<string>(type: "text", nullable: true),
                    outbound_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    last_successful_sync_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ota_providers", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "outbox_attempts",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    outbox_message_id = table.Column<long>(type: "bigint", nullable: false),
                    at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    http_status = table.Column<int>(type: "integer", nullable: true),
                    response_body = table.Column<string>(type: "text", nullable: true),
                    error = table.Column<string>(type: "text", nullable: true),
                    acknowledged = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_outbox_attempts", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "outbox_messages",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    provider = table.Column<string>(type: "text", nullable: false),
                    action_type = table.Column<string>(type: "text", nullable: false),
                    dedup_key = table.Column<string>(type: "text", nullable: false),
                    payload_json = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    next_attempt_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    last_http_status = table.Column<int>(type: "integer", nullable: true),
                    last_error = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    acknowledged_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_outbox_messages", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "refunds",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    cancellation_id = table.Column<long>(type: "bigint", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_refunds", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "seat_allocations",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    trip_id = table.Column<long>(type: "bigint", nullable: false),
                    coach_seat_id = table.Column<long>(type: "bigint", nullable: false),
                    seat_code = table.Column<string>(type: "text", nullable: false),
                    from_seq = table.Column<int>(type: "integer", nullable: false),
                    to_seq = table.Column<int>(type: "integer", nullable: false),
                    kind = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    gender = table.Column<string>(type: "text", nullable: true),
                    hold_id = table.Column<long>(type: "bigint", nullable: true),
                    booking_passenger_id = table.Column<long>(type: "bigint", nullable: true),
                    reason = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    released_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_seat_allocations", x => x.id);
                    table.CheckConstraint("ck_seat_allocations_segment", "from_seq < to_seq");
                });

            migrationBuilder.CreateTable(
                name: "seat_holds",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    block_key = table.Column<string>(type: "text", nullable: false),
                    channel = table.Column<string>(type: "text", nullable: false),
                    trip_id = table.Column<long>(type: "bigint", nullable: false),
                    inventory_id = table.Column<long>(type: "bigint", nullable: false),
                    boarding_stage_id = table.Column<long>(type: "bigint", nullable: false),
                    dropping_stage_id = table.Column<long>(type: "bigint", nullable: false),
                    from_seq = table.Column<int>(type: "integer", nullable: false),
                    to_seq = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    total_fare = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    currency = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    closed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_seat_holds", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "tenants",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    code = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    operator_id = table.Column<long>(type: "bigint", nullable: false),
                    time_zone = table.Column<string>(type: "text", nullable: false),
                    gst_percent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_tenants", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "coach_seats",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    coach_template_id = table.Column<long>(type: "bigint", nullable: false),
                    code = table.Column<string>(type: "text", nullable: false),
                    deck = table.Column<string>(type: "text", nullable: false),
                    row = table.Column<int>(type: "integer", nullable: false),
                    col = table.Column<int>(type: "integer", nullable: false),
                    width = table.Column<int>(type: "integer", nullable: false),
                    length = table.Column<int>(type: "integer", nullable: false),
                    seat_type = table.Column<string>(type: "text", nullable: false),
                    is_window = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_coach_seats", x => x.id);
                    table.ForeignKey(
                        name: "fk_coach_seats_coach_templates_coach_template_id",
                        column: x => x.coach_template_id,
                        principalTable: "coach_templates",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "routes",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    service_number = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    coach_template_id = table.Column<long>(type: "bigint", nullable: false),
                    departure_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    partial_cancellation_allowed = table.Column<bool>(type: "boolean", nullable: false),
                    primary_pax_cancellable = table.Column<bool>(type: "boolean", nullable: false),
                    max_seats_per_ticket = table.Column<int>(type: "integer", nullable: false),
                    update_cutoff_minutes = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_routes", x => x.id);
                    table.ForeignKey(
                        name: "fk_routes_coach_templates_coach_template_id",
                        column: x => x.coach_template_id,
                        principalTable: "coach_templates",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "hold_passengers",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    hold_id = table.Column<long>(type: "bigint", nullable: false),
                    coach_seat_id = table.Column<long>(type: "bigint", nullable: false),
                    seat_code = table.Column<string>(type: "text", nullable: false),
                    fare = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    base_fare = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    gst = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    ladies_seat = table.Column<bool>(type: "boolean", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    mobile = table.Column<string>(type: "text", nullable: true),
                    title = table.Column<string>(type: "text", nullable: true),
                    email = table.Column<string>(type: "text", nullable: true),
                    age = table.Column<int>(type: "integer", nullable: false),
                    gender = table.Column<string>(type: "text", nullable: false),
                    address = table.Column<string>(type: "text", nullable: true),
                    id_type = table.Column<string>(type: "text", nullable: true),
                    id_number = table.Column<string>(type: "text", nullable: true),
                    is_primary = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_hold_passengers", x => x.id);
                    table.ForeignKey(
                        name: "fk_hold_passengers_seat_holds_hold_id",
                        column: x => x.hold_id,
                        principalTable: "seat_holds",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "refund_slabs",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    route_id = table.Column<long>(type: "bigint", nullable: false),
                    hours_before = table.Column<int>(type: "integer", nullable: false),
                    refund_percent = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_refund_slabs", x => x.id);
                    table.ForeignKey(
                        name: "fk_refund_slabs_routes_route_id",
                        column: x => x.route_id,
                        principalTable: "routes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "route_fares",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    route_id = table.Column<long>(type: "bigint", nullable: false),
                    from_sequence = table.Column<int>(type: "integer", nullable: false),
                    to_sequence = table.Column<int>(type: "integer", nullable: false),
                    seater = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    sleeper_lower = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    sleeper_upper = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_route_fares", x => x.id);
                    table.CheckConstraint("ck_route_fares_order", "from_sequence < to_sequence");
                    table.ForeignKey(
                        name: "fk_route_fares_routes_route_id",
                        column: x => x.route_id,
                        principalTable: "routes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "route_stages",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false),
                    route_id = table.Column<long>(type: "bigint", nullable: false),
                    city_id = table.Column<long>(type: "bigint", nullable: false),
                    stop_sequence = table.Column<int>(type: "integer", nullable: false),
                    kind = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    address = table.Column<string>(type: "text", nullable: true),
                    landmark = table.Column<string>(type: "text", nullable: true),
                    contact_number = table.Column<string>(type: "text", nullable: true),
                    lat = table.Column<decimal>(type: "numeric(12,6)", precision: 12, scale: 6, nullable: true),
                    lng = table.Column<decimal>(type: "numeric(12,6)", precision: 12, scale: 6, nullable: true),
                    day = table.Column<int>(type: "integer", nullable: false),
                    time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    prime = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_route_stages", x => x.id);
                    table.ForeignKey(
                        name: "fk_route_stages_routes_route_id",
                        column: x => x.route_id,
                        principalTable: "routes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "route_stops",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    route_id = table.Column<long>(type: "bigint", nullable: false),
                    sequence = table.Column<int>(type: "integer", nullable: false),
                    city_id = table.Column<long>(type: "bigint", nullable: false),
                    day = table.Column<int>(type: "integer", nullable: false),
                    time = table.Column<TimeOnly>(type: "time without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_route_stops", x => x.id);
                    table.ForeignKey(
                        name: "fk_route_stops_cities_city_id",
                        column: x => x.city_id,
                        principalTable: "cities",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_route_stops_routes_route_id",
                        column: x => x.route_id,
                        principalTable: "routes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "seat_fare_rules",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    route_id = table.Column<long>(type: "bigint", nullable: false),
                    kind = table.Column<string>(type: "text", nullable: false),
                    label = table.Column<string>(type: "text", nullable: false),
                    seats = table.Column<string[]>(type: "text[]", nullable: false),
                    days = table.Column<string[]>(type: "text[]", nullable: false),
                    value = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_seat_fare_rules", x => x.id);
                    table.ForeignKey(
                        name: "fk_seat_fare_rules_routes_route_id",
                        column: x => x.route_id,
                        principalTable: "routes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "trips",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    route_id = table.Column<long>(type: "bigint", nullable: false),
                    travel_date = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    bookable = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_trips", x => x.id);
                    table.ForeignKey(
                        name: "fk_trips_routes_route_id",
                        column: x => x.route_id,
                        principalTable: "routes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "bookings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    pnr = table.Column<string>(type: "text", nullable: false),
                    trip_id = table.Column<long>(type: "bigint", nullable: false),
                    hold_id = table.Column<long>(type: "bigint", nullable: true),
                    inventory_id = table.Column<long>(type: "bigint", nullable: true),
                    channel = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    boarding_stage_id = table.Column<long>(type: "bigint", nullable: false),
                    dropping_stage_id = table.Column<long>(type: "bigint", nullable: false),
                    from_seq = table.Column<int>(type: "integer", nullable: false),
                    to_seq = table.Column<int>(type: "integer", nullable: false),
                    contact_mobile = table.Column<string>(type: "text", nullable: true),
                    contact_email = table.Column<string>(type: "text", nullable: true),
                    total_fare = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    currency = table.Column<string>(type: "text", nullable: false),
                    cancellation_policy = table.Column<string>(type: "text", nullable: false),
                    date_of_issue = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    date_of_cancellation = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_bookings", x => x.id);
                    table.ForeignKey(
                        name: "fk_bookings_trips_trip_id",
                        column: x => x.trip_id,
                        principalTable: "trips",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "booking_passengers",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    booking_id = table.Column<long>(type: "bigint", nullable: false),
                    coach_seat_id = table.Column<long>(type: "bigint", nullable: false),
                    seat_code = table.Column<string>(type: "text", nullable: false),
                    fare = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    base_fare = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    gst = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    ladies_seat = table.Column<bool>(type: "boolean", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    mobile = table.Column<string>(type: "text", nullable: true),
                    title = table.Column<string>(type: "text", nullable: true),
                    email = table.Column<string>(type: "text", nullable: true),
                    age = table.Column<int>(type: "integer", nullable: false),
                    gender = table.Column<string>(type: "text", nullable: false),
                    address = table.Column<string>(type: "text", nullable: true),
                    id_type = table.Column<string>(type: "text", nullable: true),
                    id_number = table.Column<string>(type: "text", nullable: true),
                    is_primary = table.Column<bool>(type: "boolean", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    boarding_status = table.Column<string>(type: "text", nullable: false),
                    boarding_status_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    cancellation_charge = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    refund_amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    cancelled_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_booking_passengers", x => x.id);
                    table.ForeignKey(
                        name: "fk_booking_passengers_bookings_booking_id",
                        column: x => x.booking_id,
                        principalTable: "bookings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_audit_logs_tenant_id_entity_entity_id",
                table: "audit_logs",
                columns: new[] { "tenant_id", "entity", "entity_id" });

            migrationBuilder.CreateIndex(
                name: "ix_booking_passengers_booking_id",
                table: "booking_passengers",
                column: "booking_id");

            migrationBuilder.CreateIndex(
                name: "ix_bookings_hold_id",
                table: "bookings",
                column: "hold_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_bookings_pnr",
                table: "bookings",
                column: "pnr",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_bookings_trip_id",
                table: "bookings",
                column: "trip_id");

            migrationBuilder.CreateIndex(
                name: "ix_cities_tenant_id_name",
                table: "cities",
                columns: new[] { "tenant_id", "name" });

            migrationBuilder.CreateIndex(
                name: "ix_coach_seats_coach_template_id_code",
                table: "coach_seats",
                columns: new[] { "coach_template_id", "code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_hold_passengers_hold_id",
                table: "hold_passengers",
                column: "hold_id");

            migrationBuilder.CreateIndex(
                name: "ix_ota_inventories_trip_id_from_seq_to_seq",
                table: "ota_inventories",
                columns: new[] { "trip_id", "from_seq", "to_seq" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_ota_providers_tenant_id_provider",
                table: "ota_providers",
                columns: new[] { "tenant_id", "provider" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_outbox_attempts_outbox_message_id",
                table: "outbox_attempts",
                column: "outbox_message_id");

            migrationBuilder.CreateIndex(
                name: "ix_outbox_messages_provider_dedup_key",
                table: "outbox_messages",
                columns: new[] { "provider", "dedup_key" },
                unique: true,
                filter: "status = 1");

            migrationBuilder.CreateIndex(
                name: "ix_outbox_messages_status_next_attempt_at",
                table: "outbox_messages",
                columns: new[] { "status", "next_attempt_at" });

            migrationBuilder.CreateIndex(
                name: "ix_refund_slabs_route_id",
                table: "refund_slabs",
                column: "route_id");

            migrationBuilder.CreateIndex(
                name: "ix_route_fares_route_id_from_sequence_to_sequence",
                table: "route_fares",
                columns: new[] { "route_id", "from_sequence", "to_sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_route_stages_route_id",
                table: "route_stages",
                column: "route_id");

            migrationBuilder.CreateIndex(
                name: "ix_route_stops_city_id",
                table: "route_stops",
                column: "city_id");

            migrationBuilder.CreateIndex(
                name: "ix_route_stops_route_id_sequence",
                table: "route_stops",
                columns: new[] { "route_id", "sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_routes_coach_template_id",
                table: "routes",
                column: "coach_template_id");

            migrationBuilder.CreateIndex(
                name: "ix_routes_tenant_id_service_number",
                table: "routes",
                columns: new[] { "tenant_id", "service_number" });

            migrationBuilder.CreateIndex(
                name: "ix_seat_allocations_hold_id",
                table: "seat_allocations",
                column: "hold_id");

            migrationBuilder.CreateIndex(
                name: "ix_seat_allocations_trip_id_is_active",
                table: "seat_allocations",
                columns: new[] { "trip_id", "is_active" });

            migrationBuilder.CreateIndex(
                name: "ix_seat_fare_rules_route_id",
                table: "seat_fare_rules",
                column: "route_id");

            migrationBuilder.CreateIndex(
                name: "ix_seat_holds_block_key",
                table: "seat_holds",
                column: "block_key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_seat_holds_status_expires_at",
                table: "seat_holds",
                columns: new[] { "status", "expires_at" });

            migrationBuilder.CreateIndex(
                name: "ix_tenants_code",
                table: "tenants",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_trips_route_id_travel_date",
                table: "trips",
                columns: new[] { "route_id", "travel_date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_trips_tenant_id_travel_date",
                table: "trips",
                columns: new[] { "tenant_id", "travel_date" });

            // ---- Inventory invariant (hand-written) ----
            // A physical seat can never be held/booked/blocked twice on overlapping route segments.
            // [from_seq, to_seq) is half-open, so Hyderabad→Kurnool [0,1) and Kurnool→Bengaluru [1,3) can coexist.
            migrationBuilder.Sql(@"
ALTER TABLE seat_allocations
  ADD COLUMN segment int4range GENERATED ALWAYS AS (int4range(from_seq, to_seq, '[)')) STORED;
ALTER TABLE seat_allocations
  ADD CONSTRAINT ex_seat_allocations_no_overlap
  EXCLUDE USING gist (trip_id WITH =, coach_seat_id WITH =, segment WITH &&) WHERE (is_active);

-- Referential integrity for relations not modelled as EF navigations.
ALTER TABLE seat_allocations ADD CONSTRAINT fk_seat_allocations_trips FOREIGN KEY (trip_id) REFERENCES trips(id);
ALTER TABLE seat_allocations ADD CONSTRAINT fk_seat_allocations_coach_seats FOREIGN KEY (coach_seat_id) REFERENCES coach_seats(id);
ALTER TABLE seat_allocations ADD CONSTRAINT fk_seat_allocations_seat_holds FOREIGN KEY (hold_id) REFERENCES seat_holds(id);
ALTER TABLE seat_allocations ADD CONSTRAINT fk_seat_allocations_booking_passengers FOREIGN KEY (booking_passenger_id) REFERENCES booking_passengers(id);
ALTER TABLE seat_holds ADD CONSTRAINT fk_seat_holds_trips FOREIGN KEY (trip_id) REFERENCES trips(id);
ALTER TABLE seat_holds ADD CONSTRAINT fk_seat_holds_ota_inventories FOREIGN KEY (inventory_id) REFERENCES ota_inventories(id);
ALTER TABLE ota_inventories ADD CONSTRAINT fk_ota_inventories_trips FOREIGN KEY (trip_id) REFERENCES trips(id);
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_seat_holds FOREIGN KEY (hold_id) REFERENCES seat_holds(id);
ALTER TABLE cancellations ADD CONSTRAINT fk_cancellations_bookings FOREIGN KEY (booking_id) REFERENCES bookings(id);
ALTER TABLE refunds ADD CONSTRAINT fk_refunds_cancellations FOREIGN KEY (cancellation_id) REFERENCES cancellations(id);
ALTER TABLE outbox_attempts ADD CONSTRAINT fk_outbox_attempts_outbox_messages FOREIGN KEY (outbox_message_id) REFERENCES outbox_messages(id);
ALTER TABLE route_stages ADD CONSTRAINT fk_route_stages_cities FOREIGN KEY (city_id) REFERENCES cities(id);

-- Append-only audit log.
CREATE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END $$;
CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
DROP FUNCTION IF EXISTS audit_logs_immutable();
ALTER TABLE seat_allocations DROP CONSTRAINT IF EXISTS fk_seat_allocations_trips, DROP CONSTRAINT IF EXISTS fk_seat_allocations_coach_seats,
  DROP CONSTRAINT IF EXISTS fk_seat_allocations_seat_holds, DROP CONSTRAINT IF EXISTS fk_seat_allocations_booking_passengers;
ALTER TABLE seat_holds DROP CONSTRAINT IF EXISTS fk_seat_holds_trips, DROP CONSTRAINT IF EXISTS fk_seat_holds_ota_inventories;
ALTER TABLE ota_inventories DROP CONSTRAINT IF EXISTS fk_ota_inventories_trips;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_seat_holds;
ALTER TABLE cancellations DROP CONSTRAINT IF EXISTS fk_cancellations_bookings;
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS fk_refunds_cancellations;
ALTER TABLE outbox_attempts DROP CONSTRAINT IF EXISTS fk_outbox_attempts_outbox_messages;
ALTER TABLE route_stages DROP CONSTRAINT IF EXISTS fk_route_stages_cities;");

            migrationBuilder.DropTable(
                name: "audit_logs");

            migrationBuilder.DropTable(
                name: "booking_passengers");

            migrationBuilder.DropTable(
                name: "cancellations");

            migrationBuilder.DropTable(
                name: "coach_seats");

            migrationBuilder.DropTable(
                name: "hold_passengers");

            migrationBuilder.DropTable(
                name: "ota_inventories");

            migrationBuilder.DropTable(
                name: "ota_providers");

            migrationBuilder.DropTable(
                name: "outbox_attempts");

            migrationBuilder.DropTable(
                name: "outbox_messages");

            migrationBuilder.DropTable(
                name: "refund_slabs");

            migrationBuilder.DropTable(
                name: "refunds");

            migrationBuilder.DropTable(
                name: "route_fares");

            migrationBuilder.DropTable(
                name: "route_stages");

            migrationBuilder.DropTable(
                name: "route_stops");

            migrationBuilder.DropTable(
                name: "seat_allocations");

            migrationBuilder.DropTable(
                name: "seat_fare_rules");

            migrationBuilder.DropTable(
                name: "tenants");

            migrationBuilder.DropTable(
                name: "bookings");

            migrationBuilder.DropTable(
                name: "seat_holds");

            migrationBuilder.DropTable(
                name: "cities");

            migrationBuilder.DropTable(
                name: "trips");

            migrationBuilder.DropTable(
                name: "routes");

            migrationBuilder.DropTable(
                name: "coach_templates");
        }
    }
}
