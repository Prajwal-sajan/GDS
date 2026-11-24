using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace JourneyOS.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SettingsSuite : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "last_seen_at",
                table: "user_sessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "user_agent",
                table: "user_sessions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "code",
                table: "branches",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "extra_json",
                table: "branches",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "branch_id",
                table: "app_users",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "deleted_at",
                table: "app_users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "login_count",
                table: "app_users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "profile_json",
                table: "app_users",
                type: "jsonb",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "tenant_documents",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<long>(type: "bigint", nullable: false),
                    key = table.Column<string>(type: "text", nullable: false),
                    json = table.Column<string>(type: "jsonb", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_tenant_documents", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_tenant_documents_tenant_id_key",
                table: "tenant_documents",
                columns: new[] { "tenant_id", "key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "tenant_documents");

            migrationBuilder.DropColumn(
                name: "last_seen_at",
                table: "user_sessions");

            migrationBuilder.DropColumn(
                name: "user_agent",
                table: "user_sessions");

            migrationBuilder.DropColumn(
                name: "code",
                table: "branches");

            migrationBuilder.DropColumn(
                name: "extra_json",
                table: "branches");

            migrationBuilder.DropColumn(
                name: "branch_id",
                table: "app_users");

            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "app_users");

            migrationBuilder.DropColumn(
                name: "login_count",
                table: "app_users");

            migrationBuilder.DropColumn(
                name: "profile_json",
                table: "app_users");
        }
    }
}
