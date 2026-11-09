# Assumptions

The assignment brief deliberately leaves some decisions open. This document records
the assumptions made where the specification was unclear, together with the reason for
each one.

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
