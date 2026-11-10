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
- The lock is held only for the milliseconds of that transaction, never for the hold's
  lifetime. A long `HOLD_DURATION_SECONDS` (up to the 15 minutes we expect) therefore does
  not reduce concurrency.
- Expiry is lazy: a `HELD` row past its `ExpiresAt` is reported as `EXPIRED` and excluded
  from seat and duplicate-application checks without being rewritten in the database. No
  API call or background job is needed to release the seat.
- `HOLD_DURATION_SECONDS` defaults to `600`; values outside `1..86400` fall back to the
  default so a bad value cannot overflow the expiry timestamp.
