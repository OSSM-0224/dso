# DSO Navi Mumbai Multi-Sport Fixture Platform (Kho-Kho Module)

A production-grade tournament fixture and bracket management platform built for District Sports Offices (DSOs) in Navi Mumbai. This platform replaces traditional notebook fixture-drawing with an automated, constraint-satisfying play-in single elimination bracket engine.

---

## Architecture & Tech Stack

- **Framework**: Next.js 16 (App Router) — a single full-stack application. React 19 + TypeScript + Tailwind CSS v4 (mobile-first responsive bracket tree, zero-pill typography, clean tabular statistics).
- **Server**: Route Handlers in `src/app/api/**/route.ts` layered over `src/server/{controllers -> services -> repositories}` with in-memory persistence and Mongoose schemas ready for MongoDB (`MONGODB_URI`). "Dedicated `middleware.ts` for lightweight cookie checks (`/school/*`, `/api/my/*`), React 'use client' boundaries only where needed, `next/headers` for cookie sessions, Bearer tokens removed, all client data via `fetch` to its own `/api` boundaries and reads from the state store. Finally run a production build."
- **Fixture Engine**: Pure, framework-free TypeScript engine located in `src/shared/engine/`. Zero database or UI dependencies, organized via the **Strategy Pattern** (`FixtureStrategy` -> `SingleEliminationStrategy`). New formats (round-robin, groups + knockout) can be plugged in by adding a strategy file and registering with `FixtureEngineRegistry`.
- **Auth & RBAC (JWT, httpOnly cookies)**: JWT tokens are signed with `jsonwebtoken` and wrapped in **HttpOnly cookies**; role enforcement (`admin`, `organizer`, `viewer`) happens in Route Handlers through `src/server/auth/guards.ts`, which mirrors the old Bearer-token middleware including the default-organizer dev fallback and the exact legacy error messages. Only `admin` and `organizer` have write privileges.
- **Validation**: Strict input validation with `Zod` schemas and centralized error handling.
- **Sessions**: staff cookie `dso_staff_session`, participant cookie `dso_school_session` (7 days, `sameSite: lax`, secure in production). Client is cookie-based (`src/lib/api.ts`, `src/context/AuthContext.tsx`).

### Project Structure

```
src/
  app/
    (admin)/           DSO admin organized as a route group: /, /tournaments/[id], /teams, /school-accounts, /past-champions, /engine-tests
    school/            Participant portal: /school/login, /school/dashboard, /school/matches/[id], /school/notifications (no DSO menu)
    public/tournaments/[id]  Fully server-rendered public bracket page (via generateMetadata, `revalidate = 30`)
    api/               All REST endpoints as Route Handlers (same paths as the old Express API)
  server/              Controllers, services, repositories, validations (Zod), serializers, tests + business logic (dbStore, auth session, guards)
  shared/              Common types + the byte-identical pure fixture engine (src/shared/engine)
  features/, components/, dev/  Pure React UI (identical, ported)
  context/             AuthContext (cookie sessions)
scripts/seed-temp-logins.ts  CLI wrapper for seeding temporary logins (TEMP-LOGIN scaffolding)
middleware.ts          Lightweight cookie checks (/school/*, /api/my/*
```

---

## Commands

```bash
npm run dev        # Dev server on port 3000 (auto loads .env)
npm run build      # Production build
npm start          # Run the production build
npm test           # 70 automated tests (engine + API suite + strict secrecy + LIVE SCORER access control)
npm run lint       # TypeScript check (tsc --noEmit)
npm run seed:temp-logins        # TEMP-LOGIN: create temporary logins for existing schools (TEMP-LOGIN: remove later)
npm run seed:temp-logins:remove # TEMP-LOGIN: remove temporary logins
```

### Environment Variables (see .env.example)

- `MONGODB_URI` — optional; when absent everything runs on the in-memory store (same as before).
- `JWT_SECRET` — signing key for the session cookies.
- `TEMP_LOGIN_PASSWORD` — TEMP-LOGIN: password used for temporary logins (default `DSO@2026`).
- `NEXT_PUBLIC_ENABLE_TEMP_LOGINS` — TEMP-LOGIN: shows the quick-login dropdown in dev only.

---

## Icons (Font Awesome Free kit)

All icons are rendered through `src/components/ui/Icon.tsx` (`<Icon name="trophy" />`) and loaded from a
Font Awesome kit script in `src/app/layout.tsx`.

1. **Required setup (production)**: open your Font Awesome kit settings on fontawesome.com and add these to
   **"Allowed Domains"**, otherwise icons will not render on those hosts:
   - `localhost:3000`
   - your Vercel (or other) production domain
2. **If the kit is blocked/offline**: the app stays fully usable — icons are decorative (`aria-hidden`) with
   text labels kept everywhere; you will only see small empty icon boxes.
3. **Optional self-hosted alternative (faster, works offline)**:
   ```bash
   npm install @fortawesome/fontawesome-free
   ```
   then in `src/app/globals.css`:
   ```css
   @import '@fortawesome/fontawesome-free/css/all.min.css';
   ```
   and remove the `<Script>` kit tag from `src/app/layout.tsx` (the free CSS contains the same `_map` icons).

---


## Core Fixture Rules Implemented

1. **Rule 1: Auto-Detected Recent Champions**
   - Automatically scans completed tournaments (and historical records) of the same `sport + ageGroup + gender` within the configured lookback window (default 3 years, configurable to 4 years).
   - Displayed read-only to organizers prior to generation. Past tournament records can be recorded via the **Past Champions** admin tab.
2. **Rule 2: Champions Round 1 Byes**
   - Recent champions never play in Round 1 whenever byes are available.
3. **Rule 3: Strong Teams Quarter Separation**
   - Organizer multi-selects strong teams (e.g. NHPS, MNR, BVPT).
   - Placed via standard bracket seeding across distinct quarters (e.g. 3 strong teams land in 3 different quarters).
   - They cannot meet until the semifinals or final, and receive byes directly after champions.
4. **Rule 4: Same School, Cross-Medium Separation**
   - Teams from the same school with different instruction mediums (e.g. Marathi vs English) are prevented from meeting in Round 1 (hard constraint).
5. **Rule 5: Odd / Non-Power-of-2 Team Play-In Draw**
   - For $N$ teams, $P = \text{next power of 2} \ge N$.
   - $\text{Byes} = P - N$.
   - Play-in matches in Round 1 $= N - P/2$.
   - Round 2 always contains exactly $P/2$ teams.
   - Byes are distributed evenly across all 4 quarters (no two quarters differ by more than 1 bye).
   - Priority: Champions $\to$ Strong Teams $\to$ Random unseeded teams.
   - Bye teams auto-advance directly to Round 2 and are clearly labeled `BYE`.
6. **Rule 6: Deterministic Randomness & PRNG**
   - Remaining teams shuffled with a Mulberry32 PRNG using a saved seed for 100% reproducible draws.
   - Constraint solver tests up to 1,000 iterations to guarantee all hard and soft constraints.
   - Transparent warnings emitted if an extreme constraint requires relaxation.
7. **Rule 7: Conflict Priority Hierarchy**
   - `(1) Same school in R1` > `(2) Strong teams in separate quarters` > `(3) Champions get byes` > `(4) Strong teams get byes` > `(5) Random fairness`.
8. **Rule 8: Full Bracket Tree Generation & NextMatch Auto-Advance**
   - All matches from Round 1 through the Final are created up front with `nextMatch` and `nextSlot` ('A' | 'B') links.
   - Recording match results auto-advances winners to the next slot. When the final match is completed, the tournament is marked `completed` and the winner is saved as a future recent champion!

---

## Team Enrollment Module

- **Schools Management**: Full CRUD (`GET`, `POST`, `PUT`, `DELETE /api/schools`) with custom instruction mediums (e.g. Marathi, English, Hindi).
- **Teams Management**: Full CRUD (`GET`, `POST`, `PUT`, `DELETE /api/teams`) linked to parent schools with instruction medium restricted to the school's configured mediums.
- **Bulk CSV Import (`POST /api/teams/import`)**:
  - File upload (`.csv`) or paste raw CSV with required columns: `schoolName, teamName, medium, ageGroup, gender`.
  - Preview table with row-level validation errors, missing field highlights, and duplicate detection (in-CSV and in-database).
  - Bulk commit creating new schools and teams in one action.
- **Tournament "Teams" Tab**:
  - Searchable list of registered teams, auto-filtered to the tournament's `ageGroup` + `gender`.
  - Multi-select checkbox enrollment with "Select All" toggle.
  - One-click "âš¡ Add Team" shortcut that creates a new team and immediately enrolls it without leaving the page.
  - Enrolled teams list with individual "Remove / Withdraw" actions (`DELETE /api/tournaments/:id/enrollments/:teamId`).
  - Live geometry counter: Enrolled teams ($N$), bracket size ($P$), Round 1 byes ($P - N$), play-in matches ($N - P/2$), Round 2 teams ($P/2$).
  - Validations: minimum 4 teams required to lock enrollment, strict category match, no duplicate enrollment.
  - **Lock / Unlock Enrollment**:
    - `POST /api/tournaments/:id/enrollments/lock`: locks enrollment (requires min 4 teams). Fixture generation is strictly blocked until enrollment is locked.
    - `POST /api/tournaments/:id/enrollments/unlock`: unlocks enrollment; shows a warning if fixtures already exist that they will need to be regenerated if teams change.
  - `Enrollment` model: tournament, team, status (`enrolled` | `withdrawn`), enrolledBy, enrolledAt.

---

## Test Suite Coverage

Navigate to the **Engine Tests** tab in the top navigation to execute the built-in unit tests verifying:
- **Team counts**: $N = 3, 5, 6, 7, 8, 9, 11, 13, 15, 16, 17, 21$.
- **3 strong teams in separate quarters**.
- **Champions exceeding available byes**.
- **Same-school cross-medium conflict in Round 1**.
- **Quarter bye distribution uniformity**.
- **Deterministic seed reproducibility**.
- **Graceful handling of impossible constraints without crashing**.

---

---

## Participant (School) Accounts & My Matches Portal

Each participating school (e.g. NHPS, MNR, BVPT, DAV) receives its own login credentials. A single school login covers all teams belonging to that school across mediums and age categories.

### 1. How Organizers Create Participant Accounts
1. Sign in as an **Organizer** or **Admin**.
2. Click the dedicated **"School Accounts"** tab in the top navigation bar.
3. Click **"+ Create School Account"**.
4. Select the school from existing schools, enter the coach/representative's name, email/mobile number, optional custom **School Code** (e.g. `nhps`), and temporary password.
5. Click **"Create Account"**. The account will appear in the table with its active status, password state, and generated credentials.
6. Click the **Copy Invite** button next to the school to copy login details (School Code, temporary password, and portal link) to share with the school coach.
7. Click the **"View as School" (Eye icon)** to open an instant read-only preview of the school's portal with a prominent top banner and one-click exit back to admin.

### 2. Password Reset & Account Deactivation
- **Reset Password**: Click the **Rotate / Reset** icon on any school account to issue a new temporary password. The school coach is automatically forced to change it on their next login.
- **Deactivate / Reactivate**: Click the **Power** icon to immediately disable access if a school withdraws from the tournament.

### 3. School Coach Login Flow & Isolation
1. School coaches click **"School Login"** in the top navigation bar (or visit `/school/login`).
2. Enter **School Code** (or registered email/phone) and password.
3. **Mandatory First Login Password Change**: On first sign-in, the system enforces setting a new secure password (encrypted via PBKDF2).
4. After signing in, the coach lands directly on their dedicated **School Portal (`/school/*`)**:
   - **Completely Isolated Layout**: No DSO admin navigation (Tournaments, Teams & Schools, Past Champions, Engine Tests) and no role switcher dropdown are present.
   - **Dashboard**: "Next Match" highlight card with live kick-off countdown ticker, venue directions, and win/loss statistics.
   - **My Schedule**: Today, Upcoming, and Completed matches with Won/Lost badges, opponent context ("Winner of Match #X (Depends on Team 1 vs Team 2)"), BYE advancement cards ("BYE: advances directly to next round"), and schedule change highlights.
   - **Acknowledge Schedule**: Coaches can click "Acknowledge" to confirm they have seen their match times; organizers can track acknowledgements in real time.
   - **Download Calendar (.ics)**: Instant export to Google Calendar or Apple Calendar.
   - **Print Match Pass**: Print-friendly match sheet for coaches and team managers.
   - **My Bracket Path**: Simplified progression tree showing the school's road through the bracket.
   - **Notifications**: In-app bell with alerts for fixture publication, schedule changes, venue shifts, and match results.

---

## Strict Data Secrecy (Strong Teams & Seeds Invisible)

Organizer seeding strategies and "strong team" selections are private organizer-only administrative details. Participating schools and the general public NEVER see strong team designations:
- **Server Whitelist Serialization**: All participant and public route responses pass through `sanitizeTournamentDto`, `sanitizeTeamDto`, `sanitizeMatchDto`, and `sanitizeNotificationDto`. Fields like `strongTeams`, `isStrong`, `seed`, `snapshot`, `appliedRules`, and `warnings` are stripped at the server layer.
- **Clean Bracket & Bye Progression**: Public and participant bracket screens display neutral labels (e.g. "BYE: advances to next round" without seed or bye-reasoning text).
- **Automated Verification**: Test `TEST_STRICT_SECRECY_NO_STRONG_SEED_CHAMPION_LEAKS` in the test suite verifies that serialized payloads contain zero forbidden keys (`strongTeams`, `seed`, `snapshot`) and no case-insensitive keywords.

---

## Temporary Seeded Login Accounts (For Testing & Verification)

To test the multi-school portal quickly, temporary login accounts can be seeded for existing schools.

### Seeding Accounts
Run:
```bash
npm run seed:temp-logins
```
This reads existing schools in the database and creates 1 admin account, 1 organizer account, **2 scorer accounts (`scorer@dso.gov.in` / `SCORER`, `scorer2@dso.gov.in` / `SCORER2`)**, and 1 participant account per existing school using the password from `TEMP_LOGIN_PASSWORD` (default: `DSO@2026`).

### Quick Login Dropdown (Dev Only)
When `NEXT_PUBLIC_ENABLE_TEMP_LOGINS=true` in development, the login modals (school, admin, and the scorer console) display a small **"Quick login (temporary)"** dropdown that fills credentials with one click. It is strictly disabled in production.

### How to Clean Up and Remove Temp Logins Later
When testing is complete, remove all temporary login code by doing the following:
1. **Delete created accounts**:
   ```bash
   npm run seed:temp-logins:remove
   ```
2. **Delete the seed script and dev folder**:
   - Delete `scripts/seed-temp-logins.ts`
   - Delete `src/server/dev/temp-logins/` (seeding runtime) and `src/app/api/dev/` (route handlers, already disabled in production builds) and `src/dev/temp-logins/` (UI)
3. **Remove npm scripts from `package.json`**:
   - Remove `"seed:temp-logins"` and `"seed:temp-logins:remove"`
4. **Clean environment flags**:
   - Remove `TEMP_LOGIN_PASSWORD` and `NEXT_PUBLIC_ENABLE_TEMP_LOGINS` from `.env`
5. **Remove `isTempSeed` attribute from User model**:
   - Remove `isTempSeed?: boolean;` from `UserDoc` in `src/shared/types.ts`
  6. **Remove QuickLoginDropdown from `SchoolLoginModal.tsx`, `AdminLoginPage` / login screen, and `ScorerLoginCard.tsx`**, and the temp-login strip from `admin-shell.tsx`:
   - Remove the import and `<QuickLoginDropdown ... />` component.
All temporary login code is marked with the comment `// TEMP-LOGIN: remove later` for easy search.

## LIVE SCORER Module (Kho-Kho)

A server-authoritative live scoring system for Kho-Kho tournaments: dedicated scorers clock in from the
field, every point/pause/turn is event-sourced through the server, and participants, schools, and the
public watch the match update in near-real-time.

### Roles & Access

| Role | Ability |
|------|---------|
| `admin` / `organizer` | Score **any** match from `http://localhost:3000/score`, assign scorers, correct results after completion |
| `scorer` | Score **only matches they are assigned to** (`MatchDoc.scorerIds`) |
| `viewer` / `participant` / public | Read-only live score (`/api/.../matches/:id/score`) — never include scorer identity |

### 1. Scorer Console (`http://localhost:3000/score`)

- `/score` — list of scoreable matches (published/ongoing tournaments, both teams decided, not a bye).
  Scorers see only their assigned matches; admins/organizers see everything. Inline login gate for staff.
- `/score/[tournamentId]/[matchId]` — full-screen standalone console (outside the admin route group;
  page-level `canScore` gate). Every visible prompt is driven by the **server-built scoreboard**
  (`nextAction`):
  1. **Toss** (first-innings and extra-innings rounds) → Start turn
  2. **Turn panel** — giant server-authoritative timer, current batch, chaser, live points
  3. **Event buttons** — DISMISSAL (Tagged out / Out of bounds / Late entry, +1 pt), FOUL, PAUSE, RESUME, TURN_END (all-out / timer-expired hints, or manual with reason)
  4. **DOWN/Undo last event** (VOID event) / \
  5. **Follow-on decision** (enforce/decline), **sudden-death** timing panel, **manual decision** with mandatory reason
  6. **Complete match** — finalized through the existing `matchService.recordResult` (bracket auto-advance + notifications) or **Override winner** (audit-logged `score_override_winner`)

**Pause semantics**: pausing the turn **stops the clock**. The scoreboard shows a large
`CLOCK STOPPED - waiting for the scorer to resume` amber banner with a raised reminder after 2 minutes
(`PAUSE_REMINDER_MS = 120000`). The remaining turn time is frozen on the server.

### 2. Server-Authoritative Clock (no client trust)

- Events cannot fake time: the client sends no usable `atMs`. Every event is stamped with **server wall
  time** anchored to the scoring-session creation epoch, and the timeline is **monotonic** (clamped).
- The scoreboard is always computed from `engine.getScoreboard(state, Date.now() - epoch)` on the server;
  clients only **interpolate** the remaining/paused time between polls using a `snapshotAt` anchor
  (`src/hooks/useLiveScore.ts`, scorer console does the same with a 250 ms tick + light double-scorer polling).
- Turn durations (420 s U-14 / 540 s U-17+ per age), pause windows, and sudden-death timings are therefore tamper-proof.

### 3. Data & API

- Event-sourced persistence: `MatchScoreDoc` (session) + `ScoreEventDoc` (append-only events) in
  `src/server/repositories/matchScoreRepository.ts`; engine in `src/shared/scoring/` (pure, tested:
  `scoringTestSuite.ts`, 37 cases), service in `src/server/services/scoringService.ts`.
- All live-score reader DTOs (`MatchScoreViewDto`) are whitelisted through `sanitizeMatchScoreDto` —
  `recordedBy`/`recordedByRole` are stripped; viewers can never learn who scored.
- First scoring activity flips the match from `upcoming` to **`live`**; completion/override records the
  result, marks the session `completed`, and re-uses the normal bracket auto-advance (`nextMatchId/nextSlot`).

Routes (route.ts -> guards -> controller -> service):
- `GET  /api/scoring/my-matches` — scorer console list (role-filtered)
- `GET  /api/scoring/matches/:id` — console detail (match + session + scorerNames)
- `POST /api/scoring/matches/:id` — create/resume the scoring session
- `POST /api/scoring/matches/:id/events` — append one engine event (Zod `scoreEventSchema`)
- `POST /api/scoring/matches/:id/undo` — VOID the last actionable event
- `POST /api/scoring/matches/:id/complete` — finalize through `recordResult`
- `POST /api/scoring/matches/:id/override-winner` — manual decision (reason mandatory)
- `GET  /api/admin/scorers` — scorer accounts available for assignment
- `PUT  /api/admin/matches/:id/scorers` — assign/replace the scorer roster (audit `assign_scorers`)
- `GET  /api/my|school/matches/:id/score` — school-scoped live score (403 for other schools)
- `GET  /api/public/matches/:id/score?version=` — anonymous live score (version short-circuit)

Audit trail (`what` values): `assign_scorers`, `score_event`, `score_undo`, `score_complete`, `score_override_winner`.

### 4. Live Views (`http://localhost:3000` surfaces)

- `src/hooks/useLiveScore.ts` — transport-agnostic polling hook: version short-circuit
  (`{changed:false}` costs nothing), hidden-tab suspension with instant resume, manual refresh, and the
  `snapshotAt` interpolation anchor. Swapping to SSE/WS later only replaces the fetcher.
- `src/features/scoring/LiveScoreCard.tsx` — shared presentational LIVE/FINAL card: team totals,
  winner crown, turn strip with the big monospace server clock, `CLOCK STOPPED` banner, engine
  winner label, attribution-free events ticker.
- **Participant portal**: `MatchDetailModal` shows a live card whenever a scoring session exists
  (`/api/my/matches/:id/score`, school-scoped).
- **Public bracket**: `PublicTournamentPage` shows a **LIVE NOW** strip — one polling card per match
  with `status === 'live'` (`/api/public/matches/:id/score`).

### 5. Admin Corrections & Scorer Assignment (Phase 5)

Published fixture list (`/tournaments/[id]` -> Match Schedule List) per real match:
- **Scorers** — assign/replace the roster (assignment is scoped per match and audit-logged).
- **Scorer Console** link for any `live` match (admins/organizers can score without assignment).
- **Correct** — rewrite the official result of a completed match in amber correction mode; the change
  re-advances the bracket from that point (finals re-crown the champion) and is audit-logged with the
  previous winner.

### 6. Tests (94 total)

- `scoringTestSuite.ts` — 37 engine cases (toss, turn lifecycle, clock, pause/resume, dismissals,
  all-out, follow-on, extra innings, sudden death, manual decision, undo/void).
- `scoringAccessTestSuite.ts` — 5 authorization cases: scorer-scope enforcement, wrong-school 403s,
  viewer 403, DTO secrecy (no scorer identity), and polling version short-circuit.
- `scoringScopingTestSuite.ts` — tournament-scoped scoring: hole management, event append through the
  real `MatchScoreEngine`, undo void semantics, cross-tournament isolation.
- `scoreQueueTestSuite.ts` — offline-first `ScoreEventQueue`: FIFO execution, backoff retries
  (408 / 429 / 5xx), 401 pause keeps ALL events and `resume()` re-sends the same `eventId`s,
  late-retry payload preservation (`eventId` + original `clientAtMs`), 4xx cascade drop.

---

## How to add a new sport (sport-pluggable scoring)

Kho-Kho is a registered sport; any further sport hooks into the same console shell, route registry
and API without touching the shared host. The registry is `src/features/scoring/shared/registry.ts`
(id-based, fanned out to `registryComponents.ts` for lazy component loading) — every entry is served
through `getSportConsole()` and `getSportConsoleMeta()`.

1. **Event + DTO types** in `src/shared/scoring/matchScoring.ts`: the engine state type, the
   discriminated event union, and the scoreboard view built by the server. Only the scoring DTO has
   to stay whitelisted through `sanitizeMatchScoreDto` (keep `recordedBy` stripped).
2. **Engine implementation** in `src/shared/scoring/<sport>/`:
   - `MatchScoringFactory`-style state: a factory for the session core, deterministic action
     handlers for every event in the union, auditability (each event persisted with `what` in
     `ScoreEventDoc`), and a `getScoreboard(state, now)` — **all timestamps server-authoritative,
     monotonic and clamped** (same no-client-trust rule as Kho-Kho).
   - The engine must stay pure (no database, no fetch) so its tests run in `runTests.ts`.
3. **Server service** in `src/server/services/scoringService.ts`: extend the scoring session lifecycle
   (create/start/append/undo/complete) to dispatch per sport id — the row storage and the
   tournament scoping (a console lives at `/score/[tournamentId]/[matchId]`) stay identical for
   every sport. Keep undo = VOID + version bump semantics (the queue's reconcile depends on it).
4. **Console component** in `src/features/scoring/<sport>/` implementing `SportConsoleProps`
   (server `MatchScoreState` events + `sendEvent`, `sendUndo`, `canUndo`, pending queue count). Use
   `ScoringConsoleHost.tsx` as the shared shell (offline queue chip, `authPaused` "held" chip, 401
   redirect, fault banner, undo handling) and never manage the offline queue yourself: send
   unconditionally and let `ScoreEventQueue` + headers/cookies decide the fate of events.
5. **Live view component** in `src/features/scoring/<sport>/` implementing `SportLiveViewProps`
   (read-only surface consumed by `useLiveScore`/`LiveScorePanel`) for the school and public readers.
6. **Register the sport id**: add the entry in the registry with its `Console` and `LiveView`
   accessors. The score hub picker, `LiveScorePanel` and the reader surfaces resolve via the
   registry — no other UI or route changes are needed.
7. **Tests**: add `<sport>ScoringTestSuite.ts` next to `scoringScopingTestSuite.ts` following the
   same pattern (engine determinism, undo/void convention, cross-tournament scoping) and a
   `scoreQueue`-style suite only if the sport's semantics differ. Register the suite in
   `src/server/tests/runTests.ts` and `src/app/api/tests/run/route.ts`. Run `npx tsc --noEmit`,
   `npm test` and `npm run build` (commands above).
