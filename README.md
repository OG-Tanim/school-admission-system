# School Admission System

Monorepo for the Onnorokom Projukti school admission assignment: an ASP.NET Core
minimal API, PostgreSQL, and a React UI, all runnable with Docker Compose.

## Run with Docker

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | <http://localhost:3000> |
| Backend API | <http://localhost:8080> |
| API health check | <http://localhost:8080/health> |

The stack needs no local configuration: `docker-compose.yml` carries working defaults.
Optional overrides can be placed in a root `.env` file (`API_URL`,
`HOLD_DURATION_SECONDS`, `POSTGRES_*`); it is git-ignored. The API applies the EF Core
migrations on startup, after waiting for PostgreSQL to accept connections.

### Data persistence

PostgreSQL stores its files in the named volume `postgres_data`, so classes, holds,
and confirmed admissions survive container restarts and `docker compose down` followed
by `docker compose up`.

`docker compose down -v` deletes the volume and therefore the data — use it only when
you want an empty database.

### Changing the backend URL

The frontend keeps its backend URL in `config/api-url.env` (git-ignored, created on the
first save). At startup the frontend server reads it — falling back to the `API_URL`
environment variable — and serves it to the page as `/config.js`.

The **Backend URL** field on the page writes the new value into that file. The running
page keeps the URL it loaded with, so restart the frontend to connect to the new
backend:

```bash
docker compose restart frontend
```

`docker compose up -d` also works — it recreates the containers and picks the value up.
No rebuild is needed. You can equally edit `config/api-url.env` by hand.

## Run without Docker

Backend (needs a reachable PostgreSQL and the .NET 10 SDK):

```bash
cd backend
dotnet restore
dotnet ef database update
dotnet run                  # http://localhost:8080
```

Override the connection with `ConnectionStrings__DefaultConnection`
(`Database__MigrateOnStartup=false` skips startup migrations).

Frontend (Node.js 20.19+ or 22.12+):

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

The dev server reads and writes the same `config/api-url.env` file, so the **Backend
URL** field behaves as it does in Docker (restart `npm run dev` to apply a change).

## Tests

```bash
dotnet test backend/tests/SchoolAdmission.Api.Tests.csproj
```

The tests start a disposable PostgreSQL 16 container with Testcontainers, apply the
real EF Core migrations, and call the API. Docker must be running. See
[test.md](backend/test.md) for endpoint-by-endpoint coverage.

## Status

Class creation, listing, and detail endpoints are implemented and covered by
integration tests. Seat-hold endpoints, the admission screens, and the remaining
deliverables are pending; the Docker setup is complete.
