using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SchoolAdmission.Api.Data;
using Testcontainers.PostgreSql;

namespace SchoolAdmission.Api.Tests;

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
    }

    // Applies migrations and empties both tables so every test starts clean.
    public async Task ResetDatabaseAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.MigrateAsync();
        await db.Holds.ExecuteDeleteAsync();
        await db.Classes.ExecuteDeleteAsync();
    }
}

public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();

    public ApiFactory Factory { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        Environment.SetEnvironmentVariable(
            "ConnectionStrings__DefaultConnection",
            _postgres.GetConnectionString());

        Factory = new ApiFactory();
        await Factory.ResetDatabaseAsync();
    }

    public async Task DisposeAsync()
    {
        await Factory.DisposeAsync();
        await _postgres.DisposeAsync();
    }
}

/// <summary>
/// One PostgreSQL container for the whole test assembly. The connection string is
/// passed through a process-wide environment variable, so a single shared fixture
/// avoids two test classes racing to overwrite it.
/// </summary>
[CollectionDefinition("Postgres")]
public sealed class PostgresCollection : ICollectionFixture<PostgresFixture>
{
}

