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
npm test           # 28 automated tests (engine + API suite + strict secrecy)
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
This reads existing schools in the database and creates 1 admin account, 1 organizer account, and 1 participant account per existing school using the password from `TEMP_LOGIN_PASSWORD` (default: `DSO@2026`).

### Quick Login Dropdown (Dev Only)
When `NEXT_PUBLIC_ENABLE_TEMP_LOGINS=true` in development, the school login modal displays a small **"Quick login (temporary)"** dropdown that fills credentials with one click. It is strictly disabled in production.

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
6. **Remove QuickLoginDropdown from `SchoolLoginModal.tsx`** and the temp-login strip from `admin-shell.tsx`:
   - Remove the import and `<QuickLoginDropdown ... />` component.
All temporary login code is marked with the comment `// TEMP-LOGIN: remove later` for easy search.
