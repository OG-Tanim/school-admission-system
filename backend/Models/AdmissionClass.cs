namespace SchoolAdmission.Api.Models;

public sealed class AdmissionClass
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public int TotalSeats { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<SeatHold> Holds { get; set; } = new List<SeatHold>();
}
