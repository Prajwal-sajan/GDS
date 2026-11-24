using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class StaffPayroll : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "staff_advances",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    staff_id = table.Column<long>(type: "bigint", nullable: false),
                    advance_type = table.Column<string>(type: "text", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    date_issued = table.Column<DateOnly>(type: "date", nullable: false),
                    reason = table.Column<string>(type: "text", nullable: true),
                    payment_mode = table.Column<string>(type: "text", nullable: false),
                    recovery_method = table.Column<string>(type: "text", nullable: false),
                    num_installments = table.Column<int>(type: "integer", nullable: true),
                    interest_rate = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    amount_recovered = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    status = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_staff_advances", x => x.id);
                    table.CheckConstraint("ck_staff_advances_amount", "amount > 0 AND amount_recovered >= 0 AND amount_recovered <= amount");
                });

            migrationBuilder.CreateTable(
                name: "staff_attendance",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    staff_id = table.Column<long>(type: "bigint", nullable: false),
                    date = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    trip_id = table.Column<long>(type: "bigint", nullable: true),
                    source = table.Column<string>(type: "text", nullable: false),
                    state = table.Column<string>(type: "text", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_staff_attendance", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "staff_payouts",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    payout_no = table.Column<string>(type: "text", nullable: false),
                    staff_id = table.Column<long>(type: "bigint", nullable: false),
                    period_start = table.Column<DateOnly>(type: "date", nullable: false),
                    period_end = table.Column<DateOnly>(type: "date", nullable: false),
                    days = table.Column<int>(type: "integer", nullable: false),
                    gross = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    deductions = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    advances_recovered = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    reimbursements = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    net = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    approved_by = table.Column<string>(type: "text", nullable: true),
                    paid_at = table.Column<DateOnly>(type: "date", nullable: true),
                    payment_mode = table.Column<string>(type: "text", nullable: true),
                    reference = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_staff_payouts", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "staff_reimbursements",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    staff_id = table.Column<long>(type: "bigint", nullable: false),
                    category = table.Column<string>(type: "text", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    date = table.Column<DateOnly>(type: "date", nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    receipt = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_staff_reimbursements", x => x.id);
                    table.CheckConstraint("ck_staff_reimbursements_amount", "amount >= 0");
                });

            migrationBuilder.CreateIndex(
                name: "ix_staff_advances_staff_id",
                table: "staff_advances",
                column: "staff_id");

            migrationBuilder.CreateIndex(
                name: "ix_staff_attendance_tenant_id_staff_id_date",
                table: "staff_attendance",
                columns: new[] { "tenant_id", "staff_id", "date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_staff_payouts_staff_id",
                table: "staff_payouts",
                column: "staff_id");

            migrationBuilder.CreateIndex(
                name: "ix_staff_payouts_tenant_id_payout_no",
                table: "staff_payouts",
                columns: new[] { "tenant_id", "payout_no" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_staff_reimbursements_staff_id",
                table: "staff_reimbursements",
                column: "staff_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "staff_advances");

            migrationBuilder.DropTable(
                name: "staff_attendance");

            migrationBuilder.DropTable(
                name: "staff_payouts");

            migrationBuilder.DropTable(
                name: "staff_reimbursements");
        }
    }
}
