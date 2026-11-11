# School Admission System

## Run with Docker

```bash
docker compose up --build
```

| Service          | URL                            |
| ---------------- | ------------------------------ |
| Frontend         | <http://localhost:3000>        |
| Backend API      | <http://localhost:8080>        |
| API health check | <http://localhost:8080/health> |

The stack needs no local configuration: `docker-compose.yml` carries working defaults.
Optional overrides (`API_URL`, `HOLD_DURATION_SECONDS`, `POSTGRES_*`,
`ConnectionStrings__DefaultConnection`) can be placed in a root `.env` file — copy
[.env.example](.env.example). Real `.env` files are git-ignored; only the template is
tracked.

The database connection is configurable through the `ConnectionStrings__DefaultConnection`
environment variable (the .NET convention for `ConnectionStrings:DefaultConnection`).
When unset, the backend uses an in-network connection assembled from `POSTGRES_*`. The
API applies the EF Core migrations on startup, after waiting for PostgreSQL to accept.

The target database must already exist, and its role must be allowed to create tables:
`Database__MigrateOnStartup: "true"` applies the EF Core migrations when the backend starts.

### #Data persistence

PostgreSQL stores its files in the named volume `postgres_data`, so classes, holds,
and confirmed admissions survive container restarts and `docker compose down` followed
by `docker compose up`.

`docker compose down -v` deletes the volume and therefore the data — use it only when
you want an empty database.

### #Running the backend on its own in Docker for multi backend scenarios

`docker compose run` starts an extra container from the `backend` image without touching
the running stack, which is how you get a second backend to switch to in the UI:

```bash
docker compose up -d                                  # db, backend, frontend
docker compose run -d --name backend-2 -p 8081:8080 backend
```

`run` inherits the service environment, so unless `.env` or `-e` changes it, the new
backend uses the bundled `db` and the **same database** as the first one: both ports serve
the same classes and holds. `db` is started for you if it is not running. The `-p 8081:8080`
flag publishes the extra port — the container always listens on 8080, only the host side
moves.

With its own database on the bundled server:

```bash
docker compose exec db createdb -U postgres school_admission_alt
docker compose run -d --name backend-2 -p 8081:8080 \
  -e 'ConnectionStrings__DefaultConnection=Host=db;Port=5432;Database=school_admission_alt;Username=postgres;Password=postgres' \
  backend
```

`createdb` is the only manual step; the schema is created by the startup migrations.

With an external database, point the same variable at it. From inside a container, a
PostgreSQL published on the host is `host.docker.internal`, **not** `localhost`:

```bash
docker compose run -d --name backend-2 -p 8081:8080 \
  -e 'ConnectionStrings__DefaultConnection=Host=host.docker.internal;Port=5433;Database=postgres;Username=postgres;Password=secret' \
  backend
```

Then open <http://localhost:3000/#/> and set **Backend URL** to `http://localhost:8081`;
the switch applies to the next request in this browser only, and **Reset to default**
returns to `http://localhost:8080`. Two backends on different databases show different data.

- `-e` beats a `ConnectionStrings__DefaultConnection` in `.env`, which `run` also inherits.
- The service's `ports:` are ignored by `run` (only `--service-ports` applies them, and that
  would collide with the backend already on 8080), hence the explicit `-p`.
- `run` containers are not managed by `docker compose up` / `down`; delete this one with
  `docker rm -f backend-2`.

### #Changing the backend URL

The default backend URL comes from `config/api-url.env` when that file exists, and from
the `API_URL` environment variable otherwise. At startup the frontend server reads it
and serves it to the page as `/config.ts`. The file is mounted read-only into the
container and is never written by the app.

The **Backend URL** field on the landing screen overrides that default for the current
browser only:

- The new value applies immediately to the next request — no page reload and no
  container restart.
- It is stored in the browser's `localStorage`, so it survives a refresh or a reopened
  tab.
- Other users and `config/api-url.env` are unaffected. **Reset to default** returns to
  the environment value.

## Tests

Backend:

```bash
dotnet test backend/tests/SchoolAdmission.Api.Tests.csproj
```

The tests start a disposable PostgreSQL 16 container with Testcontainers, apply the
real EF Core migrations, and call the API. Docker must be running. See
[test.md](backend/test.md) for endpoint-by-endpoint coverage.

Frontend:

```bash
cd frontend
npm test
```

Vitest renders the app in jsdom with a stubbed `fetch`, so no backend is needed.

## Status

All eight API endpoints are implemented and covered by backend integration tests. The
frontend is a role-based flow served by the container at <http://localhost:3000>:

| Route                    | Screen                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `#/`                     | Choose school admin or student, and change the backend URL                           |
| `#/admin`                | Create a class and see every class already created                                   |
| `#/student`              | Browse classes with live seat counts, enter the birth-registration number, and apply |
| `#/application/:holdId`  | One application: status, countdown, Pay Admission Fee, and Cancel                    |
| `#/student/applications` | Every application belonging to the current student                                   |

Each screen is a real hash route, so browser Back/Forward and deep links work, and the
role screens are code-split with `React.lazy`. `npm test`, `npm run lint`, and
`npm run build` pass, and the Docker stack serves the full flow end to end.
