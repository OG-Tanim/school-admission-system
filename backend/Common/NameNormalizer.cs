using System.Text.RegularExpressions;

namespace SchoolAdmission.Api.Common;

public static class NameNormalizer
{
    // Whitespace next to punctuation is not significant, so "Class 6 - Morning Shift",
    // "Class 6- Morning Shift" and "Class 6-Morning Shift" all compare as one class.
    // Symbols are included so "A + B" and "A+B" match as well.
    private static readonly Regex SpacesAroundPunctuation =
        new(@"\s*([\p{P}\p{S}])\s*", RegexOptions.Compiled);

    // Collapses runs of whitespace and lowercases, so "Class  6 - Morning"
    // and "class 6 - morning" compare as the same class name.
    public static string ComparisonKey(string name) =>
        SpacesAroundPunctuation.Replace(
            string.Join(' ', name.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
                .ToLowerInvariant(),
            "$1");
}
