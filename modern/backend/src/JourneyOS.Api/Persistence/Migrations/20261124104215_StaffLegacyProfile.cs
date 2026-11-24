using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class StaffLegacyProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "blood_group",
                table: "staff",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "email",
                table: "staff",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "joining_date",
                table: "staff",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "blood_group",
                table: "staff");

            migrationBuilder.DropColumn(
                name: "email",
                table: "staff");

            migrationBuilder.DropColumn(
                name: "joining_date",
                table: "staff");
        }
    }
}
