using Microsoft.EntityFrameworkCore;
using Npgsql;
using SchoolAdmission.Api.Common;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Endpoints;

public static class ClassEndpoints
{
    private const string DuplicateNameMessage =
        "class name already exists, please create class with a different name";

    public static IEndpointRouteBuilder MapClassEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/classes");

        group.MapPost("", async (CreateClassRequest request, AppDbContext db) =>
        {
            var name = request.Name?.Trim();

            if (string.IsNullOrWhiteSpace(name) || name.Length > 200 || request.TotalSeats <= 0)
            {
                return Results.BadRequest(new
                {
                    error = "Name is required (max 200 characters) and totalSeats must be greater than 0."
                });
            }

            var normalizedName = NameNormalizer.ComparisonKey(name);

            if (await db.Classes.AnyAsync(x => x.NormalizedName == normalizedName))
            {
                return Results.Conflict(new { error = DuplicateNameMessage });
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
            catch (DbUpdateException ex)
                when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                return Results.Conflict(new { error = DuplicateNameMessage });
            }

            var response = new ClassCreatedResponse(admissionClass.Id, admissionClass.Name, admissionClass.TotalSeats);
            return Results.Created($"/classes/{admissionClass.Id}", response);
        });

        group.MapGet("", async (AppDbContext db) =>
        {
            var now = DateTimeOffset.UtcNow;

            var classes = await db.Classes
                .AsNoTracking()
                .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id)
                .Select(x => new ClassResponse(
                    x.Id,
                    x.Name,
                    x.TotalSeats,
                    x.Holds.Count(h => h.Status == HoldStatus.Held && h.ExpiresAt > now),
                    x.Holds.Count(h => h.Status == HoldStatus.Confirmed)))
                .ToListAsync();

            return Results.Ok(classes);
        });

        group.MapGet("/{classId}", async (string classId, AppDbContext db) =>
        {
            var now = DateTimeOffset.UtcNow;

            var admissionClass = await db.Classes
                .AsNoTracking()
                .Where(x => x.Id == classId)
                .Select(x => new ClassResponse(
                    x.Id,
                    x.Name,
                    x.TotalSeats,
                    x.Holds.Count(h => h.Status == HoldStatus.Held && h.ExpiresAt > now),
                    x.Holds.Count(h => h.Status == HoldStatus.Confirmed)))
                .FirstOrDefaultAsync();

            return admissionClass is null
                ? Results.NotFound(new { error = "Class not found." })
                : Results.Ok(admissionClass);
        });

        return app;
    }

    public sealed record CreateClassRequest(string? Name, int TotalSeats);

    public sealed record ClassCreatedResponse(string Id, string Name, int TotalSeats);

    public sealed record ClassResponse(string Id, string Name, int TotalSeats, int HeldSeats, int ConfirmedSeats)
    {
        public int AvailableSeats => TotalSeats - HeldSeats - ConfirmedSeats;
    }
}
