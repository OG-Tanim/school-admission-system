using Microsoft.EntityFrameworkCore;

namespace SchoolAdmission.Api.Data;

/// <summary>
/// Applies pending EF Core migrations at startup. PostgreSQL may still be
/// starting up when the API container boots, so connection failures are
/// retried for a while before giving up.
/// </summary>
public static class DatabaseMigrator
{
    private const int MaxAttempts = 30;
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(2);

    public static async Task MigrateAsync(
        IServiceProvider services,
        ILogger logger,
        CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await db.Database.MigrateAsync(cancellationToken);
                logger.LogInformation("Database migrations applied.");
                return;
            }
            catch (Exception exception) when (attempt < MaxAttempts)
            {
                logger.LogWarning(
                    exception,
                    "Database is not ready (attempt {Attempt}/{MaxAttempts}); retrying in {Delay} seconds.",
                    attempt,
                    MaxAttempts,
                    RetryDelay.TotalSeconds);

                await Task.Delay(RetryDelay, cancellationToken);
            }
        }
    }
}
