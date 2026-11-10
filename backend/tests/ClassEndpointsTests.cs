using System.Net;
using System.Text;
using System.Text.Json;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Tests;

[Collection("Postgres")]
public sealed class ClassEndpointsTests : IAsyncLifetime
{
    private const string DuplicateMessage =
        "class name already exists, please create class with a different name";

    private readonly PostgresFixture _fixture;
    private readonly HttpClient _client;

    public ClassEndpointsTests(PostgresFixture fixture)
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
    public async Task CreateClass_returns_201_with_contract_fields()
    {
        var response = await _client.PostAsJsonAsync("/classes", new
        {
            name = "Class 6 - Morning Shift",
            totalSeats = 120
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var body = await ReadJsonAsync(response);
        var id = body.GetProperty("id").GetGuid();

        Assert.NotEqual(Guid.Empty, id);
        Assert.Equal("Class 6 - Morning Shift", body.GetProperty("name").GetString());
        Assert.Equal(120, body.GetProperty("totalSeats").GetInt32());
        Assert.Equal(3, body.EnumerateObject().Count());
        Assert.Equal($"/classes/{id}", response.Headers.Location?.ToString());
    }

    [Fact]
    public async Task GetClasses_returns_all_classes_with_seat_counts()
    {
        await CreateClassAsync("Class 6 - Morning Shift", 120);
        await CreateClassAsync("Class 6 - Day Shift", 80);

        var body = await _client.GetFromJsonAsync<JsonElement>("/classes");

        Assert.Equal(JsonValueKind.Array, body.ValueKind);
        Assert.Equal(2, body.GetArrayLength());

        var morning = body.EnumerateArray()
            .Single(c => c.GetProperty("name").GetString() == "Class 6 - Morning Shift");

        Assert.Equal(120, morning.GetProperty("totalSeats").GetInt32());
        Assert.Equal(0, morning.GetProperty("heldSeats").GetInt32());
        Assert.Equal(0, morning.GetProperty("confirmedSeats").GetInt32());
        Assert.Equal(120, morning.GetProperty("availableSeats").GetInt32());
    }

    [Fact]
    public async Task GetClassById_returns_the_class()
    {
        var created = await CreateClassAsync("Class 7 - Morning Shift", 60);
        var id = created.GetProperty("id").GetGuid();

        var body = await _client.GetFromJsonAsync<JsonElement>($"/classes/{id}");

        Assert.Equal(id, body.GetProperty("id").GetGuid());
        Assert.Equal("Class 7 - Morning Shift", body.GetProperty("name").GetString());
        Assert.Equal(60, body.GetProperty("totalSeats").GetInt32());
        Assert.Equal(60, body.GetProperty("availableSeats").GetInt32());
    }

    [Fact]
    public async Task GetClassById_unknown_returns_404()
    {
        var response = await _client.GetAsync("/classes/c_missing01");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.Equal("Class not found.", body.GetProperty("error").GetString());
    }

    [Theory]
    [InlineData("class 6 - morning shift")]
    [InlineData("Class   6   -   Morning Shift")]
    [InlineData("  CLASS 6 - MORNING SHIFT  ")]
    public async Task CreateClass_duplicate_name_returns_409(string duplicateName)
    {
        await CreateClassAsync("Class 6 - Morning Shift", 120);

        var response = await _client.PostAsJsonAsync("/classes", new
        {
            name = duplicateName,
            totalSeats = 10
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.Equal(DuplicateMessage, body.GetProperty("error").GetString());
    }

    [Theory]
    [InlineData("""{"name":"","totalSeats":10}""")]
    [InlineData("""{"name":"   ","totalSeats":10}""")]
    [InlineData("""{"name":"Class 6","totalSeats":0}""")]
    [InlineData("""{"name":"Class 6","totalSeats":-1}""")]
    [InlineData("""{"totalSeats":10}""")]
    [InlineData("""{"name":"Class 6"}""")]
    public async Task CreateClass_invalid_input_returns_400(string json)
    {
        var response = await _client.PostAsync(
            "/classes",
            new StringContent(json, Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateClass_name_over_200_chars_returns_400()
    {
        var response = await _client.PostAsJsonAsync("/classes", new
        {
            name = new string('a', 201),
            totalSeats = 10
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateClass_malformed_json_returns_400()
    {
        var response = await _client.PostAsync(
            "/classes",
            new StringContent("{\"name\":", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateClass_trims_edges_but_preserves_internal_spacing()
    {
        var body = await CreateClassAsync("  Class   8  -  Day  Shift  ", 40);

        Assert.Equal("Class   8  -  Day  Shift", body.GetProperty("name").GetString());
    }

    [Fact]
    public async Task GetClass_counts_active_holds_and_confirmed_seats_only()
    {
        var created = await CreateClassAsync("Class 9 - Morning Shift", 30);
        var id = created.GetProperty("id").GetGuid();
        var now = DateTimeOffset.UtcNow;

        using (var scope = _fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Holds.AddRange(
                new SeatHold
                {
                    ClassId = id,
                    StudentId = "20152691234567890",
                    Status = HoldStatus.Held,
                    ExpiresAt = now.AddMinutes(10)
                },
                new SeatHold
                {
                    ClassId = id,
                    StudentId = "20152691234567891",
                    Status = HoldStatus.Held,
                    ExpiresAt = now.AddMinutes(-10)
                },
                new SeatHold
                {
                    ClassId = id,
                    StudentId = "20152691234567892",
                    Status = HoldStatus.Confirmed,
                    ExpiresAt = now.AddMinutes(10),
                    ConfirmedAt = now
                });

            await db.SaveChangesAsync();
        }

        var body = await _client.GetFromJsonAsync<JsonElement>($"/classes/{id}");

        Assert.Equal(1, body.GetProperty("heldSeats").GetInt32());
        Assert.Equal(1, body.GetProperty("confirmedSeats").GetInt32());
        Assert.Equal(28, body.GetProperty("availableSeats").GetInt32());
    }

    [Fact]
    public async Task Concurrent_duplicate_creates_create_only_one_class()
    {
        var names = Enumerable.Range(0, 8)
            .Select(i => i % 2 == 0 ? "Class 10 - Race" : "class   10 - RACE")
            .ToArray();

        var responses = await Task.WhenAll(names.Select(name =>
            _client.PostAsJsonAsync("/classes", new { name, totalSeats = 10 })));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(names.Length - 1, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));

        var classes = await _client.GetFromJsonAsync<JsonElement>("/classes");
        Assert.Equal(1, classes.GetArrayLength());
    }

    private async Task<JsonElement> CreateClassAsync(string name, int totalSeats)
    {
        var response = await _client.PostAsJsonAsync("/classes", new { name, totalSeats });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await ReadJsonAsync(response);
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();
}
