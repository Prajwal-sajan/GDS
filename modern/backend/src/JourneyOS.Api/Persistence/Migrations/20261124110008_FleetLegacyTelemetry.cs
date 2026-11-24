using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class FleetLegacyTelemetry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "health_json",
                table: "vehicles",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "odometer_reading",
                table: "vehicles",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "position_json",
                table: "vehicles",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "vehicle_role",
                table: "vehicles",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "amenities_json",
                table: "coach_templates",
                type: "jsonb",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "status",
                table: "coach_templates",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "health_json",
                table: "vehicles");

            migrationBuilder.DropColumn(
                name: "odometer_reading",
                table: "vehicles");

            migrationBuilder.DropColumn(
                name: "position_json",
                table: "vehicles");

            migrationBuilder.DropColumn(
                name: "vehicle_role",
                table: "vehicles");

            migrationBuilder.DropColumn(
                name: "amenities_json",
                table: "coach_templates");

            migrationBuilder.DropColumn(
                name: "status",
                table: "coach_templates");
        }
    }
}
