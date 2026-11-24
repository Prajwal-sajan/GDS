using JourneyOS.Api.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations;

[DbContext(typeof(GdsDbContext))]
[Migration("20261124124500_PublicBookingSiteSettings")]
public partial class PublicBookingSiteSettings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "public_booking_sites",
            columns: table => new
            {
                tenant_id = table.Column<long>(type: "bigint", nullable: false),
                search_url = table.Column<string>(type: "text", nullable: false),
                city_map_json = table.Column<string>(type: "jsonb", nullable: false),
                updated_by = table.Column<string>(type: "text", nullable: false),
                updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_public_booking_sites", x => x.tenant_id);
                table.ForeignKey(
                    name: "fk_public_booking_sites_tenants_tenant_id",
                    column: x => x.tenant_id,
                    principalTable: "tenants",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "public_booking_sites");
}
