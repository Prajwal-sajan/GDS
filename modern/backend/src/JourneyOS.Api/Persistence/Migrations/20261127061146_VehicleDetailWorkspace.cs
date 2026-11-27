using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class VehicleDetailWorkspace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "details_json",
                table: "vehicles",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "archive_reason",
                table: "compliance_documents",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "archived_at",
                table: "compliance_documents",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "created_at",
                table: "compliance_documents",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "document_number",
                table: "compliance_documents",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "file_data",
                table: "compliance_documents",
                type: "bytea",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "file_name",
                table: "compliance_documents",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "file_type",
                table: "compliance_documents",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "issue_date",
                table: "compliance_documents",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "visibility",
                table: "compliance_documents",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "vehicle_maintenance",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    vehicle_id = table.Column<long>(type: "bigint", nullable: false),
                    type = table.Column<string>(type: "text", nullable: false),
                    label = table.Column<string>(type: "text", nullable: false),
                    service_date = table.Column<DateOnly>(type: "date", nullable: true),
                    odometer_km = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    next_due_date = table.Column<DateOnly>(type: "date", nullable: true),
                    next_due_km = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    cost = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    notes = table.Column<string>(type: "text", nullable: false),
                    file_name = table.Column<string>(type: "text", nullable: true),
                    file_type = table.Column<string>(type: "text", nullable: true),
                    file_data = table.Column<byte[]>(type: "bytea", nullable: true),
                    created_by = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    archived_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_vehicle_maintenance", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_vehicle_maintenance_tenant_id_vehicle_id",
                table: "vehicle_maintenance",
                columns: new[] { "tenant_id", "vehicle_id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "vehicle_maintenance");

            migrationBuilder.DropColumn(
                name: "details_json",
                table: "vehicles");

            migrationBuilder.DropColumn(
                name: "archive_reason",
                table: "compliance_documents");

            migrationBuilder.DropColumn(
                name: "archived_at",
                table: "compliance_documents");

            migrationBuilder.DropColumn(
                name: "created_at",
                table: "compliance_documents");

            migrationBuilder.DropColumn(
                name: "document_number",
                table: "compliance_documents");

            migrationBuilder.DropColumn(
                name: "file_data",
                table: "compliance_documents");

            migrationBuilder.DropColumn(
                name: "file_name",
                table: "compliance_documents");

            migrationBuilder.DropColumn(
                name: "file_type",
                table: "compliance_documents");

            migrationBuilder.DropColumn(
                name: "issue_date",
                table: "compliance_documents");

            migrationBuilder.DropColumn(
                name: "visibility",
                table: "compliance_documents");
        }
    }
}
