using SchoolAdmission.Api.Common;

namespace SchoolAdmission.Api.Tests;

public sealed class NameNormalizerTests
{
    [Theory]
    [InlineData("Class 6 - Morning Shift", "class 6-morning shift")]
    [InlineData("Class 6- Morning Shift", "class 6-morning shift")]
    [InlineData("Class 6 -Morning Shift", "class 6-morning shift")]
    [InlineData("Class 6-Morning Shift", "class 6-morning shift")]
    [InlineData("  CLASS   6   -   MORNING SHIFT  ", "class 6-morning shift")]
    [InlineData("A + B", "a+b")]
    [InlineData("A & B", "a&b")]
    public void ComparisonKey_folds_case_whitespace_and_punctuation_spacing(
        string name,
        string expected)
    {
        Assert.Equal(expected, NameNormalizer.ComparisonKey(name));
    }

    [Fact]
    public void ComparisonKey_keeps_genuinely_different_names_different()
    {
        Assert.NotEqual(
            NameNormalizer.ComparisonKey("Class 6 - A"),
            NameNormalizer.ComparisonKey("Class 6 - B"));

        // Digits separated by a space are a different name, not spacing punctuation.
        Assert.NotEqual(
            NameNormalizer.ComparisonKey("1234435454"),
            NameNormalizer.ComparisonKey("123443545 4"));
    }
}
