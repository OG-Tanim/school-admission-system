namespace SchoolAdmission.Api.Endpoints;

public sealed record CreateClassRequest(string? Name, int TotalSeats);

public sealed record ClassCreatedResponse(Guid Id, string Name, int TotalSeats);

public sealed record ClassResponse(Guid Id, string Name, int TotalSeats, int HeldSeats, int ConfirmedSeats)
{
    public int AvailableSeats => TotalSeats - HeldSeats - ConfirmedSeats;
}
