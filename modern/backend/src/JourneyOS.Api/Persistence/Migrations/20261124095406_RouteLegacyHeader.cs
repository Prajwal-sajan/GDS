using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RouteLegacyHeader : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "alt_name",
                table: "routes",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "arrival_day",
                table: "routes",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "arrival_time",
                table: "routes",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "duration_minutes",
                table: "routes",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "end_date",
                table: "routes",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "start_date",
                table: "routes",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "alt_name",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "arrival_day",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "arrival_time",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "duration_minutes",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "end_date",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "start_date",
                table: "routes");
        }
    }
}
