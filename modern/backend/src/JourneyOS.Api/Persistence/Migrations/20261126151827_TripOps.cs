using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TripOps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "delay_reason",
                table: "trips",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "sync_with_route",
                table: "trips",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "update_settings_json",
                table: "trips",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "delay_reason",
                table: "trips");

            migrationBuilder.DropColumn(
                name: "sync_with_route",
                table: "trips");

            migrationBuilder.DropColumn(
                name: "update_settings_json",
                table: "trips");
        }
    }
}
