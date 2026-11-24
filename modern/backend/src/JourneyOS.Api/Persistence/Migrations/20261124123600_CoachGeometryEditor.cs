using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations;

/// <summary>Physical coach fixtures and declared amenities; existing seat inventory remains unchanged.</summary>
[DbContext(typeof(GdsDbContext))]
[Migration("20261124123600_CoachGeometryEditor")]
public partial class CoachGeometryEditor : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string[]>(
            name: "amenities",
            table: "coach_templates",
            type: "text[]",
            nullable: false,
            defaultValueSql: "ARRAY[]::text[]");

        migrationBuilder.CreateTable(
            name: "coach_fixtures",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                coach_template_id = table.Column<long>(type: "bigint", nullable: false),
                kind = table.Column<string>(type: "text", nullable: false),
                label = table.Column<string>(type: "text", nullable: false),
                deck = table.Column<string>(type: "text", nullable: false),
                row = table.Column<int>(type: "integer", nullable: false),
                col = table.Column<int>(type: "integer", nullable: false),
                width = table.Column<int>(type: "integer", nullable: false),
                length = table.Column<int>(type: "integer", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_coach_fixtures", x => x.id);
                table.ForeignKey(
                    name: "fk_coach_fixtures_coach_templates_coach_template_id",
                    column: x => x.coach_template_id,
                    principalTable: "coach_templates",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "ix_coach_fixtures_coach_template_id_deck_row_col",
            table: "coach_fixtures",
            columns: new[] { "coach_template_id", "deck", "row", "col" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "coach_fixtures");
        migrationBuilder.DropColumn(name: "amenities", table: "coach_templates");
    }
}
