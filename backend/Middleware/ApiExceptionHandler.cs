using Microsoft.AspNetCore.Diagnostics;

namespace SchoolAdmission.Api.Middleware;

/// <summary>
/// Last-resort handler for exceptions no endpoint caught. It keeps the API's
/// error envelope (<c>{"error": "..."}</c>) instead of Problem Details, so the
/// frontend can render every failure the same way, and it never leaks exception
/// details to the caller.
/// </summary>
internal sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        // Returning true stops the default exception logging, so log it here.
        logger.LogError(
            exception,
            "Unhandled exception for {Method} {Path}.",
            httpContext.Request.Method,
            httpContext.Request.Path);

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;

        await httpContext.Response.WriteAsJsonAsync(
            new { error = "An unexpected error occurred. Please try again." },
            cancellationToken);

        return true;
    }
}
