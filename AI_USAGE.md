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

## Step - 5

- The complete React UI was implemented phase by phase against the API contract: tabbed Classes / Create Class / My Applications screens, an Application detail view, 5-second polling for seat counts and applications, a 1-second hold countdown, persisted student identity, and a per-user Backend URL override. The app, its Vite config, and the production Node server were migrated fully to TypeScript, with Vitest coverage of the main flows.

### AI mistake

- The plan called for a CommonJS server bundle (`server.cjs`), but `server.ts` uses top-level `await`, which CommonJS cannot execute.
- The API client mapped a bare `500` to the friendly server message, while other `5xx` responses (for example a proxy's `502`) fell through to the generic "request failed" text.
- A `2xx` response whose body could not be parsed was reported as "the server is not reachable", which blamed the network for a server problem.

### Solution

- The server is bundled as ESM (`dist-server/server.mjs`) with esbuild, and the Dockerfile and `package.json` script were updated to match.
- Any `5xx` now shows "Something went wrong on the server. Please try again.", and an unparseable success body shows the same server message.
## Step - 6

- The single-page tabbed UI was restructured into five role-based hash routes: `#/` (choose admin or student, with the Backend URL field), `#/admin` (create a class plus a read-only list of created classes), `#/student` (seat counts and Apply), `#/application/:holdId` (one application), and `#/student/applications` (all of a student's applications). A tiny dependency-free hash router keeps Back/Forward and deep links working, and the four role screens are code-split with `React.lazy` and `Suspense`. The shared seat table was extracted so the admin (read-only) and student (Apply) views cannot drift apart.

### AI mistake

- The first plan proposed `React.memo` on the shared class table, but its `classes` prop is a fresh array on every 5-second poll, so memoisation would never hit and would only add a shallow-comparison cost.

### Solution

- Memoisation was skipped for the table (it re-renders with fresh polled data anyway); the re-render wins instead come from code-splitting, deriving status during render, and keeping per-row timers inside their own row components. The class-detail `GET /classes/{id}` call is made only on a deep link, because internal navigation carries the class name in the hash query.
