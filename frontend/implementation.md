# Frontend Implementation Plan — School Admission System

> **Ground rule for every step:** strictly adhere to this implementation plan —
> nothing fancy is needed, and only write the absolutely necessary tests. Do not
> add features, dependencies, abstractions, or tests beyond what the plan (and the
> assignment's required UI rules) call for. Prefer the simplest solution that makes
> the required behaviour work and keeps the build green.

Step-by-step plan for the React UI. Work **top to bottom**; tick each box as it is
done. One Git commit per phase keeps the history readable (the assignment asks for
incremental commits, not one big final commit).

**Scope:** the frontend only. The backend, its endpoints, migrations, and
`docker-compose.yml` service wiring are **not** touched.

**Locked decisions (agreed with the requester):**

| Decision | Choice |
|---|---|
| Styling | Plain CSS (no UI/component library) |
| Language | TypeScript, full migration |
| Navigation | Single-page tabbed layout (no router) |
| Frontend tests | Yes — Vitest + React Testing Library |
| Backend URL field | Kept (existing per-user override) |
| Seat polling | Every 5 s |
| Hold countdown | Tick every 1 s |
| Server build | esbuild-bundle `server.ts` → `server.cjs` for a lean runtime image |

> **Why these choices:** the brief says the UI "does not need to be visually
> elaborate"; plain CSS avoids new runtime deps. Full TS is the requested language.
> A single-page tab layout matches the no-login, four-screen flow without adding a
> router. Frontend tests are the optional bonus in §1.6. Seat counts must "refresh
> every few seconds" (§1.5 UI rule 3) — 5 s is the chosen cadence and is documented
> in `ASSUMPTIONS.md`.

---

## Phase 0 — Baseline check (5 min)

- [x] **0.1** Confirm the app still builds and serves before touching anything.

  ```bash
  cd frontend && npm install && npm run build && (npm run dev &) && sleep 3
  curl -s http://localhost:5173/config.js
  ```

  Expected: `/config.js` returns `window.__APP_CONFIG__ = {"apiUrl":"http://localhost:8080"}`.

- [x] **0.2** Confirm the backend contract by hand (Docker stack running):

  ```bash
  curl -s http://localhost:8080/classes
  curl -s -X POST http://localhost:8080/classes \
       -H 'Content-Type: application/json' \
       -d '{"name":"Plan Smoke Class","totalSeats":5}'
  ```

  Note the shape: `id`, `name`, `totalSeats`, `heldSeats`, `confirmedSeats`,
  `availableSeats`; holds use `holdId`, `classId`, `status`, `expiresAt`.

- [x] **0.3** Record the exact status words the backend emits: `HELD`,
  `CONFIRMED`, `EXPIRED`, `CANCELLED` (upper-case; see `Program.cs` enum converter).
  The UI must never lowercase or re-case these for display logic.

---

## Phase 1 — TypeScript tooling & migration

- [x] **1.1** Add dev dependencies to `package.json`:

  ```bash
  npm install -D typescript @types/react @types/react-dom @types/node \
    vitest @testing-library/react @testing-library/jest-dom \
    @testing-library/user-event jsdom tsx esbuild
  ```

  (`esbuild` is already a Vite transitive dep, but pin it explicitly for the server
  bundle in Phase 9.)

- [x] **1.2** Add `tsconfig.json` (solution file) referencing two project configs:

  ```jsonc
  {
    "files": [],
    "references": [
      { "path": "./tsconfig.app.json" },
      { "path": "./tsconfig.node.json" }
    ]
  }
  ```

- [x] **1.3** Add `tsconfig.app.json` (browser app):

  ```jsonc
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022", "DOM", "DOM.Iterable"],
      "module": "ESNext",
      "moduleResolution": "bundler",
      "jsx": "react-jsx",
      "strict": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noFallthroughCasesInSwitch": true,
      "noEmit": true,
      "skipLibCheck": true
    },
    "include": ["src"]
  }
  ```

- [x] **1.4** Add `tsconfig.node.json` (config files, server, shared lib):

  ```jsonc
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "bundler",
      "strict": true,
      "types": ["node"],
      "noEmit": true,
      "skipLibCheck": true
    },
    "include": ["vite.config.ts", "server.ts", "lib"]
  }
  ```

- [x] **1.5** Rename/convert the source files to TypeScript (do them in this order so
  imports resolve):

  1. `lib/apiUrl.js` → `lib/apiUrl.ts` — add parameter/return types; keep the exact
     runtime behaviour and the exported names (`FALLBACK_API_URL`, `normalizeApiUrl`,
     `isValidApiUrl`, `apiUrlFromEnvFile`).
  2. `vite.config.js` → `vite.config.ts` — `import type { Plugin, ViteDevServer }`;
     keep the runtime-config middleware unchanged.
  3. `src/api/config.js` → `src/api/config.ts` — type the `window.__APP_CONFIG__`
     access (declare it in `src/vite-env.d.ts` or a `declare global` in `config.ts`).
  4. `src/hooks/useBackendUrl.js` → `.ts`.
  5. `src/main.jsx` → `src/main.tsx`; `src/App.jsx` → `src/App.tsx`.
  6. `server.mjs` → `server.ts` — type `req`/`res` with `node:http` (`IncomingMessage`,
     `ServerResponse`); keep `/healthz`, `/config.js`, and static serving logic.

- [x] **1.6** Add `src/vite-env.d.ts`:

  ```ts
  /// <reference types="vite/client" />

  interface Window {
    __APP_CONFIG__?: { apiUrl?: string }
  }
  ```

- [x] **1.7** Update `package.json` scripts:

  ```jsonc
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
  ```

  If `tsc -b` is noisy against the existing files, keep `build: "vite build"` and run
  `npx tsc -b` separately in CI; the app still compiles through Vite's esbuild.

- [x] **1.8** Update `.oxlintrc.json` if it excludes JS only; ensure `.tsx`/`.ts` are
  linted. Run `npm run lint` and fix real findings (do not silence rules blindly).

- [x] **1.9** Gate: `npm run build` and `npm run lint` both pass; the built page still
  shows the current scaffold and `/config.js` still returns the default URL.

---

## Phase 2 — API client & contract types

- [x] **2.1** Create `src/api/types.ts` mirroring the contract **field names exactly**
  (the automated API tests depend on the contract; the UI must not depend on extra
  fields):

  ```ts
  export type HoldStatus = 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED'

  export interface ClassSummary {
    id: string
    name: string
    totalSeats: number
    heldSeats: number
    confirmedSeats: number
    availableSeats: number
  }

  export interface ClassCreated {
    id: string
    name: string
    totalSeats: number
  }

  export interface HoldCreated {
    holdId: string
    classId: string
    studentId: string
    status: HoldStatus
    expiresAt: string // ISO-8601 UTC
  }

  export interface HoldStatusResponse {
    holdId: string
    classId: string
    status: HoldStatus
    expiresAt: string
  }

  export interface HoldConfirmedResponse {
    holdId: string
    status: HoldStatus
  }

  export interface MyHold {
    holdId: string
    classId: string
    className: string
    status: HoldStatus
    expiresAt: string
  }
  ```

- [x] **2.2** Create `src/api/client.ts`. One `request` function plus typed wrappers:

  ```ts
  export class ApiError extends Error {
    readonly status: number | null // null = network/transport failure
    constructor(message: string, status: number | null) { ... }
  }
  ```

  Behaviour:
  - URL = `getApiUrl() + path` (use the existing config module).
  - Always send `Content-Type: application/json` for bodies; parse JSON responses.
  - Attach `X-Student-Id` only when a student id is supplied.
  - On non-2xx: read `{ error }` from the body when available and throw
    `new ApiError(body.error ?? fallback, res.status)`.
  - On `TypeError`/network failure or unparseable JSON: throw
    `new ApiError('The server is not reachable…', null)`.
  - Map status → fallback message when the backend gave none:
    `400` bad input, `403` not yours, `404` not found, `409` conflict, `500` server
    error — all plain language.

  Wrappers (one per endpoint the UI uses):

  ```ts
  export function createClass(input: { name: string; totalSeats: number }): Promise<ClassCreated>
  export function listClasses(): Promise<ClassSummary[]>
  export function getClass(classId: string): Promise<ClassSummary>
  export function createHold(classId: string, studentId: string): Promise<HoldCreated>
  export function getHold(holdId: string): Promise<HoldStatusResponse>
  export function confirmHold(holdId: string, studentId: string): Promise<HoldConfirmedResponse>
  export function cancelHold(holdId: string, studentId: string): Promise<void>
  export function listMyHolds(studentId: string): Promise<MyHold[]>
  ```

  `cancelHold` treats `204` as success (no body to parse).

- [x] **2.3** Unit-test the client's error mapping (see Phase 8) — at minimum:
  `409` surfaces the backend `error`; a network failure yields the unreachable
  message; `204` from cancel does not throw.

- [x] **2.4** Gate: `npx tsc -b` passes; no screen code yet.

---

## Phase 3 — Student identity & persistence

- [ ] **3.1** Create `src/hooks/useStudentId.ts`:

  - `const KEY = 'studentId'` (document in `ASSUMPTIONS.md`).
  - Initial state = `localStorage.getItem(KEY) ?? ''` (guard the access: private mode
    can throw).
  - `setStudentId(value)` trims, stores when valid, removes the key when empty.
  - `isValidStudentId = /^\d{17}$/.test(value)` (ASCII digits only — matches the
    backend guard `char.IsAsciiDigit`, length 17).
  - Expose `{ studentId, setStudentId, isValid, error }`; `error` is a human sentence
    when a non-empty value is not 17 digits.

- [ ] **3.2** Create `src/components/StudentIdBar.tsx`:

  - Label "Student birth-registration number (17 digits)".
  - Controlled input, `inputMode="numeric"`, `maxLength={17}`, `autoComplete="off"`,
    `spellCheck={false}`.
  - Inline validation message; disable/annotate actions that need an id.
  - On change, persist through `setStudentId` (so refresh keeps identity —
    UI rule 4).

- [ ] **3.3** Create `src/components/BackendUrlField.tsx`: extract the existing
  form from `App.tsx` unchanged (Apply / Reset default / in-use display / stored
  override note). No behaviour change.

- [ ] **3.4** Gate: typing 17 digits survives a refresh; a 16- or 18-digit value
  shows a readable error and cannot be used to apply.

---

## Phase 4 — App shell & tab navigation

- [ ] **4.1** Rewrite `src/App.tsx` into a shell:

  ```
  <main className="app">
    <header>
      <h1>School Admission System</h1>
      <StudentIdBar />
      <BackendUrlField />
    </header>
    <nav role="tablist">
      Classes | Create Class | My Applications
    </nav>
    <section> …active view… </section>
  </main>
  ```

  - `useState<'classes' | 'create-class' | 'my-applications'>` for the tab.
  - `useState<string | null>` for `activeHoldId`; when set, the **Application** view
    is shown instead of the tab body (with a "Back" link that clears it).
  - Default tab: **Classes**.
  - Empty state copy: e.g. "Enter your 17-digit birth-registration number to
    apply and to see your applications." — never a blank page.

- [ ] **4.2** Accessibility: tabs are buttons with `aria-selected`, the active panel
  has `role="tabpanel"`; error banners use `role="alert"`.

- [ ] **4.3** Gate: keyboard-tab through the header/tabs works; refresh keeps the
  current student id (tabs themselves do not need to persist).

---

## Phase 5 — Screens

### 5.1 Class List (`src/components/ClassListView.tsx`)

- [ ] **5.1.1** Poll `GET /classes` with `useClasses` (Phase 6) — render a table or
  card list with **Name · Total · Held · Confirmed · Available** and an **Apply**
  button per row.
- [ ] **5.1.2** Apply flow:
  - Requires a valid student id; otherwise the button is disabled and a hint points at
    the top field.
  - Disabled when `availableSeats === 0` (label or tooltip "No seats available").
  - On click: `createHold(classId, studentId)`; on success call
    `onHoldCreated(holdCreated.holdId)` → shell opens **Application**; on
    `ApiError` show the message inline on that row (keep the list interactive).
  - Guard against double-clicks while the request is in flight (`pendingClassId`).
- [ ] **5.1.3** Empty list: "No classes have been created yet." + a link/button to the
  Create Class tab.
- [ ] **5.1.4** Seat-number sanity check: if `held + confirmed > totalSeats` ever
  renders (it shouldn't), show it rather than hiding it — never crash.

### 5.2 Create Class (`src/components/CreateClassView.tsx`)

- [ ] **5.2.1** Form: **Class name** (text, required, max 200) and **Total seats**
  (number, min 1, integer). Both required; block submit with inline messages for
  empty/`0`/`-1`/non-integer.
- [ ] **5.2.2** Submit → `createClass`. On `201`: clear the form, show a success
  notice ("Class created: <name>"), and notify the shell to refresh the class list
  immediately (not waiting for the 5 s poll).
- [ ] **5.2.3** On `409`: show the backend's duplicate message verbatim
  ("class name already exists, please create class with a different name") next to
  the name field. On any other `ApiError`: show the friendly message.
- [ ] **5.2.4** Prevent double submit while pending.

### 5.3 Application (`src/components/ApplicationView.tsx`)

Input: `holdId` (from Apply or a My Applications row), `studentId`.

- [ ] **5.3.1** Load `getHold(holdId)`; show class name if available (from the row
  that opened it — pass it as a prop to avoid an extra call), the **status badge**,
  and the **time remaining**.
- [ ] **5.3.2** Countdown: `useCountdown(expiresAt)` ticking every 1 s, formatted
  `mm:ss` (and `hh:mm:ss` if ≥ 1 h). When the clock passes `expiresAt` and the last
  known status was `HELD`, render the badge as **EXPIRED** immediately — no reload
  (UI rule 2).
- [ ] **5.3.3** Buttons:
  - **Pay Admission Fee** — enabled only when `status === 'HELD'` **and** not expired.
    Calls `confirmHold(holdId, studentId)`; on success set status `CONFIRMED`, show
    "Admission confirmed." and stop the countdown.
  - **Cancel** — enabled only when `status === 'HELD'` **and** not expired. Calls
    `cancelHold`; on success set status `CANCELLED` and show "Application cancelled."
    Only one of the two buttons can be clicked at a time (`pending`).
  - `CONFIRMED` / `CANCELLED` / `EXPIRED`: both buttons disabled, with a short
    explanation ("This application has expired and the seat has been released." /
    "Admission confirmed." / "Application cancelled.").
- [ ] **5.3.4** While polling/refreshing, never flash the old status back to `HELD`
  after a confirm — the local state wins for terminal states within the view.
- [ ] **5.3.5** `403`/`404`/`409` from confirm/cancel show the backend's message
  inline and re-fetch the hold once to resync.

### 5.4 My Applications (`src/components/MyApplicationsView.tsx`)

- [ ] **5.4.1** Poll `GET /me/holds` via `useMyHolds(studentId)` when the id is
  valid; otherwise show the "enter your number" empty state (UI rule 4 — after
  refresh the list repopulates from the stored id).
- [ ] **5.4.2** Rows: **Class name · status badge · countdown (only when `HELD`)**;
  clicking a row calls `onOpenHold(holdId, className)` → opens **Application**.
- [ ] **5.4.3** Sort as returned by the API (already newest-first); do not re-sort.
- [ ] **5.4.4** Empty state: "You have no applications yet." + button to the Classes
  tab.

---

## Phase 6 — Polling & live updates

- [ ] **6.1** `src/hooks/useClasses.ts`:

  - `listClasses()` on mount, then `setInterval(…, 5000)`.
  - Keep the previous data while a refresh is in flight (no flicker); track
    `{ classes, loading, error, refresh }`.
  - On error during a poll: keep the last good data and surface a non-blocking banner
    ("Couldn't refresh seat counts — retrying…").
  - Clear the interval on unmount.

- [ ] **6.2** `src/hooks/useMyHolds.ts`: same shape, keyed on `studentId`; re-fetch
  when the id changes; no interval when the id is invalid.

- [ ] **6.3** `src/hooks/useCountdown.ts`: given an ISO `expiresAt`, return
  `{ remainingMs, expired, label }`, ticking every 1 s; recompute immediately on
  mount and on argument change; clean up on unmount.

- [ ] **6.4** After Confirm/Cancel/Create, call the relevant `refresh()` so the list
  and seat counts update before the next poll.

- [ ] **6.5** Gate: with the Docker stack up, hold a seat in one tab and confirm it in
  another; the Class List's **Held/Confirmed/Available** numbers change within ~5 s
  **without a page reload**.

---

## Phase 7 — Error handling polish (UI rule 5)

- [ ] **7.1** `src/components/ErrorBanner.tsx`: `role="alert"`, message + optional
  dismiss. Used by every view.
- [ ] **7.2** Audit every fetch path — create class, list classes, apply, hold status,
  confirm, cancel, my holds — for:
  - network/server down → "The server is not reachable. Check the backend URL and try
    again." (never console-only);
  - `4xx` → backend `error` text when present, else the status fallback;
  - unexpected `5xx` → "Something went wrong on the server. Please try again."
- [ ] **7.3** Never render an unhandled exception into a blank page: wrap the active
  view in a minimal error boundary (`src/components/ErrorBoundary.tsx`) that shows a
  readable fallback with a "Try again" that resets state.
- [ ] **7.4** Gate: stop the backend container; each screen shows the unreachable
  banner and recovers when the backend returns.

---

## Phase 8 — Frontend tests (bonus, §1.6)

- [ ] **8.1** Add `vitest.config.ts` (or a `test` block in `vite.config.ts`):
  `environment: 'jsdom'`, `globals: true`, setup file `src/test/setup.ts` importing
  `@testing-library/jest-dom`.
- [ ] **8.2** Add `src/test/setup.ts` (jest-dom matchers) and a `renderApp` helper
  that stubs `window.__APP_CONFIG__` and clears `localStorage` between tests.
- [ ] **8.3** Mock the network with `vi.stubGlobal('fetch', vi.fn())` returning the
  contract shapes (no live backend in unit tests).

  Minimum tests:

  - [ ] **CreateClass**: valid submit calls `POST /classes` with the right body and
    shows the success notice; duplicate `409` shows the backend message.
  - [ ] **ClassList**: renders total/held/confirmed/available; Apply disabled at
    `availableSeats === 0`; Apply disabled without a valid student id.
  - [ ] **Apply**: click Apply → `POST /classes/{id}/holds` with `X-Student-Id` →
    Application view opens with the new `holdId`.
  - [ ] **Application expiry**: with a `HELD` hold whose `expiresAt` is already past,
    the badge shows **EXPIRED** and **Pay** is disabled without reload.
  - [ ] **Confirm/Cancel**: click confirm → `POST …/confirm` and status becomes
    `CONFIRMED`; cancel → `DELETE` and status becomes `CANCELLED`.
  - [ ] **Persistence**: with `localStorage.studentId` preset, mount → `GET /me/holds`
    is called with the `X-Student-Id` header and rows render.
  - [ ] **Network error**: fetch rejects → a readable banner appears (no crash, no
    console-only error).

- [ ] **8.4** `npm test` green; document the command in `README.md`.

---

## Phase 9 — Build, server, and Docker

- [ ] **9.1** `vite.config.ts`: unchanged behaviour — `/config.js` still serves
  `window.__APP_CONFIG__ = { apiUrl: <default> }` read once at startup from
  `config/api-url.env` (fallback `API_URL`, then `http://localhost:8080`).

- [ ] **9.2** `server.ts`: port `PORT ?? 80`, static root `STATIC_ROOT ?? /app/dist`,
  config file `CONFIG_FILE ?? /config/api-url.env`. Keep `/healthz`, `/config.js`,
  SPA fallback to `index.html` for HTML GETs.

- [ ] **9.3** Compile the server for the runtime image with esbuild:

  ```bash
  npx esbuild server.ts --bundle --platform=node --target=node20 \
    --outfile=dist-server/server.cjs --format=cjs
  ```

  (Bundles `lib/apiUrl.ts` in; no TypeScript at runtime.) Add
  `"build:server": "esbuild server.ts --bundle --platform=node --target=node20 --outfile=dist-server/server.cjs --format=cjs"`
  to `package.json`.

- [ ] **9.4** Update `frontend/Dockerfile`:

  - Build stage: `npm ci` → `npm run build` → `npm run build:server`.
  - Runtime stage: copy `dist/` and `dist-server/server.cjs`; **do not** copy
    `lib/` or `server.ts`; `CMD ["node", "dist-server/server.cjs"]`.
  - Keep `EXPOSE 80`, `PORT=80`, `STATIC_ROOT=/app/dist`, `CONFIG_FILE=/config/api-url.env`.

- [ ] **9.5** Keep `docker-compose.yml` untouched (frontend still `3000:80`, backend
  `8080:8080`). Verify `docker compose up --build` serves the UI at
  `http://localhost:3000` and `/config.js` carries the default backend URL.

- [ ] **9.6** Gate: `docker compose down && docker compose up -d --build`; open
  `http://localhost:3000`; create a class, apply, pay — end to end with no console
  errors.

---

## Phase 10 — Documentation (short, required by §1.7)

- [ ] **10.1** `README.md`: update the frontend run/test notes (`npm test`), confirm
  the URLs (`frontend :3000`, `backend :8080`), and mention the TypeScript build.

- [ ] **10.2** `ASSUMPTIONS.md` — add frontend assumptions:

  - seat counts poll every 5 s; hold countdown ticks every 1 s;
  - the student id is persisted in `localStorage` under `studentId` so applications
    survive refresh/reopen;
  - the four screens are tabs in one page; **Application** is a detail view reached
    from Apply / a My Applications row;
  - the per-user Backend URL field remains an override of the environment default;
  - TypeScript is used across the app and the Node build/serve files.

- [ ] **10.3** `AI_USAGE.md`: add this step (full-TS migration + UI build) and any
  corrections the AI made.

---

## Definition of done (mirrors §1.5 UI rules)

- [ ] **D1** Every operation — create class, apply, confirm, cancel, view applications
  — is possible through the UI; no Postman / DB access required.
- [ ] **D2** An expiring hold flips to **EXPIRED** and disables **Pay** with no page
  reload.
- [ ] **D3** Class seat counts refresh every ~5 s with no reload.
- [ ] **D4** After a refresh or a browser reopen, the student still sees their ongoing
  applications (student id persisted; `/me/holds` re-fetched).
- [ ] **D5** Every error (no seats, expired hold, invalid input, server down) shows
  plain-language text on screen; no blank page, no console-only errors.
- [ ] **D6** `npm run build`, `npm run lint`, and `npm test` all pass.
- [ ] **D7** `docker compose up` serves PostgreSQL + backend (`:8080`) + frontend
  (`:3000`) together from a clean checkout.
- [ ] **D8** The API contract is followed exactly; no specified field is removed or
  renamed.

---

## Out of scope (do not touch)

- Backend endpoints, models, migrations, and backend tests.
- `docker-compose.yml` service wiring; PostgreSQL persistence.
- `POST /classes/{id}/holds` concurrency logic.
- The future bonus "two backend processes" scenario — already backend-side and out of
  this plan.
