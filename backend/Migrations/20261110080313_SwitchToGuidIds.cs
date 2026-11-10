using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SchoolAdmission.Api.Migrations
{
    /// <inheritdoc />
    public partial class SwitchToGuidIds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Old short ids are not UUIDs, so each one is remapped deterministically
            // with md5. Classes and holds use the same expression on the same value,
            // so the foreign key keeps pointing at the right class.
            migrationBuilder.Sql("""
                ALTER TABLE "holds" DROP CONSTRAINT "FK_holds_classes_ClassId";
                ALTER TABLE "holds" ALTER COLUMN "ClassId" TYPE uuid USING md5("ClassId")::uuid;
                ALTER TABLE "holds" ALTER COLUMN "Id" TYPE uuid USING md5("Id")::uuid;
                ALTER TABLE "classes" ALTER COLUMN "Id" TYPE uuid USING md5("Id")::uuid;
                ALTER TABLE "holds" ADD CONSTRAINT "FK_holds_classes_ClassId"
                    FOREIGN KEY ("ClassId") REFERENCES "classes" ("Id") ON DELETE CASCADE;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The original short ids cannot be recovered from the UUIDs, so this
            // direction clears the rows before returning to the old column type.
            migrationBuilder.Sql("""
                DELETE FROM "holds";
                DELETE FROM "classes";
                ALTER TABLE "holds" DROP CONSTRAINT "FK_holds_classes_ClassId";
                ALTER TABLE "holds" ALTER COLUMN "ClassId" TYPE character varying(10) USING "ClassId"::text;
                ALTER TABLE "holds" ALTER COLUMN "Id" TYPE character varying(10) USING "Id"::text;
                ALTER TABLE "classes" ALTER COLUMN "Id" TYPE character varying(10) USING "Id"::text;
                ALTER TABLE "holds" ADD CONSTRAINT "FK_holds_classes_ClassId"
                    FOREIGN KEY ("ClassId") REFERENCES "classes" ("Id") ON DELETE CASCADE;
                """);
        }
    }
}
