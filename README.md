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

Defaults come from the tracked [.env](.env) file: `API_URL`, `HOLD_DURATION_SECONDS`,
and the `POSTGRES_*` credentials. The API applies the EF Core migrations on startup,
after waiting for PostgreSQL to accept connections.

### Data persistence

PostgreSQL stores its files in the named volume `postgres_data`, so classes, holds,
and confirmed admissions survive container restarts and `docker compose down` followed
by `docker compose up`.

`docker compose down -v` deletes the volume and therefore the data — use it only when
you want an empty database.

### Changing the backend URL

At startup the frontend reads `API_URL` from [.env](.env) (falling back to the
container's `API_URL` environment variable) and serves it to the page as
`/config.js`. The **Backend URL** field on the page writes the new value back into
`.env`; the running page keeps using the URL it loaded with, so restart the frontend
to connect to the new backend:

```bash
docker compose restart frontend
```

`docker compose up -d` also works — it recreates the containers and picks the value up.
No rebuild is needed. You can equally edit `API_URL` in `.env` by hand.

> The UI updates the tracked `.env` file, so `git status` will show that change after
> saving a different URL.

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

The dev server reads and writes the same root `.env` file, so the **Backend URL**
field behaves as it does in Docker (restart `npm run dev` to apply a change).

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
