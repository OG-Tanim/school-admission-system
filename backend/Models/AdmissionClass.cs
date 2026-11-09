using SchoolAdmission.Api.Common;

namespace SchoolAdmission.Api.Models;

public sealed class AdmissionClass
{
    public string Id { get; set; } = ShortId.NewClassId();
    public string Name { get; set; } = string.Empty;
    public string NormalizedName { get; set; } = string.Empty;
    public int TotalSeats { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<SeatHold> Holds { get; set; } = new List<SeatHold>();
}
