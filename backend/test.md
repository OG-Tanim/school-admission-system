# Backend Tests

Automated tests live in [`tests/`](tests/) and cover the class endpoints implemented so far.

- Framework: xUnit 2.9.3
- API host: `WebApplicationFactory<Program>` (in-memory TestServer, no fixed port)
- Database: real PostgreSQL 16 container via Testcontainers
- Test class: [`tests/ClassEndpointsTests.cs`](tests/ClassEndpointsTests.cs)
- Fixture/factory: [`tests/ApiFactory.cs`](tests/ApiFactory.cs)

## Running the tests

Docker must be running. The first run pulls `postgres:16-alpine`.

```bash
dotnet test backend/tests/SchoolAdmission.Api.Tests.csproj
```

Run one endpoint group (from the repository root):

```bash
dotnet test backend/tests/SchoolAdmission.Api.Tests.csproj --filter "FullyQualifiedName~CreateClass"
dotnet test backend/tests/SchoolAdmission.Api.Tests.csproj --filter "FullyQualifiedName~GetClasses"
dotnet test backend/tests/SchoolAdmission.Api.Tests.csproj --filter "FullyQualifiedName~GetClassById"
```

## Test isolation

One PostgreSQL container is started per test class. Before every test,
`ApiFactory.ResetDatabaseAsync()` applies the EF Core migrations (once) and deletes all
rows from `holds` and `classes`, so tests do not depend on execution order. The container
is removed when the fixture is disposed.

Because the database is real PostgreSQL, the unique index on the normalized class name is
also exercised — not just the application-level duplicate check.

## Endpoint coverage

| Endpoint | Tests | Result |
|---|---|---|
| `POST /classes` | 14 cases (including theory rows) | Covered |
| `GET /classes` | 1 case | Covered |
| `GET /classes/{classId}` | 3 cases | Covered |
| `GET /` | — | Infrastructure endpoint, no automated test |
| `GET /health` | — | Infrastructure endpoint, no automated test |

Total: **18 test cases**.

## `POST /classes`

Success response is `201 Created` with exactly `id`, `name`, and `totalSeats`, plus a
`Location: /classes/{id}` header.

| Test | Input | Expected |
|---|---|---|
| `CreateClass_returns_201_with_contract_fields` | `{"name":"Class 6 - Morning Shift","totalSeats":120}` | `201`; body has exactly `id`, `name`, `totalSeats`; id starts with `c_`; `Location` matches `/classes/{id}` |
| `CreateClass_duplicate_name_returns_409` | Duplicate of an existing name, written as `class 6 - morning shift`, `Class   6   -   Morning Shift`, and `  CLASS 6 - MORNING SHIFT  ` | `409` with `{"error":"class name already exists, please create class with a different name"}` for each variant |
| `CreateClass_invalid_input_returns_400` | Empty name, whitespace-only name, `totalSeats: 0`, `totalSeats: -1`, missing `name`, missing `totalSeats` | `400` in every case |
| `CreateClass_name_over_200_chars_returns_400` | 201-character name | `400` |
| `CreateClass_malformed_json_returns_400` | Truncated JSON body | `400` |
| `CreateClass_trims_edges_but_preserves_internal_spacing` | `"  Class   8  -  Day  Shift  "` | `201`; saved name is `"Class   8  -  Day  Shift"` |
| `Concurrent_duplicate_creates_create_only_one_class` | 8 parallel requests alternating `Class 10 - Race` / `class   10 - RACE` | Exactly one `201`, seven `409`, and only one class in `GET /classes` |

## `GET /classes`

| Test | Setup | Expected |
|---|---|---|
| `GetClasses_returns_all_classes_with_seat_counts` | Create `Class 6 - Morning Shift` (120) and `Class 6 - Day Shift` (80) | `200` JSON array with both classes; morning has `totalSeats=120`, `heldSeats=0`, `confirmedSeats=0`, `availableSeats=120` |

## `GET /classes/{classId}`

| Test | Setup | Expected |
|---|---|---|
| `GetClassById_returns_the_class` | Create a 60-seat class, request its id | `200` with matching `id`, `name`, `totalSeats=60`, `availableSeats=60` |
| `GetClassById_unknown_returns_404` | Request `/classes/c_missing01` | `404` with `{"error":"Class not found."}` |
| `GetClass_counts_active_holds_and_confirmed_seats_only` | Seed three holds: one active `HELD`, one expired `HELD`, one `CONFIRMED`; class has 30 seats | `heldSeats=1`, `confirmedSeats=1`, `availableSeats=28` (expired hold ignored) |

## Not covered yet

- `GET /` and `GET /health` are infrastructure endpoints outside the assignment API and
  have no automated tests.
- Hold endpoints (`POST /classes/{classId}/holds`, `GET /holds/{holdId}`,
  `POST /holds/{holdId}/confirm`, `DELETE /holds/{holdId}`, `GET /me/holds`) are not
  implemented yet; their tests — including the required seat-concurrency test — will be
  added in the next step.
- No frontend tests exist yet.
