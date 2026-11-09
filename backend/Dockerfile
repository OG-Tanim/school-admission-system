# syntax=docker/dockerfile:1

# ---------- build ----------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first so NuGet downloads are cached while only source files change.
COPY SchoolAdmission.Api.csproj ./
RUN dotnet restore SchoolAdmission.Api.csproj

COPY . ./
RUN dotnet publish SchoolAdmission.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

# ---------- runtime ----------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_NOLOGO=1

EXPOSE 8080

COPY --from=build --chown=app:app /app/publish ./
USER app

ENTRYPOINT ["dotnet", "SchoolAdmission.Api.dll"]
