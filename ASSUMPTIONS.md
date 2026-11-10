# Assumptions

## 1. Class names are unique

There cannot be duplicate class names in the application. Allowing two classes with the
same name would create confusion among students trying to enroll in a particular class,
since the name is the only thing that distinguishes one class from another in the UI.

## 2. A backend-URL change in the UI applies to that user only

The frontend must allow the backend URL to be changed through an environment variable.
It is assumed that, in addition to that environment-level default, the UI may let a
user change the backend URL for their own session.

- The environment variable supplies the **default** backend URL that every user starts
  from.
- A change made through the **Backend URL** field applies to **that user only**. It is
  kept in the user's browser and takes effect immediately, without a page reload and
  without a container restart.
- No other client is affected — neither a client already using the application nor one
  served afterwards. The environment file is read-only to the application and is never
  rewritten by a UI change.

This keeps the deployment-level configuration authoritative while still allowing an
individual user to point their own browser at a different backend when necessary.

## 3. Student enrollment rules are per class

- A student may have at most one active application (unexpired `HELD`) or confirmed
  admission in the **same class** at the same time, as the brief requires.
- A student may apply to, and confirm admission in, **different classes**. The brief scopes
  the one-application rule to the same class and sets no limit across classes, so no global
  restriction is imposed.

## 4. Seat concurrency and hold duration

- `POST /classes/{classId}/holds` runs a short transaction that locks the class row with
  `SELECT … FOR UPDATE`, counts `CONFIRMED` plus unexpired `HELD` seats, and inserts the
  new hold before committing. PostgreSQL holds the lock, so simultaneous requests — and
  several backend processes sharing one database — are serialized per class and
  `held + confirmed` can never exceed `totalSeats`.

In SQL terms, the hold-creation transaction is:

```sql
BEGIN;
  -- 1. Lock the class row: serializes all hold-creates for THIS class
  SELECT id, total_seats FROM classes WHERE id = @classId FOR UPDATE;
  --    (0 rows → 404)

  -- 2. student already active in this class?
  --    (lazy expiration: expired HELD rows don't count)
  SELECT 1 FROM holds
   WHERE class_id = @classId AND student_id = @studentId
     AND (status = 'CONFIRMED' OR (status = 'HELD' AND expires_at > now()))
   LIMIT 1;
  --    (found → 409 "already applied")

  -- 3. Capacity: occupied seats as of now
  confirmed = COUNT(*) WHERE class_id=@classId AND status='CONFIRMED'
  held      = COUNT(*) WHERE class_id=@classId AND status='HELD' AND expires_at > now()
  --    (confirmed + held >= total_seats → 409 "no seat available")

  -- 4. Reserve
  INSERT INTO holds (id, class_id, student_id, status, created_at, expires_at)
  VALUES (…, 'HELD', now(), now() + @hold_duration_seconds * interval '1 second');
COMMIT;
```

- The lock is held only for the milliseconds of that transaction, never for the hold's
  lifetime. A long `HOLD_DURATION_SECONDS` (up to the 15 minutes we expect) therefore does
  not reduce concurrency.
- Expiry is lazy: a `HELD` row past its `ExpiresAt` is reported as `EXPIRED` and excluded
  from seat and duplicate-application checks without being rewritten in the database. No
  API call or background job is needed to release the seat.
- `HOLD_DURATION_SECONDS` defaults to `600`; values outside `1..86400` fall back to the
  default so a bad value cannot overflow the expiry timestamp.

## 5. Cancelling an application

- `DELETE /holds/{holdId}` cancels only an **unconfirmed** hold: a `CONFIRMED` admission is final and rejected with `409`, and an already expired hold keeps `EXPIRED` (also `409`) so the UI can still show why it ended.
- Cancelling moves the hold to `CANCELLED` (idempotent `204`) instead of deleting the row, so `GET /holds/{holdId}` and `GET /me/holds` keep reporting the application.

## 6. Frontend behaviour

- **Five screens, hash routes.** The app opens on a role chooser (`#/`). Choosing
  **School admin** opens `#/admin`; choosing **Student / guardian** opens `#/student`.
  **My Applications** (`#/student/applications`) lists the student's applications, and
  **Application** (`#/application/:holdId`) is a detail view opened from **Apply** or from
  a My Applications row. Browser Back/Forward and deep links work, and the role screens
  are code-split with `React.lazy` so a student never downloads the admin form.
- **Live counts.** The class list and My Applications poll every 5 seconds. A failed poll
  keeps the last good data on screen and shows a banner; the next successful poll clears
  it. The hold countdown ticks every second, so an expiring hold flips to **EXPIRED** and
  disables **Pay** without a page reload.
- **Identity.** The 17-digit birth-registration number is stored in
  `localStorage['studentId']`, so a refresh or a reopened tab still shows the student's
  applications. It is sent as `X-Student-Id` only on the endpoints that require it.
- **Backend URL.** The field in the header overrides the environment default for the
  current browser only (also in `localStorage`); the environment file is never rewritten.
- **Errors are always visible.** Network failures, backend `4xx` messages, and `5xx`
  failures render as plain-language text in the active view. A render error shows a
  fallback with **Try again** rather than a blank page.
- **TypeScript everywhere.** The React app, the Vite config, and the Node server are
  TypeScript; `tsc -b` runs as part of `npm run build`, and the server is bundled with
  esbuild for the runtime image.
