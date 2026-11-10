using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Endpoints;

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

public sealed record HoldConfirmedResponse(
    Guid HoldId,
    HoldStatus Status);

public sealed record MyHoldResponse(
    Guid HoldId,
    Guid ClassId,
    string ClassName,
    HoldStatus Status,
    DateTimeOffset ExpiresAt);
