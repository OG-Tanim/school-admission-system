# Backend Tests

Automated tests live in [`tests/`](tests/) and cover the class, seat-hold, confirm, and
cancel endpoints implemented so far.

- Framework: xUnit 2.9.3
- API host: `WebApplicationFactory<Program>` (in-memory TestServer, no fixed port)
- Database: real PostgreSQL 16 container via Testcontainers
- Test classes: [`tests/ClassEndpointsTests.cs`](tests/ClassEndpointsTests.cs),
  [`tests/HoldEndpointsTests.cs`](tests/HoldEndpointsTests.cs)
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
| `POST /classes/{classId}/holds` | 11 cases (including the required concurrency test) | Covered |
| `POST /holds/{holdId}/confirm` | 13 cases (including a concurrent-confirm test) | Covered |
| `DELETE /holds/{holdId}` | 11 cases (including a concurrent-delete test) | Covered |
| `GET /holds/{holdId}` | — | Implemented, no automated test |
| `GET /me/holds` | — | Implemented, no automated test |
| `GET /` | — | Infrastructure endpoint, no automated test |
| `GET /health` | — | Infrastructure endpoint, no automated test |

Total: **53 test cases**.

## `POST /classes`

Success response is `201 Created` with exactly `id`, `name`, and `totalSeats`, plus a
`Location: /classes/{id}` header.

| Test | Input | Expected |
|---|---|---|
| `CreateClass_returns_201_with_contract_fields` | `{"name":"Class 6 - Morning Shift","totalSeats":120}` | `201`; body has exactly `id`, `name`, `totalSeats`; `id` is a GUID; `Location` matches `/classes/{id}` |
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

## `POST /classes/{classId}/holds`

The `X-Student-Id` header must be a 17-digit birth-registration number. The handler locks
the class row inside a short transaction, rejects a second active application from the
same student in the same class, and rejects the request with `409` when
`held + confirmed` already equals `totalSeats`. Expiry is lazy, so an expired hold neither
occupies a seat nor blocks a re-application.

| Test | Setup | Expected |
|---|---|---|
| `CreateHold_returns_201_with_contract_fields` | 120-seat class, valid header | `201`; `holdId` is a GUID; body echoes `classId`/`studentId`; `status="HELD"`; `expiresAt` in the future; `Location: /holds/{id}` |
| `CreateHold_invalid_header_returns_400` | Missing, 16-digit, 18-digit, non-digit header | `400` in every case |
| `CreateHold_unknown_class_returns_404` | Request `/classes/{random-guid}/holds` | `404` with `{"error":"Class not found."}` |
| `CreateHold_when_no_seats_returns_409` | 1-seat class already held by another student | `409` "No seats available in this class."; class shows `heldSeats=1`, `availableSeats=0` |
| `CreateHold_same_student_same_class_twice_returns_409` | Same student applies twice | `409`; exactly one `HELD` row for that student and class |
| `CreateHold_same_student_different_classes_succeeds` | Same student applies to two classes | `201` for each |
| `CreateHold_after_expiry_releases_seat_and_ignores_r3` | Expired `HELD` seeded for the same student | Expired hold frees the seat and does not block re-application |
| `Concurrent_holds_never_exceed_total_seats` | 5-seat class, 30 simultaneous distinct students | Exactly 5 × `201`, 25 × `409`; `held + confirmed <= 5` |

## `POST /holds/{holdId}/confirm`

The `X-Student-Id` header must be a 17-digit birth-registration number and must match the
hold's student. Only an own, unexpired `HELD` hold can be confirmed; confirming is
idempotent (rule 5), so `confirmedSeats` never increases twice. The transition is a single
conditional `UPDATE`, so simultaneous confirms of the same hold have one winner.

| Test | Setup | Expected |
|---|---|---|
| `ConfirmHold_returns_200_with_contract_fields` | 120-seat class, own active hold | `200`; body has exactly `holdId` and `status="CONFIRMED"`; `heldSeats=0`, `confirmedSeats=1`, `availableSeats=119` |
| `ConfirmHold_twice_is_idempotent` | Confirm the same hold twice | Both `200` `CONFIRMED`; `confirmedSeats` stays 1 |
| `Concurrent_confirms_of_same_hold_confirm_only_once` | 10 parallel confirms of one hold | All `200`; exactly one confirmed seat |
| `ConfirmHold_other_students_hold_returns_403` | Another student's hold | `403` with readable error; hold still `HELD` |
| `ConfirmHold_invalid_header_returns_400` | Missing, 16-digit, 18-digit, non-digit header | `400` in every case; nothing confirmed |
| `ConfirmHold_unknown_id_returns_404` | Random GUID | `404` |
| `ConfirmHold_malformed_id_returns_404` | `/holds/h_missing01/confirm` | `404` |
| `ConfirmHold_expired_returns_409` | Seeded `HELD` hold past `ExpiresAt` | `409` with readable error; `confirmedSeats=0` |
| `ConfirmHold_cancelled_returns_409` | Seeded `CANCELLED` hold | `409` with readable error |
| `ConfirmHold_second_hold_in_same_class_returns_409` | Two `HELD` rows seeded for one student and class; confirm the first, then the second | `200` then `409` "You already have a confirmed admission in this class."; `confirmedSeats=1` |

## `DELETE /holds/{holdId}`

The `X-Student-Id` header must be a 17-digit birth-registration number and must match the
hold's student. Cancelling is a status transition to `CANCELLED` (not a row delete), so the
application stays visible in `GET /holds/{holdId}` and `GET /me/holds`. Only unconfirmed
holds can be cancelled: `CONFIRMED` is final, and an expired hold keeps `EXPIRED`. The
conditional `UPDATE` makes repeated deletes idempotent and serializes them against confirm.

| Test | Setup | Expected |
|---|---|---|
| `DeleteHold_returns_204_and_frees_the_seat` | Own active hold in a 10-seat class | `204` with empty body; `GET` → `CANCELLED`; `heldSeats=0`, `availableSeats=10`; the same student can apply again (`201`) |
| `DeleteHold_twice_is_idempotent` | Delete the same hold twice | `204` both times; status stays `CANCELLED` |
| `DeleteHold_other_students_hold_returns_403` | Another student's hold | `403` with readable error; hold still `HELD` |
| `DeleteHold_expired_returns_409_and_keeps_expired` | Seeded `HELD` hold past `ExpiresAt` | `409` with readable error; `GET` still reports `EXPIRED` |
| `DeleteHold_confirmed_returns_409_and_keeps_confirmed` | Confirm the hold, then delete it | `409` with readable error; still `CONFIRMED`; `confirmedSeats=1` |
| `DeleteHold_invalid_header_returns_400` | Missing, 16-digit, 18-digit, non-digit header | `400` in every case; hold still `HELD` |
| `DeleteHold_unknown_or_malformed_id_returns_404` | Random GUID and `/holds/h_missing01` | `404` for both |
| `Concurrent_deletes_cancel_once` | 5 parallel deletes of one hold | All `204`; `heldSeats=0`, `availableSeats=5` |

## Not covered yet

- `GET /holds/{holdId}` and `GET /me/holds` are implemented and were verified manually
  against a live PostgreSQL instance, but have no automated tests yet.
- `GET /` and `GET /health` are infrastructure endpoints outside the assignment API and
  have no automated tests.
- No frontend tests exist yet.
