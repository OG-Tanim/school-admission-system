# AI Usage

- Using DeepSeek Harness for implementing the project step by step.

## Step - 1

- Scaffolding done and the configuration reviewed before moving on to the next step.

## Step - 2

- implementation of the endpoints and their automated tests.

### AI mistake

- AI allowed duplicate class names, and only handled them with a user readable error response.

### Solution

- Duplicate class names are now rejected instead of stored: names are compared ignoring case and extra internal spaces, a unique index on the normalized name guards against races, and the request fails with the user readable `409` message "class name already exists, please create class with a different name".

## Step - 3

- Issue solved: duplicate and dead frontend code removed — shared URL helpers extracted to `frontend/lib/apiUrl.js`, unused `src/api/client.js` and `normalizeApiUrl` export deleted.
- Issue solved: a generated-ID collision on class creation now retries with a new ID instead of being misreported as a duplicate class name.

## Step - 4

- IDs switched from custom `c_`/`h_` short identifiers to GUIDs. A GUID's collision probability is negligible, so the custom `ShortId` generator and the collision-retry loops for both class and hold creation were removed as dead code. The duplicate-class-name `409` handling stayed, since it is still needed.
