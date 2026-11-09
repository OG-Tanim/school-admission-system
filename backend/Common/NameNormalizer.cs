namespace SchoolAdmission.Api.Common;

public static class NameNormalizer
{
    // Collapses runs of whitespace and lowercases, so "Class  6 - Morning"
    // and "class 6 - morning" compare as the same class name.
    public static string ComparisonKey(string name) =>
        string.Join(' ', name.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
            .ToLowerInvariant();
}
