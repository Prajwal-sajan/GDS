using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class StageMetroPickup : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "exchange_point",
                table: "route_stages",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "exchange_time",
                table: "route_stages",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "metro_description",
                table: "route_stages",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pickup_type",
                table: "route_stages",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "exchange_point",
                table: "route_stages");

            migrationBuilder.DropColumn(
                name: "exchange_time",
                table: "route_stages");

            migrationBuilder.DropColumn(
                name: "metro_description",
                table: "route_stages");

            migrationBuilder.DropColumn(
                name: "pickup_type",
                table: "route_stages");
        }
    }
}
