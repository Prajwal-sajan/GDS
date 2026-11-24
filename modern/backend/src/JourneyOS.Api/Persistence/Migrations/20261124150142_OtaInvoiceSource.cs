using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class OtaInvoiceSource : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "computed_amount",
                table: "ota_invoices",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "operator_gstin",
                table: "ota_invoices",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "source_pdf",
                table: "ota_invoices",
                type: "bytea",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "summary_json",
                table: "ota_invoices",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "computed_amount",
                table: "ota_invoices");

            migrationBuilder.DropColumn(
                name: "operator_gstin",
                table: "ota_invoices");

            migrationBuilder.DropColumn(
                name: "source_pdf",
                table: "ota_invoices");

            migrationBuilder.DropColumn(
                name: "summary_json",
                table: "ota_invoices");
        }
    }
}
