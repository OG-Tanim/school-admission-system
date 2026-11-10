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
Optional overrides (`API_URL`, `HOLD_DURATION_SECONDS`, `POSTGRES_*`) can be placed in a
root `.env` file — copy [.env.example](.env.example). Real `.env` files are git-ignored;
only the template is tracked. The API applies the EF Core migrations on startup, after
waiting for PostgreSQL to accept connections.

### Data persistence

PostgreSQL stores its files in the named volume `postgres_data`, so classes, holds,
and confirmed admissions survive container restarts and `docker compose down` followed
by `docker compose up`.

`docker compose down -v` deletes the volume and therefore the data — use it only when
you want an empty database.

### Changing the backend URL

The default backend URL comes from `config/api-url.env` when that file exists, and from
the `API_URL` environment variable otherwise. At startup the frontend server reads it
and serves it to the page as `/config.js`. The file is mounted read-only into the
container and is never written by the app.

The **Backend URL** field on the page overrides that default for the current browser
only:

- The new value applies immediately to the next request — no page reload and no
  container restart.
- It is stored in the browser's `localStorage`, so it survives a refresh or a reopened
  tab.
- Other users and `config/api-url.env` are unaffected. **Reset to default** returns to
  the environment value.

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

The dev server reads the same `config/api-url.env` file (falling back to the `API_URL`
environment variable) and serves it as the default. The **Backend URL** field behaves as
it does in Docker and applies immediately without restarting `npm run dev`.

## Tests

```bash
dotnet test backend/tests/SchoolAdmission.Api.Tests.csproj
```

The tests start a disposable PostgreSQL 16 container with Testcontainers, apply the
real EF Core migrations, and call the API. Docker must be running. See
[test.md](backend/test.md) for endpoint-by-endpoint coverage.

## Status

Class creation, listing, and detail endpoints plus seat-hold creation
(`POST /classes/{classId}/holds`) are implemented and covered by integration tests.
The remaining hold endpoints, the admission screens, and the other deliverables are
pending; the Docker setup is complete.
