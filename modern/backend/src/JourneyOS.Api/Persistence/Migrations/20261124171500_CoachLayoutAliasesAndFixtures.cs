using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations;

[DbContext(typeof(GdsDbContext))]
[Migration("20261124171500_CoachLayoutAliasesAndFixtures")]
public partial class CoachLayoutAliasesAndFixtures : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "layout_meta_json", table: "coach_templates",
            type: "text", nullable: false, defaultValue: "{}");
        migrationBuilder.AddColumn<string>(
            name: "display_name", table: "coach_seats",
            type: "text", nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "display_name", table: "coach_seats");
        migrationBuilder.DropColumn(name: "layout_meta_json", table: "coach_templates");
    }
}
