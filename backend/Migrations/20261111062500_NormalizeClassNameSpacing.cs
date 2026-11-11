using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SchoolAdmission.Api.Migrations
{
    /// <summary>
    /// Applies the punctuation-aware class-name normalization
    /// ("Class 6 - Morning Shift" == "Class 6- Morning Shift") to rows created before the
    /// rule changed, then reconciles the duplicates that the new rule exposes.
    /// The SQL expression must stay in sync with NameNormalizer.ComparisonKey.
    /// </summary>
    public partial class NormalizeClassNameSpacing : Migration
    {
        private const string NormalizeSql = """
            UPDATE "classes"
               SET "NormalizedName" = regexp_replace(
                       lower(btrim(regexp_replace("Name", '\s+', ' ', 'g'))),
                       '\s*([[:punct:]])\s*', '\1', 'g');
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_classes_NormalizedName",
                table: "classes");

            // 1. Recompute every stored key with the new rule.
            migrationBuilder.Sql(NormalizeSql);

            // 2. A duplicate class with no applications is redundant: keep the oldest
            //    row of each group and delete the rest.
            migrationBuilder.Sql("""
                DELETE FROM "classes" c
                USING (
                    SELECT "Id",
                           row_number() OVER (
                               PARTITION BY "NormalizedName"
                               ORDER BY "CreatedAt", "Id") AS rn
                    FROM "classes"
                ) ranked
                WHERE c."Id" = ranked."Id"
                  AND ranked.rn > 1
                  AND NOT EXISTS (
                      SELECT 1 FROM "holds" h WHERE h."ClassId" = c."Id");
                """);

            // 3. A duplicate that already has applications cannot be dropped without
            //    losing them, so give it a unique legacy name instead.
            migrationBuilder.Sql("""
                UPDATE "classes" c
                   SET "Name" = left(c."Name", 170)
                       || ' (duplicate ' || left(c."Id"::text, 8) || ')'
                FROM (
                    SELECT "Id",
                           row_number() OVER (
                               PARTITION BY "NormalizedName"
                               ORDER BY "CreatedAt", "Id") AS rn
                    FROM "classes"
                ) ranked
                WHERE c."Id" = ranked."Id"
                  AND ranked.rn > 1;
                """);

            // 4. Recompute the keys of the rows renamed in step 3.
            migrationBuilder.Sql(NormalizeSql);

            migrationBuilder.CreateIndex(
                name: "IX_classes_NormalizedName",
                table: "classes",
                column: "NormalizedName",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rows deleted in step 2 cannot be restored, so this only reverts the
            // normalization rule and the index.
            migrationBuilder.DropIndex(
                name: "IX_classes_NormalizedName",
                table: "classes");

            migrationBuilder.Sql("""
                UPDATE "classes"
                   SET "NormalizedName" = lower(btrim(regexp_replace("Name", '\s+', ' ', 'g')));
                """);

            migrationBuilder.CreateIndex(
                name: "IX_classes_NormalizedName",
                table: "classes",
                column: "NormalizedName",
                unique: true);
        }
    }
}
