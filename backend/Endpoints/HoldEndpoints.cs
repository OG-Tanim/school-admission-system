using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Common;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Endpoints;

public static class HoldEndpoints
{
    private const string HoldNotFoundMessage = "Hold not found.";
    private const string ClassNotFoundMessage = "Class not found.";
    private const string NotOwnerMessage = "This application belongs to another student.";

    // Cancel messages, reused by the pre-check and the race re-read below.
    private const string AlreadyConfirmedMessage =
        "This application is already confirmed and cannot be cancelled.";

    private const string AlreadyExpiredMessage =
        "This application has expired and can no longer be cancelled.";

    public static IEndpointRouteBuilder MapHoldEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/classes/{classId}/holds", CreateHoldAsync).WithTags("Holds");
        app.MapPost("/holds/{holdId}/confirm", ConfirmHoldAsync).WithTags("Holds");
        app.MapDelete("/holds/{holdId}", CancelHoldAsync).WithTags("Holds");
        app.MapGet("/holds/{holdId}", GetHoldAsync).WithTags("Holds");
        app.MapGet("/me/holds", GetMyHoldsAsync).WithTags("Holds");

        return app;
    }

    private static async Task<IResult> CreateHoldAsync(
        string classId,
        [FromHeader(Name = StudentId.HeaderName)] string? rawStudentId,
        AppDbContext db,
        HoldSettings settings)
    {
        if (!StudentId.TryNormalize(rawStudentId, out var studentId))
        {
            return ApiResults.BadRequest(StudentId.InvalidMessage);
        }

        if (!Guid.TryParse(classId, out var classIdValue))
        {
            return ApiResults.NotFound(ClassNotFoundMessage);
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
            return ApiResults.NotFound(ClassNotFoundMessage);
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
            return ApiResults.Conflict(
                "You already have an active application or confirmed admission in this class.");
        }

        // R1: held + confirmed may never exceed totalSeats. Expired HELD rows
        // count as released.
        var occupied = await db.Holds.CountAsync(h =>
            h.ClassId == classIdValue &&
            (h.Status == HoldStatus.Confirmed ||
             (h.Status == HoldStatus.Held && h.ExpiresAt > now)));

        if (occupied >= totalSeats)
        {
            return ApiResults.Conflict("No seats available in this class.");
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
    }

    private static async Task<IResult> ConfirmHoldAsync(
        string holdId,
        [FromHeader(Name = StudentId.HeaderName)] string? rawStudentId,
        AppDbContext db)
    {
        if (!StudentId.TryNormalize(rawStudentId, out var studentId))
        {
            return ApiResults.BadRequest(StudentId.InvalidMessage);
        }

        if (!Guid.TryParse(holdId, out var holdIdValue))
        {
            return ApiResults.NotFound(HoldNotFoundMessage);
        }

        var hold = await FindHoldAsync(db, holdIdValue);

        if (hold is null)
        {
            return ApiResults.NotFound(HoldNotFoundMessage);
        }

        if (hold.StudentId != studentId)
        {
            return ApiResults.Forbidden(NotOwnerMessage);
        }

        // R5: confirming the same hold again is idempotent — it stays
        // CONFIRMED and the seat is not counted twice.
        if (hold.Status == HoldStatus.Confirmed)
        {
            return Results.Ok(new HoldConfirmedResponse(holdIdValue, HoldStatus.Confirmed));
        }

        if (hold.Status == HoldStatus.Cancelled)
        {
            return ApiResults.Conflict(
                "This application has been cancelled and can no longer be confirmed.");
        }

        var now = DateTimeOffset.UtcNow;

        // R4: only an unexpired HELD application may be confirmed.
        if (hold.Status == HoldStatus.Expired || hold.ExpiresAt <= now)
        {
            return ApiResults.Conflict(
                "This application has expired and can no longer be confirmed. Please apply again.");
        }

        // One confirmed admission per student per class: a second hold in the
        // same class may never be confirmed.
        var alreadyConfirmedInClass = await db.Holds.AnyAsync(h =>
            h.Id != holdIdValue &&
            h.ClassId == hold.ClassId &&
            h.StudentId == studentId &&
            h.Status == HoldStatus.Confirmed);

        if (alreadyConfirmedInClass)
        {
            return ApiResults.Conflict("You already have a confirmed admission in this class.");
        }

        // The status and expiry guard lives in the UPDATE itself, so two
        // simultaneous confirms of the same hold cannot both win.
        var updated = await db.Holds
            .Where(h => h.Id == holdIdValue &&
                        h.StudentId == studentId &&
                        h.Status == HoldStatus.Held &&
                        h.ExpiresAt > now)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(h => h.Status, HoldStatus.Confirmed)
                .SetProperty(h => h.ConfirmedAt, now));

        if (updated == 0)
        {
            // Lost a race to another confirm, or the hold expired in between:
            // report the status that actually won.
            var current = await FindHoldAsync(db, holdIdValue);

            return current?.Status == HoldStatus.Confirmed
                ? Results.Ok(new HoldConfirmedResponse(holdIdValue, HoldStatus.Confirmed))
                : ApiResults.Conflict("This application can no longer be confirmed.");
        }

        return Results.Ok(new HoldConfirmedResponse(holdIdValue, HoldStatus.Confirmed));
    }

    private static async Task<IResult> CancelHoldAsync(
        string holdId,
        [FromHeader(Name = StudentId.HeaderName)] string? rawStudentId,
        AppDbContext db)
    {
        if (!StudentId.TryNormalize(rawStudentId, out var studentId))
        {
            return ApiResults.BadRequest(StudentId.InvalidMessage);
        }

        if (!Guid.TryParse(holdId, out var holdIdValue))
        {
            return ApiResults.NotFound(HoldNotFoundMessage);
        }

        var hold = await FindHoldAsync(db, holdIdValue);

        if (hold is null)
        {
            return ApiResults.NotFound(HoldNotFoundMessage);
        }

        if (hold.StudentId != studentId)
        {
            return ApiResults.Forbidden(NotOwnerMessage);
        }

        // A paid admission is final: the brief has no refund flow.
        if (hold.Status == HoldStatus.Confirmed)
        {
            return ApiResults.Conflict(AlreadyConfirmedMessage);
        }

        // Cancelling is idempotent: the application is already in the terminal
        // CANCELLED state.
        if (hold.Status == HoldStatus.Cancelled)
        {
            return Results.NoContent();
        }

        var now = DateTimeOffset.UtcNow;

        // Expiry is lazy: an elapsed hold already released its seat, so keep
        // EXPIRED instead of overwriting it with CANCELLED.
        if (hold.Status == HoldStatus.Expired || hold.ExpiresAt <= now)
        {
            return ApiResults.Conflict(AlreadyExpiredMessage);
        }

        // The status and expiry guard lives in the UPDATE itself, so a
        // simultaneous confirm cannot also win.
        var updated = await db.Holds
            .Where(h => h.Id == holdIdValue &&
                        h.StudentId == studentId &&
                        h.Status == HoldStatus.Held &&
                        h.ExpiresAt > now)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(h => h.Status, HoldStatus.Cancelled));

        if (updated == 1)
        {
            return Results.NoContent();
        }

        // Lost a race: report the state that actually won.
        var current = await FindHoldAsync(db, holdIdValue);

        if (current is null)
        {
            return ApiResults.NotFound(HoldNotFoundMessage);
        }

        if (current.Status == HoldStatus.Cancelled)
        {
            return Results.NoContent();
        }

        if (current.Status == HoldStatus.Confirmed)
        {
            return ApiResults.Conflict(AlreadyConfirmedMessage);
        }

        return current.Status == HoldStatus.Expired || current.ExpiresAt <= now
            ? ApiResults.Conflict(AlreadyExpiredMessage)
            : ApiResults.Conflict("This application can no longer be cancelled.");
    }

    private static async Task<IResult> GetHoldAsync(string holdId, AppDbContext db)
    {
        if (!Guid.TryParse(holdId, out var holdIdValue))
        {
            return ApiResults.NotFound(HoldNotFoundMessage);
        }

        var hold = await FindHoldAsync(db, holdIdValue);

        if (hold is null)
        {
            return ApiResults.NotFound(HoldNotFoundMessage);
        }

        return Results.Ok(new HoldStatusResponse(
            hold.Id,
            hold.ClassId,
            EffectiveStatus(hold.Status, hold.ExpiresAt),
            hold.ExpiresAt));
    }

    private static async Task<IResult> GetMyHoldsAsync(
        [FromHeader(Name = StudentId.HeaderName)] string? rawStudentId,
        AppDbContext db)
    {
        if (!StudentId.TryNormalize(rawStudentId, out var studentId))
        {
            return ApiResults.BadRequest(StudentId.InvalidMessage);
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
    }

    /// <summary>
    /// The fields the hold endpoints act on, fetched without tracking. A null
    /// result means the id does not exist and the caller answers 404.
    /// </summary>
    private sealed record HoldSnapshot(
        Guid Id,
        Guid ClassId,
        string StudentId,
        HoldStatus Status,
        DateTimeOffset ExpiresAt);

    private static Task<HoldSnapshot?> FindHoldAsync(AppDbContext db, Guid holdId) =>
        db.Holds
            .AsNoTracking()
            .Where(h => h.Id == holdId)
            .Select(h => new HoldSnapshot(h.Id, h.ClassId, h.StudentId, h.Status, h.ExpiresAt))
            .FirstOrDefaultAsync();

    /// <summary>
    /// Expiry is lazy: a HELD row past its ExpiresAt is reported as EXPIRED without
    /// being rewritten, and every other status is reported as stored.
    /// </summary>
    private static HoldStatus EffectiveStatus(HoldStatus status, DateTimeOffset expiresAt) =>
        status == HoldStatus.Held && expiresAt <= DateTimeOffset.UtcNow
            ? HoldStatus.Expired
            : status;
}
