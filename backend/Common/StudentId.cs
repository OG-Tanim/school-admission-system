namespace SchoolAdmission.Api.Common;

/// <summary>
/// The assignment has no login: the caller identifies itself with its 17-digit
/// birth-registration number in the X-Student-Id header.
/// </summary>
public static class StudentId
{
    public const string HeaderName = "X-Student-Id";

    public const string InvalidMessage =
        "X-Student-Id header must be the 17-digit birth-registration number.";

    /// <summary>
    /// Trims surrounding whitespace and accepts the value only when it is
    /// exactly 17 ASCII digits. Anything else (missing, wrong length,
    /// non-digit) is rejected, so every endpoint shares one definition of a
    /// valid student id.
    /// </summary>
    public static bool TryNormalize(string? headerValue, out string studentId)
    {
        var value = headerValue?.Trim();

        if (value is null || value.Length != 17 || !value.All(char.IsAsciiDigit))
        {
            studentId = string.Empty;
            return false;
        }

        studentId = value;
        return true;
    }
}
