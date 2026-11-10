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

    [Fact]
    public async Task ConfirmHold_returns_200_with_contract_fields()
    {
        var classId = await CreateClassAsync("Class 7 - Morning Shift", 120);
        var holdId = await CreateHoldAsync(classId, StudentA);

        var response = await ConfirmHoldAsync(holdId.ToString(), StudentA);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await ReadJsonAsync(response);
        Assert.Equal(holdId, body.GetProperty("holdId").GetGuid());
        Assert.Equal("CONFIRMED", body.GetProperty("status").GetString());
        Assert.Equal(2, body.EnumerateObject().Count());

        var cls = await _client.GetFromJsonAsync<JsonElement>($"/classes/{classId}");
        Assert.Equal(0, cls.GetProperty("heldSeats").GetInt32());
        Assert.Equal(1, cls.GetProperty("confirmedSeats").GetInt32());
        Assert.Equal(119, cls.GetProperty("availableSeats").GetInt32());
    }

    [Fact]
    public async Task ConfirmHold_twice_is_idempotent()
    {
        var classId = await CreateClassAsync("Class 7 - Day Shift", 10);
        var holdId = await CreateHoldAsync(classId, StudentA);

        Assert.Equal(HttpStatusCode.OK, (await ConfirmHoldAsync(holdId.ToString(), StudentA)).StatusCode);

        var second = await ConfirmHoldAsync(holdId.ToString(), StudentA);

        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var body = await ReadJsonAsync(second);
        Assert.Equal(holdId, body.GetProperty("holdId").GetGuid());
        Assert.Equal("CONFIRMED", body.GetProperty("status").GetString());

        var cls = await _client.GetFromJsonAsync<JsonElement>($"/classes/{classId}");
        Assert.Equal(0, cls.GetProperty("heldSeats").GetInt32());
        Assert.Equal(1, cls.GetProperty("confirmedSeats").GetInt32());
    }

    [Fact]
    public async Task Concurrent_confirms_of_same_hold_confirm_only_once()
    {
        var classId = await CreateClassAsync("Class 7 - Evening Shift", 5);
        var holdId = await CreateHoldAsync(classId, StudentA);

        var responses = await Task.WhenAll(Enumerable.Range(0, 10)
            .Select(_ => ConfirmHoldAsync(holdId.ToString(), StudentA)));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));

        var cls = await _client.GetFromJsonAsync<JsonElement>($"/classes/{classId}");
        Assert.Equal(0, cls.GetProperty("heldSeats").GetInt32());
        Assert.Equal(1, cls.GetProperty("confirmedSeats").GetInt32());
    }

    [Fact]
    public async Task ConfirmHold_other_students_hold_returns_403()
    {
        var classId = await CreateClassAsync("Class 8 - Morning Shift", 10);
        var holdId = await CreateHoldAsync(classId, StudentA);

        var response = await ConfirmHoldAsync(holdId.ToString(), StudentB);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("error").GetString()));

        var cls = await _client.GetFromJsonAsync<JsonElement>($"/classes/{classId}");
        Assert.Equal(1, cls.GetProperty("heldSeats").GetInt32());
        Assert.Equal(0, cls.GetProperty("confirmedSeats").GetInt32());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("1234567890123456")]   // 16 digits
    [InlineData("123456789012345678")] // 18 digits
    [InlineData("2015269123456789a")]  // not all digits
    public async Task ConfirmHold_invalid_header_returns_400(string? studentId)
    {
        var classId = await CreateClassAsync("Class 8 - Day Shift", 10);
        var holdId = await CreateHoldAsync(classId, StudentA);

        var response = await ConfirmHoldAsync(holdId.ToString(), studentId);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var cls = await _client.GetFromJsonAsync<JsonElement>($"/classes/{classId}");
        Assert.Equal(0, cls.GetProperty("confirmedSeats").GetInt32());
    }

    [Fact]
    public async Task ConfirmHold_unknown_id_returns_404()
    {
        var response = await ConfirmHoldAsync(Guid.NewGuid().ToString(), StudentA);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ConfirmHold_malformed_id_returns_404()
    {
        var response = await ConfirmHoldAsync("h_missing01", StudentA);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ConfirmHold_expired_returns_409()
    {
        var classId = await CreateClassAsync("Class 9 - Morning Shift", 10);
        var holdId = await SeedHoldAsync(
            classId,
            StudentA,
            HoldStatus.Held,
            DateTimeOffset.UtcNow.AddMinutes(-1));

        var response = await ConfirmHoldAsync(holdId.ToString(), StudentA);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("error").GetString()));

        var cls = await _client.GetFromJsonAsync<JsonElement>($"/classes/{classId}");
        Assert.Equal(0, cls.GetProperty("confirmedSeats").GetInt32());
    }

    [Fact]
    public async Task ConfirmHold_cancelled_returns_409()
    {
        var classId = await CreateClassAsync("Class 9 - Day Shift", 10);
        var holdId = await SeedHoldAsync(
            classId,
            StudentA,
            HoldStatus.Cancelled,
            DateTimeOffset.UtcNow.AddMinutes(5));

        var response = await ConfirmHoldAsync(holdId.ToString(), StudentA);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("error").GetString()));
    }

    [Fact]
    public async Task ConfirmHold_second_hold_in_same_class_returns_409()
    {
        var classId = await CreateClassAsync("Class 10 - Morning Shift", 10);
        var first = await CreateHoldAsync(classId, StudentA);

        // Rule 3 stops a second HELD row through the API, so seed one to
        // exercise "one confirmed admission per student per class".
        var second = await SeedHoldAsync(
            classId,
            StudentA,
            HoldStatus.Held,
            DateTimeOffset.UtcNow.AddMinutes(5));

        Assert.Equal(HttpStatusCode.OK, (await ConfirmHoldAsync(first.ToString(), StudentA)).StatusCode);

        var response = await ConfirmHoldAsync(second.ToString(), StudentA);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.Equal(
            "You already have a confirmed admission in this class.",
            body.GetProperty("error").GetString());

        var cls = await _client.GetFromJsonAsync<JsonElement>($"/classes/{classId}");
        Assert.Equal(1, cls.GetProperty("confirmedSeats").GetInt32());
    }

    [Fact]
    public async Task DeleteHold_returns_204_and_frees_the_seat()
    {
        var classId = await CreateClassAsync("Class 11 - Morning Shift", 10);
        var holdId = await CreateHoldAsync(classId, StudentA);

        var response = await DeleteHoldAsync(holdId.ToString(), StudentA);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.True(string.IsNullOrEmpty(await response.Content.ReadAsStringAsync()));

        var hold = await _client.GetFromJsonAsync<JsonElement>($"/holds/{holdId}");
        Assert.Equal("CANCELLED", hold.GetProperty("status").GetString());

        var cls = await _client.GetFromJsonAsync<JsonElement>($"/classes/{classId}");
        Assert.Equal(0, cls.GetProperty("heldSeats").GetInt32());
        Assert.Equal(10, cls.GetProperty("availableSeats").GetInt32());

        // A cancelled application no longer blocks a fresh one.
        Assert.Equal(HttpStatusCode.Created, (await PostHoldAsync(classId, StudentA)).StatusCode);
    }

    [Fact]
    public async Task DeleteHold_twice_is_idempotent()
    {
        var classId = await CreateClassAsync("Class 11 - Day Shift", 10);
        var holdId = await CreateHoldAsync(classId, StudentA);

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteHoldAsync(holdId.ToString(), StudentA)).StatusCode);

        var second = await DeleteHoldAsync(holdId.ToString(), StudentA);

        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);

        var hold = await _client.GetFromJsonAsync<JsonElement>($"/holds/{holdId}");
        Assert.Equal("CANCELLED", hold.GetProperty("status").GetString());
    }

    [Fact]
    public async Task DeleteHold_other_students_hold_returns_403()
    {
        var classId = await CreateClassAsync("Class 11 - Evening Shift", 10);
        var holdId = await CreateHoldAsync(classId, StudentA);

        var response = await DeleteHoldAsync(holdId.ToString(), StudentB);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("error").GetString()));

        var hold = await _client.GetFromJsonAsync<JsonElement>($"/holds/{holdId}");
        Assert.Equal("HELD", hold.GetProperty("status").GetString());
    }

    [Fact]
    public async Task DeleteHold_expired_returns_409_and_keeps_expired()
    {
        var classId = await CreateClassAsync("Class 12 - Morning Shift", 10);
        var holdId = await SeedHoldAsync(
            classId,
            StudentA,
            HoldStatus.Held,
            DateTimeOffset.UtcNow.AddMinutes(-1));

        var response = await DeleteHoldAsync(holdId.ToString(), StudentA);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("error").GetString()));

        var hold = await _client.GetFromJsonAsync<JsonElement>($"/holds/{holdId}");
        Assert.Equal("EXPIRED", hold.GetProperty("status").GetString());
    }

    [Fact]
    public async Task DeleteHold_confirmed_returns_409_and_keeps_confirmed()
    {
        var classId = await CreateClassAsync("Class 12 - Day Shift", 10);
        var holdId = await CreateHoldAsync(classId, StudentA);
        Assert.Equal(HttpStatusCode.OK, (await ConfirmHoldAsync(holdId.ToString(), StudentA)).StatusCode);

        var response = await DeleteHoldAsync(holdId.ToString(), StudentA);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("error").GetString()));

        var hold = await _client.GetFromJsonAsync<JsonElement>($"/holds/{holdId}");
        Assert.Equal("CONFIRMED", hold.GetProperty("status").GetString());

        var cls = await _client.GetFromJsonAsync<JsonElement>($"/classes/{classId}");
        Assert.Equal(1, cls.GetProperty("confirmedSeats").GetInt32());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("1234567890123456")]   // 16 digits
    [InlineData("123456789012345678")] // 18 digits
    [InlineData("2015269123456789a")]  // not all digits
    public async Task DeleteHold_invalid_header_returns_400(string? studentId)
    {
        var classId = await CreateClassAsync("Class 12 - Evening Shift", 10);
        var holdId = await CreateHoldAsync(classId, StudentA);

        var response = await DeleteHoldAsync(holdId.ToString(), studentId);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var hold = await _client.GetFromJsonAsync<JsonElement>($"/holds/{holdId}");
        Assert.Equal("HELD", hold.GetProperty("status").GetString());
    }

    [Fact]
    public async Task DeleteHold_unknown_or_malformed_id_returns_404()
    {
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await DeleteHoldAsync(Guid.NewGuid().ToString(), StudentA)).StatusCode);

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await DeleteHoldAsync("h_missing01", StudentA)).StatusCode);
    }

    [Fact]
    public async Task Concurrent_deletes_cancel_once()
    {
        var classId = await CreateClassAsync("Class 13 - Morning Shift", 5);
        var holdId = await CreateHoldAsync(classId, StudentA);

        var responses = await Task.WhenAll(Enumerable.Range(0, 5)
            .Select(_ => DeleteHoldAsync(holdId.ToString(), StudentA)));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.NoContent, r.StatusCode));

        var cls = await _client.GetFromJsonAsync<JsonElement>($"/classes/{classId}");
        Assert.Equal(0, cls.GetProperty("heldSeats").GetInt32());
        Assert.Equal(5, cls.GetProperty("availableSeats").GetInt32());
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

    private async Task<Guid> CreateHoldAsync(Guid classId, string studentId)
    {
        var response = await PostHoldAsync(classId, studentId);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var body = await ReadJsonAsync(response);
        return body.GetProperty("holdId").GetGuid();
    }

    private async Task<Guid> SeedHoldAsync(
        Guid classId,
        string studentId,
        HoldStatus status,
        DateTimeOffset expiresAt)
    {
        var hold = new SeatHold
        {
            ClassId = classId,
            StudentId = studentId,
            Status = status,
            ExpiresAt = expiresAt
        };

        using var scope = _fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Holds.Add(hold);
        await db.SaveChangesAsync();

        return hold.Id;
    }

    private async Task<HttpResponseMessage> ConfirmHoldAsync(string holdId, string? studentId)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/holds/{holdId}/confirm");

        if (studentId is not null)
        {
            request.Headers.TryAddWithoutValidation(HoldEndpoints.StudentIdHeader, studentId);
        }

        return await _client.SendAsync(request);
    }

    private async Task<HttpResponseMessage> DeleteHoldAsync(string holdId, string? studentId)
    {
        using var request = new HttpRequestMessage(HttpMethod.Delete, $"/holds/{holdId}");

        if (studentId is not null)
        {
            request.Headers.TryAddWithoutValidation(HoldEndpoints.StudentIdHeader, studentId);
        }

        return await _client.SendAsync(request);
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();
}
