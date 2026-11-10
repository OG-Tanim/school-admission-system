using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Endpoints;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Tests;

[Collection("Postgres")]
public sealed class HoldEndpointsTests : IAsyncLifetime
{
    private const string StudentA = "20152691234567890";
    private const string StudentB = "20152691234567891";

    private readonly PostgresFixture _fixture;
    private readonly HttpClient _client;

    public HoldEndpointsTests(PostgresFixture fixture)
    {
        _fixture = fixture;
        _client = fixture.Factory.CreateClient();
    }

    public Task InitializeAsync() => _fixture.Factory.ResetDatabaseAsync();

    public Task DisposeAsync()
    {
        _client.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task CreateHold_returns_201_with_contract_fields()
    {
        var classId = await CreateClassAsync("Class 6 - Morning Shift", 120);

        var response = await PostHoldAsync(classId, StudentA);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var body = await ReadJsonAsync(response);
        var holdId = body.GetProperty("holdId").GetGuid();

        Assert.NotEqual(Guid.Empty, holdId);
        Assert.Equal(classId, body.GetProperty("classId").GetGuid());
        Assert.Equal(StudentA, body.GetProperty("studentId").GetString());
        Assert.Equal("HELD", body.GetProperty("status").GetString());
        Assert.True(body.GetProperty("expiresAt").GetDateTimeOffset() > DateTimeOffset.UtcNow);
        Assert.Equal($"/holds/{holdId}", response.Headers.Location?.ToString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("1234567890123456")]   // 16 digits
    [InlineData("123456789012345678")] // 18 digits
    [InlineData("2015269123456789a")]  // not all digits
    public async Task CreateHold_invalid_header_returns_400(string? studentId)
    {
        var classId = await CreateClassAsync("Class 6 - Morning Shift", 10);

        var response = await PostHoldAsync(classId, studentId);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateHold_unknown_class_returns_404()
    {
        var response = await PostHoldAsync(Guid.NewGuid(), StudentA);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.Equal("Class not found.", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task CreateHold_when_no_seats_returns_409()
    {
        var classId = await CreateClassAsync("Class 6 - Morning Shift", 1);
        Assert.Equal(HttpStatusCode.Created, (await PostHoldAsync(classId, StudentA)).StatusCode);

        var response = await PostHoldAsync(classId, StudentB);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.Equal("No seats available in this class.", body.GetProperty("error").GetString());

        var cls = await _client.GetFromJsonAsync<JsonElement>($"/classes/{classId}");
        Assert.Equal(1, cls.GetProperty("heldSeats").GetInt32());
        Assert.Equal(0, cls.GetProperty("availableSeats").GetInt32());
    }

    [Fact]
    public async Task CreateHold_same_student_same_class_twice_returns_409()
    {
        var classId = await CreateClassAsync("Class 6 - Morning Shift", 10);
        Assert.Equal(HttpStatusCode.Created, (await PostHoldAsync(classId, StudentA)).StatusCode);

        var response = await PostHoldAsync(classId, StudentA);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.Equal(
            "You already have an active application or confirmed admission in this class.",
            body.GetProperty("error").GetString());

        using var scope = _fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(
            1,
            await db.Holds.CountAsync(h =>
                h.ClassId == classId && h.StudentId == StudentA && h.Status == HoldStatus.Held));
    }

    [Fact]
    public async Task CreateHold_same_student_different_classes_succeeds()
    {
        var morning = await CreateClassAsync("Class 3 - Morning Shift", 10);
        var day = await CreateClassAsync("Class 3 - Day Shift", 10);

        Assert.Equal(HttpStatusCode.Created, (await PostHoldAsync(morning, StudentA)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await PostHoldAsync(day, StudentA)).StatusCode);
    }

    [Fact]
    public async Task CreateHold_after_expiry_releases_seat_and_ignores_r3()
    {
        var capacityClass = await CreateClassAsync("Class 4 - Morning Shift", 1);
        var retryClass = await CreateClassAsync("Class 4 - Day Shift", 1);
        var now = DateTimeOffset.UtcNow;

        using (var scope = _fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Holds.AddRange(
                new SeatHold
                {
                    ClassId = capacityClass,
                    StudentId = StudentA,
                    Status = HoldStatus.Held,
                    ExpiresAt = now.AddMinutes(-1)
                },
                new SeatHold
                {
                    ClassId = retryClass,
                    StudentId = StudentA,
                    Status = HoldStatus.Held,
                    ExpiresAt = now.AddMinutes(-1)
                });

            await db.SaveChangesAsync();
        }

        // The expired hold no longer occupies the only seat...
        Assert.Equal(HttpStatusCode.Created, (await PostHoldAsync(capacityClass, StudentB)).StatusCode);

        // ...and no longer blocks the same student from re-applying.
        Assert.Equal(HttpStatusCode.Created, (await PostHoldAsync(retryClass, StudentA)).StatusCode);
    }

    [Fact]
    public async Task Concurrent_holds_never_exceed_total_seats()
    {
        const int seats = 5;
        const int attempts = 30;
        var classId = await CreateClassAsync("Class 5 - Morning Shift", seats);

        var responses = await Task.WhenAll(Enumerable.Range(0, attempts)
            .Select(i => PostHoldAsync(classId, $"2015269123456{i:0000}")));

        Assert.Equal(seats, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(attempts - seats, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));

        var cls = await _client.GetFromJsonAsync<JsonElement>($"/classes/{classId}");
        var held = cls.GetProperty("heldSeats").GetInt32();
        var confirmed = cls.GetProperty("confirmedSeats").GetInt32();

        Assert.Equal(seats, held);
        Assert.Equal(0, confirmed);
        Assert.True(held + confirmed <= seats);
        Assert.Equal(0, cls.GetProperty("availableSeats").GetInt32());
    }

    private async Task<Guid> CreateClassAsync(string name, int totalSeats)
    {
        var response = await _client.PostAsJsonAsync("/classes", new { name, totalSeats });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var body = await ReadJsonAsync(response);
        return body.GetProperty("id").GetGuid();
    }

    private async Task<HttpResponseMessage> PostHoldAsync(Guid classId, string? studentId)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/classes/{classId}/holds");

        if (studentId is not null)
        {
            request.Headers.TryAddWithoutValidation(HoldEndpoints.StudentIdHeader, studentId);
        }

        return await _client.SendAsync(request);
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();
}
