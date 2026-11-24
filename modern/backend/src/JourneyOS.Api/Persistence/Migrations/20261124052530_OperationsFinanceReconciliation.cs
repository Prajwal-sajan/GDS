using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class OperationsFinanceReconciliation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "booking_finances",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    booking_id = table.Column<long>(type: "bigint", nullable: false),
                    net_fare = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    gst = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    ota_commission = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    ota_commission_gst = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    operator_offer = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    ota_take_home = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_booking_finances", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "ota_invoices",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    provider = table.Column<string>(type: "text", nullable: false),
                    invoice_number = table.Column<string>(type: "text", nullable: false),
                    operator_code = table.Column<string>(type: "text", nullable: true),
                    file_name = table.Column<string>(type: "text", nullable: false),
                    sha256 = table.Column<string>(type: "text", nullable: false),
                    period_start = table.Column<DateOnly>(type: "date", nullable: false),
                    period_end = table.Column<DateOnly>(type: "date", nullable: false),
                    stated_amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    tolerance = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    warnings_json = table.Column<string>(type: "text", nullable: true),
                    uploaded_by = table.Column<string>(type: "text", nullable: false),
                    uploaded_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ota_invoices", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "payments",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    booking_id = table.Column<long>(type: "bigint", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    method = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    reference = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_payments", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "staff",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    phone = table.Column<string>(type: "text", nullable: false),
                    role = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    designation = table.Column<string>(type: "text", nullable: true),
                    license_number = table.Column<string>(type: "text", nullable: true),
                    license_expiry = table.Column<DateOnly>(type: "date", nullable: true),
                    salary_type = table.Column<string>(type: "text", nullable: true),
                    salary_amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    bata_per_trip = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_staff", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "trip_assignments",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    trip_id = table.Column<long>(type: "bigint", nullable: false),
                    kind = table.Column<string>(type: "text", nullable: false),
                    vehicle_id = table.Column<long>(type: "bigint", nullable: true),
                    staff_id = table.Column<long>(type: "bigint", nullable: true),
                    role = table.Column<string>(type: "text", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    assigned_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    replaced_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    replaced_reason = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_trip_assignments", x => x.id);
                    table.CheckConstraint("ck_trip_assignments_kind", "(kind = 'vehicle' AND vehicle_id IS NOT NULL) OR (kind = 'staff' AND staff_id IS NOT NULL)");
                });

            migrationBuilder.CreateTable(
                name: "vehicles",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    registration_number = table.Column<string>(type: "text", nullable: false),
                    coach_template_id = table.Column<long>(type: "bigint", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    model_name = table.Column<string>(type: "text", nullable: true),
                    manufacture_year = table.Column<int>(type: "integer", nullable: true),
                    ownership_type = table.Column<string>(type: "text", nullable: true),
                    phone_number = table.Column<string>(type: "text", nullable: true),
                    gps_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    insurance_expiry = table.Column<DateOnly>(type: "date", nullable: true),
                    permit_expiry = table.Column<DateOnly>(type: "date", nullable: true),
                    fitness_expiry = table.Column<DateOnly>(type: "date", nullable: true),
                    puc_expiry = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_vehicles", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "ota_invoice_lines",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    invoice_id = table.Column<long>(type: "bigint", nullable: false),
                    line_key = table.Column<string>(type: "text", nullable: false),
                    pnr = table.Column<string>(type: "text", nullable: false),
                    section = table.Column<string>(type: "text", nullable: false),
                    doj = table.Column<DateOnly>(type: "date", nullable: true),
                    fare = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    tax = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    commission = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    commission_tax = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    operator_offer = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    cancellation_charge = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    take_home = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    booking_id = table.Column<long>(type: "bigint", nullable: true),
                    booking_status = table.Column<string>(type: "text", nullable: true),
                    expected_doj = table.Column<DateOnly>(type: "date", nullable: true),
                    expected_fare = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    expected_tax = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    expected_take_home = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    delta = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    differences = table.Column<string[]>(type: "text[]", nullable: false),
                    why = table.Column<string>(type: "text", nullable: false),
                    resolution_action = table.Column<string>(type: "text", nullable: true),
                    resolution_note = table.Column<string>(type: "text", nullable: true),
                    resolved_by = table.Column<string>(type: "text", nullable: true),
                    resolved_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ota_invoice_lines", x => x.id);
                    table.ForeignKey(
                        name: "fk_ota_invoice_lines_ota_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalTable: "ota_invoices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_booking_finances_booking_id",
                table: "booking_finances",
                column: "booking_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_ota_invoice_lines_invoice_id_line_key",
                table: "ota_invoice_lines",
                columns: new[] { "invoice_id", "line_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_ota_invoice_lines_pnr",
                table: "ota_invoice_lines",
                column: "pnr");

            migrationBuilder.CreateIndex(
                name: "ix_ota_invoices_tenant_id_provider_invoice_number",
                table: "ota_invoices",
                columns: new[] { "tenant_id", "provider", "invoice_number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_ota_invoices_tenant_id_provider_sha256",
                table: "ota_invoices",
                columns: new[] { "tenant_id", "provider", "sha256" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_payments_booking_id",
                table: "payments",
                column: "booking_id");

            migrationBuilder.CreateIndex(
                name: "ix_staff_tenant_id_phone",
                table: "staff",
                columns: new[] { "tenant_id", "phone" });

            migrationBuilder.CreateIndex(
                name: "ix_trip_assignments_trip_id_role",
                table: "trip_assignments",
                columns: new[] { "trip_id", "role" },
                unique: true,
                filter: "is_active");

            migrationBuilder.CreateIndex(
                name: "ix_vehicles_tenant_id_registration_number",
                table: "vehicles",
                columns: new[] { "tenant_id", "registration_number" },
                unique: true);

            migrationBuilder.Sql("CREATE SEQUENCE IF NOT EXISTS master_ids START 1000000;");
            migrationBuilder.Sql("ALTER TABLE booking_finances ADD CONSTRAINT fk_booking_finances_bookings FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;");
            migrationBuilder.Sql("ALTER TABLE payments ADD CONSTRAINT fk_payments_bookings FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT;");
            migrationBuilder.Sql("ALTER TABLE trip_assignments ADD CONSTRAINT fk_trip_assignments_trips FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP SEQUENCE IF EXISTS master_ids;");
            migrationBuilder.DropTable(
                name: "booking_finances");

            migrationBuilder.DropTable(
                name: "ota_invoice_lines");

            migrationBuilder.DropTable(
                name: "payments");

            migrationBuilder.DropTable(
                name: "staff");

            migrationBuilder.DropTable(
                name: "trip_assignments");

            migrationBuilder.DropTable(
                name: "vehicles");

            migrationBuilder.DropTable(
                name: "ota_invoices");
        }
    }
}
