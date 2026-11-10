using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Endpoints;

public static class HoldEndpoints
{
    public const string StudentIdHeader = "X-Student-Id";

    public static IEndpointRouteBuilder MapHoldEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/classes/{classId}/holds", async (
            string classId,
            [FromHeader(Name = StudentIdHeader)] string? studentId,
            AppDbContext db,
            HoldSettings settings) =>
        {
            studentId = studentId?.Trim();

            if (studentId is null || studentId.Length != 17 || !studentId.All(char.IsAsciiDigit))
            {
                return Results.BadRequest(new
                {
                    error = "X-Student-Id header must be the 17-digit birth-registration number."
                });
            }

            if (!Guid.TryParse(classId, out var classIdValue))
            {
                return Results.NotFound(new { error = "Class not found." });
            }

            // One timestamp for both the availability check and the new expiry,
            // so the two always agree.
            var now = DateTimeOffset.UtcNow;

            await using var transaction = await db.Database.BeginTransactionAsync();

            // Serialize every hold creation for this class. The lock lives in
            // PostgreSQL, so it also covers several backend processes sharing the
            // same database. It is held only for the milliseconds of this
            // transaction, never for the hold's lifetime, so a long
            // HOLD_DURATION_SECONDS does not reduce concurrency.
            await db.Database.ExecuteSqlRawAsync(
                "SELECT 1 FROM classes WHERE \"Id\" = {0} FOR UPDATE",
                classIdValue);

            var totalSeats = await db.Classes
                .AsNoTracking()
                .Where(x => x.Id == classIdValue)
                .Select(x => (int?)x.TotalSeats)
                .FirstOrDefaultAsync();

            if (totalSeats is null)
            {
                return Results.NotFound(new { error = "Class not found." });
            }

            // R3 (per class): at most one active HELD or confirmed admission for
            // this student in this class. Expiry is lazy: an expired HELD row no
            // longer counts.
            var alreadyActive = await db.Holds.AnyAsync(h =>
                h.ClassId == classIdValue &&
                h.StudentId == studentId &&
                (h.Status == HoldStatus.Confirmed ||
                 (h.Status == HoldStatus.Held && h.ExpiresAt > now)));

            if (alreadyActive)
            {
                return Results.Conflict(new
                {
                    error = "You already have an active application or confirmed admission in this class."
                });
            }

            // R1: held + confirmed may never exceed totalSeats. Expired HELD rows
            // count as released.
            var occupied = await db.Holds.CountAsync(h =>
                h.ClassId == classIdValue &&
                (h.Status == HoldStatus.Confirmed ||
                 (h.Status == HoldStatus.Held && h.ExpiresAt > now)));

            if (occupied >= totalSeats)
            {
                return Results.Conflict(new { error = "No seats available in this class." });
            }

            var hold = new SeatHold
            {
                ClassId = classIdValue,
                StudentId = studentId,
                Status = HoldStatus.Held,
                ExpiresAt = now + settings.Duration
            };

            db.Holds.Add(hold);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();

            var response = new HoldCreatedResponse(
                hold.Id,
                hold.ClassId,
                hold.StudentId,
                hold.Status,
                hold.ExpiresAt);

            return Results.Created($"/holds/{hold.Id}", response);
        });

        app.MapGet("/holds/{holdId}", async (string holdId, AppDbContext db) =>
        {
            if (!Guid.TryParse(holdId, out var holdIdValue))
            {
                return Results.NotFound(new { error = "Hold not found." });
            }

            var hold = await db.Holds
                .AsNoTracking()
                .Where(x => x.Id == holdIdValue)
                .Select(x => new
                {
                    x.Id,
                    x.ClassId,
                    x.Status,
                    x.ExpiresAt
                })
                .FirstOrDefaultAsync();

            if (hold is null)
            {
                return Results.NotFound(new { error = "Hold not found." });
            }

            return Results.Ok(new HoldStatusResponse(
                hold.Id,
                hold.ClassId,
                EffectiveStatus(hold.Status, hold.ExpiresAt),
                hold.ExpiresAt));
        });

        app.MapGet("/me/holds", async (
            [FromHeader(Name = StudentIdHeader)] string? studentId,
            AppDbContext db) =>
        {
            studentId = studentId?.Trim();

            if (studentId is null || studentId.Length != 17 || !studentId.All(char.IsAsciiDigit))
            {
                return Results.BadRequest(new
                {
                    error = "X-Student-Id header must be the 17-digit birth-registration number."
                });
            }

            var holds = await db.Holds
                .AsNoTracking()
                .Where(h => h.StudentId == studentId)
                .OrderByDescending(h => h.CreatedAt).ThenByDescending(h => h.Id)
                .Select(h => new
                {
                    h.Id,
                    h.ClassId,
                    ClassName = h.AdmissionClass.Name,
                    h.Status,
                    h.ExpiresAt
                })
                .ToListAsync();

            var response = holds.Select(h => new MyHoldResponse(
                h.Id,
                h.ClassId,
                h.ClassName,
                EffectiveStatus(h.Status, h.ExpiresAt),
                h.ExpiresAt));

            return Results.Ok(response);
        });

        return app;
    }

    /// <summary>
    /// Expiry is lazy: a HELD row past its ExpiresAt is reported as EXPIRED without
    /// being rewritten, and every other status is reported as stored.
    /// </summary>
    private static HoldStatus EffectiveStatus(HoldStatus status, DateTimeOffset expiresAt) =>
        status == HoldStatus.Held && expiresAt <= DateTimeOffset.UtcNow
            ? HoldStatus.Expired
            : status;
}

/// <summary>Configured seat-hold lifetime (from HOLD_DURATION_SECONDS).</summary>
public sealed record HoldSettings(TimeSpan Duration);

public sealed record HoldCreatedResponse(
    Guid HoldId,
    Guid ClassId,
    string StudentId,
    HoldStatus Status,
    DateTimeOffset ExpiresAt);

public sealed record HoldStatusResponse(
    Guid HoldId,
    Guid ClassId,
    HoldStatus Status,
    DateTimeOffset ExpiresAt);

public sealed record MyHoldResponse(
    Guid HoldId,
    Guid ClassId,
    string ClassName,
    HoldStatus Status,
    DateTimeOffset ExpiresAt);
