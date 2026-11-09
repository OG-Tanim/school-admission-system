using SchoolAdmission.Api.Common;

namespace SchoolAdmission.Api.Models;

public enum HoldStatus
{
    Held,
    Confirmed,
    Expired,
    Cancelled
}

public sealed class SeatHold
{
    public string Id { get; set; } = ShortId.NewHoldId();
    public string ClassId { get; set; } = string.Empty;
    public AdmissionClass AdmissionClass { get; set; } = null!;
    public string StudentId { get; set; } = string.Empty;
    public HoldStatus Status { get; set; } = HoldStatus.Held;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
}
