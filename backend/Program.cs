using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);

// EF Core + PostgreSQL. Override the connection string with the
// ConnectionStrings__DefaultConnection environment variable.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Host=localhost;Port=5432;Database=school_admission;Username=postgres;Password=postgres";

builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));

// Seat-hold lifetime. HOLD_DURATION_SECONDS defaults to 600 and is clamped to
// a sane range so a bad value cannot overflow the expiry timestamp.
var holdDurationSeconds =
    int.TryParse(builder.Configuration["HOLD_DURATION_SECONDS"], out var configuredSeconds)
        ? configuredSeconds
        : 600;

if (holdDurationSeconds <= 0 || holdDurationSeconds > 86_400)
{
    holdDurationSeconds = 600;
}

builder.Services.AddSingleton(new HoldSettings(TimeSpan.FromSeconds(holdDurationSeconds)));
builder.Services.AddOpenApi();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

// Enums in responses must use the API contract casing ("HELD", "CONFIRMED", …).
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper));
});

var app = builder.Build();

// Apply migrations before serving traffic. Two backends may start at the same
// time, but Migrate() is a no-op once the schema is current.
if (app.Configuration.GetValue("Database:MigrateOnStartup", true))
{
    await DatabaseMigrator.MigrateAsync(app.Services, app.Logger);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();

app.MapGet("/", () => Results.Ok(new { name = "School Admission API", status = "ok" }));
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapClassEndpoints();
app.MapHoldEndpoints();

app.Run();

public partial class Program { }
