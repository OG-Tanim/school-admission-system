using System.Security.Cryptography;

namespace SchoolAdmission.Api.Common;

/// <summary>
/// Generates short, URL-safe IDs for use as API path parameters (e.g. c_K7mQ2xR9).
/// </summary>
public static class ShortId
{
    private const string Alphabet =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    private const int PrefixLength = 2;
    private const int RandomLength = 8;

    public const int MaxLength = PrefixLength + RandomLength;

    public static string NewClassId() => $"c_{Generate()}";

    public static string NewHoldId() => $"h_{Generate()}";

    private static string Generate()
    {
        Span<char> chars = stackalloc char[RandomLength];

        for (var i = 0; i < chars.Length; i++)
        {
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }

        return new string(chars);
    }
}
