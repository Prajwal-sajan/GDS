using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ScheduleStageOverridesSeatRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "seat_fare_rules_json",
                table: "trips",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "stage_overrides_json",
                table: "trips",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "seat_fare_rules_json",
                table: "trips");

            migrationBuilder.DropColumn(
                name: "stage_overrides_json",
                table: "trips");
        }
    }
}
