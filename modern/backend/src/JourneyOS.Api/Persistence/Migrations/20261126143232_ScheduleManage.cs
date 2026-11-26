using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ScheduleManage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "deleted_at",
                table: "trips",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "fare_override_at",
                table: "trips",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "fare_override_json",
                table: "trips",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "pnl_expense_version",
                table: "trips",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "kind",
                table: "trip_expenses",
                type: "text",
                nullable: false,
                defaultValue: "manual");

            migrationBuilder.AddColumn<string>(
                name: "source",
                table: "trip_expenses",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "type",
                table: "trip_expenses",
                type: "text",
                nullable: false,
                defaultValue: "running");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "trips");

            migrationBuilder.DropColumn(
                name: "fare_override_at",
                table: "trips");

            migrationBuilder.DropColumn(
                name: "fare_override_json",
                table: "trips");

            migrationBuilder.DropColumn(
                name: "pnl_expense_version",
                table: "trips");

            migrationBuilder.DropColumn(
                name: "kind",
                table: "trip_expenses");

            migrationBuilder.DropColumn(
                name: "source",
                table: "trip_expenses");

            migrationBuilder.DropColumn(
                name: "type",
                table: "trip_expenses");
        }
    }
}
