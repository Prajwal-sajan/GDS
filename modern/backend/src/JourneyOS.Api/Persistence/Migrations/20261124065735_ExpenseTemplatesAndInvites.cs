using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ExpenseTemplatesAndInvites : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "invite_code_sha256",
                table: "app_users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "invite_expires_at",
                table: "app_users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "route_expense_item",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    route_id = table.Column<long>(type: "bigint", nullable: false),
                    type = table.Column<string>(type: "text", nullable: false),
                    key = table.Column<string>(type: "text", nullable: false),
                    label = table.Column<string>(type: "text", nullable: false),
                    per_trip = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_route_expense_item", x => x.id);
                    table.CheckConstraint("ck_route_expense_items", "per_trip >= 0 AND type IN ('fixed','running')");
                    table.ForeignKey(
                        name: "fk_route_expense_item_routes_route_id",
                        column: x => x.route_id,
                        principalTable: "routes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_route_expense_item_route_id_type_key",
                table: "route_expense_item",
                columns: new[] { "route_id", "type", "key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "route_expense_item");

            migrationBuilder.DropColumn(
                name: "invite_code_sha256",
                table: "app_users");

            migrationBuilder.DropColumn(
                name: "invite_expires_at",
                table: "app_users");
        }
    }
}
