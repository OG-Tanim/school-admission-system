namespace SchoolAdmission.Api.Common;

/// <summary>
/// Every failure returns the same body shape, <c>{"error": "..."}</c>, so the
/// frontend can render any error without special-casing endpoints.
/// </summary>
public static class ApiResults
{
    public static IResult BadRequest(string message) => Results.BadRequest(new { error = message });

    public static IResult NotFound(string message) => Results.NotFound(new { error = message });

    public static IResult Conflict(string message) => Results.Conflict(new { error = message });

    public static IResult Forbidden(string message) =>
        Results.Json(new { error = message }, statusCode: StatusCodes.Status403Forbidden);
}
