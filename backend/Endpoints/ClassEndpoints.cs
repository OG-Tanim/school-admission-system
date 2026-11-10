using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SchoolAdmission.Api.Common;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Endpoints;

public static class ClassEndpoints
{
    private const string NotFoundMessage = "Class not found.";

    private const string DuplicateNameMessage =
        "class name already exists, please create class with a different name";

    // PostgreSQL reports the violated constraint/index name on a unique error.
    private const string ClassesNormalizedNameIndex = "IX_classes_NormalizedName";

    public static IEndpointRouteBuilder MapClassEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/classes").WithTags("Classes");

        group.MapPost("", CreateClassAsync);
        group.MapGet("", GetClassesAsync);
        group.MapGet("/{classId}", GetClassAsync);

        return app;
    }

    private static async Task<IResult> CreateClassAsync(CreateClassRequest request, AppDbContext db)
    {
        var name = request.Name?.Trim();

        if (string.IsNullOrWhiteSpace(name) || name.Length > 200 || request.TotalSeats <= 0)
        {
            return ApiResults.BadRequest(
                "Name is required (max 200 characters) and totalSeats must be greater than 0.");
        }

        var normalizedName = NameNormalizer.ComparisonKey(name);

        if (await db.Classes.AnyAsync(x => x.NormalizedName == normalizedName))
        {
            return ApiResults.Conflict(DuplicateNameMessage);
        }

        var admissionClass = new AdmissionClass
        {
            Name = name,
            NormalizedName = normalizedName,
            TotalSeats = request.TotalSeats
        };

        db.Classes.Add(admissionClass);

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (IsDuplicateName(ex))
        {
            // A race can slip past the AnyAsync check; the unique index is the
            // source of truth and maps to the same 409.
            return ApiResults.Conflict(DuplicateNameMessage);
        }

        var created = new ClassCreatedResponse(
            admissionClass.Id,
            admissionClass.Name,
            admissionClass.TotalSeats);

        return Results.Created($"/classes/{admissionClass.Id}", created);
    }

    private static async Task<IResult> GetClassesAsync(AppDbContext db)
    {
        var now = DateTimeOffset.UtcNow;

        var classes = await db.Classes
            .AsNoTracking()
            .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id)
            .Select(ClassSummary(now))
            .ToListAsync();

        return Results.Ok(classes);
    }

    private static async Task<IResult> GetClassAsync(string classId, AppDbContext db)
    {
        if (!Guid.TryParse(classId, out var classIdValue))
        {
            return ApiResults.NotFound(NotFoundMessage);
        }

        var summary = await db.Classes
            .AsNoTracking()
            .Where(x => x.Id == classIdValue)
            .Select(ClassSummary(DateTimeOffset.UtcNow))
            .FirstOrDefaultAsync();

        return summary is null ? ApiResults.NotFound(NotFoundMessage) : Results.Ok(summary);
    }

    /// <summary>
    /// The single projection behind both read endpoints, so the list and the
    /// detail view can never disagree about seat counts. Only unexpired HELD
    /// rows and confirmed admissions occupy a seat.
    /// </summary>
    private static Expression<Func<AdmissionClass, ClassResponse>> ClassSummary(DateTimeOffset now) =>
        x => new ClassResponse(
            x.Id,
            x.Name,
            x.TotalSeats,
            x.Holds.Count(h => h.Status == HoldStatus.Held && h.ExpiresAt > now),
            x.Holds.Count(h => h.Status == HoldStatus.Confirmed));

    private static bool IsDuplicateName(DbUpdateException ex) =>
        ex.InnerException is PostgresException
            { SqlState: PostgresErrorCodes.UniqueViolation } postgres
        && postgres.ConstraintName == ClassesNormalizedNameIndex;
}
