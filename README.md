# DSO Navi Mumbai Multi-Sport Tournament Platform

A tournament operations platform for District Sports Offices (DSOs) in Navi Mumbai. Organizers create a tournament, enroll school teams, generate a seeded bracket, publish fixtures, and run matches with a server-authoritative scorer console. Coaches and the public follow the same match live.

The platform replaces notebook fixture-drawing with a deterministic, constraint-aware play-in single-elimination engine, and replaces paper score sheets with event-sourced live scoring.

---

## Supported sports

| Sport | Tournament setup | Scorer console | Live view | Player tracking |
| --- | --- | --- | --- | --- |
| **Kho-Kho** | Yes | Yes | Yes | Team and turn events |
| **Sepak Takraw** | Yes | Yes | Yes | Jersey-based point attribution |
| **Dodgeball** | Yes | Yes | Yes | Jersey-wise points, hits, outs, catches, revives, cards, delays |

All three sports are selectable when creating a tournament and when recording a past tournament. Kabaddi and Volleyball are not available in the sport picker at the moment.

---

## The tournament journey

### 1. Create the tournament

Open **Tournaments → New Tournament** and enter:

- tournament name
- sport — Kho-Kho, Sepak Takraw, or Dodgeball
- format — single elimination (play-in)
- age group — U-14, U-17, or U-19
- gender — boys or girls
- year

The sport choice determines which scorer console and live view the tournament uses. No extra configuration is needed after creation; each sport starts from its DSO rulebook defaults.

### 2. Enroll teams

Open the tournament's **Teams** tab. The team list is automatically filtered to the tournament's age group and gender. You can:

- search and multi-select existing teams
- create a new team inline and enroll it immediately
- remove or withdraw an enrolled team
- import teams in bulk from CSV
- lock enrollment once the field is final (minimum four teams)

While teams are enrolled, the page shows the live bracket geometry: enrolled teams, bracket size, Round 1 byes, play-in matches, and Round 2 teams.

### 3. Seed the draw

Before generating fixtures, the organizer can review two private inputs:

- **Recent champions** — the platform scans completed tournaments and historical records for the same sport, age group, and gender within the configured lookback window.
- **Strong teams** — organizer-selected teams that must be separated across quarters.

These inputs are visible to organizers only. They never appear on public or school-facing screens.

### 4. Generate and publish fixtures

Generate the bracket from the tournament page. The engine creates every match from Round 1 through the final, with next-match links already in place. Review the draw, then **publish** it.

Publishing is the point at which coaches can see their fixtures. Until then, the school portal keeps fixtures hidden.

### 5. Coaches see their fixtures

Each school signs in to its own **School Portal**. Coaches see:

- the next match with date, time, and venue
- today, upcoming, and completed matches
- opponent context such as “Winner of Match #X”
- BYE advancement cards
- schedule-change notifications
- an **Acknowledge** button so organizers know the fixture was seen
- calendar export and a printable match pass
- a simplified bracket path for their school

### 6. Prepare match day

Open the tournament's **Scorers** tab and assign one or more scorer accounts. Admins and organizers can score any match; a scorer sees only the matches assigned to them.

The scorer opens `/score`, chooses the tournament, and selects the match. A match becomes scoreable once both teams are decided and the tournament is published or ongoing.

### 7. Score the match

The scorer console is sport-specific and driven by the server's next-action prompt. Every tap is queued, validated by the sport engine, and stored as an immutable event.

- **Kho-Kho** — toss, turn clock, dismissals, fouls, pause/resume, follow-on, extra innings, sudden death, manual decision.
- **Sepak Takraw** — toss and serve choice, three-player lineups with roles, rally points and faults, serve rotation, deuce, timeouts, side change, deciding-set toss.
- **Dodgeball** — toss, six-player jersey lineups with substitutes, set clock, hits, line-outs, catches, cards, injuries, delays, all-out revival, extra time, sudden death.

### 8. Points and corrections

The console shows the live score, set/turn history, active and out players, and a recent-events ticker. If the scorer makes a mistake, **Undo last event** records a void and rewinds the derived state. The event queue keeps actions in order, retries safely after a dropped connection, and never double-counts a duplicate event.

### 9. Result and live view

When the sport engine says the match is decided, the scorer clicks **Complete match**. The result flows through the normal bracket pipeline:

- the winner advances to the next match slot
- the tournament completes when the final is decided
- the champion is saved for future recent-champion scans
- the result is written to the audit log
- participating schools are notified

Readers see the same result through a sport-specific live card on the public tournament page and in the school portal. A completed match shows the winner and final score; an active match shows the live clock and current leaders.

---

## What each role sees

| Role | Main abilities |
| --- | --- |
| **Admin** | Manage tournaments, teams, schools, accounts, scorers, fixtures, and corrections |
| **Organizer** | Create tournaments, enroll teams, seed and publish fixtures, assign scorers, score any match |
| **Scorer** | Score assigned matches only, with the sport-specific console |
| **School coach** | Read-only school portal: fixtures, live scores, acknowledgements, notifications, calendar export |
| **Public** | Published brackets and live score cards with no private seeding data |

---

## Fixture rules

1. **Recent champions are detected automatically** — completed tournaments and historical records with the same sport, age group, and gender are scanned within the lookback window.
2. **Champions receive Round 1 byes first** — they never play in Round 1 while byes are available.
3. **Strong teams are quarter-separated** — selected teams are placed in different quarters and cannot meet before the semifinals.
4. **Same-school cross-medium teams are separated in Round 1** — a hard constraint.
5. **Odd fields use a play-in draw** — for `N` teams and the next power of two `P`: `P - N` byes, `N - P/2` play-in matches, and exactly `P/2` teams in Round 2. Byes are balanced across quarters.
6. **The draw is reproducible** — a stored Mulberry32 seed makes every shuffle repeatable.
7. **Constraint priority** — same-school separation, then strong-team quarters, then champion byes, then strong-team byes, then random fairness.
8. **The full bracket exists up front** — every match has next-match and next-slot links, so recording a result advances the winner automatically.

---

## Sport rule summaries

### Kho-Kho

- Two innings with turn-based chasing and defending.
- Turn duration varies by age group (7 minutes for U-14 and Open, 9 minutes for U-17 and U-19 by default).
- Dismissals, fouls, all-out, follow-on, extra innings, and sudden death are configurable.
- The clock is server-authoritative and freezes while paused.

### Sepak Takraw

- Best of three sets; first to two set wins.
- Sets 1 and 2 to 21 points (win by two, cap 25); deciding set to 15 (win by two, cap 17).
- Three players on court: Tekong, Feeder, Striker; up to two substitutes.
- Service rotation, service faults, deuce serving, timeouts, and deciding-set side changes follow the configured rulebook.
- Points can be attributed to a jersey number for player statistics.

### Dodgeball

| Item | Default |
| --- | --- |
| Match | Best of 3 sets; first to 2 set wins |
| Set | 8 minutes (5-minute short format is configurable) |
| Court | 6 players; minimum 4 to start |
| Squad | Up to 10 named players (6 on court + 4 substitutes) |
| Jerseys | 1–10 |
| Scoring actions | Hit, line-out, catch, red card, injury, delay, revival failure |
| All-out | +2 bonus and a 5-second revival window |
| Revival failure | Opponent gains a point, then the team re-enters so play continues |
| Catch | Thrower is out; one team-mate is revived by default |
| Tie after regulation | 2-minute extra time, then sudden death (first point wins the set) |
| Cards | Yellow is a warning; a red card disqualifies the player for the match and awards the opponent a point |
| Delays | 5-second and 3-second delays award the opponent a point |
| Substitutions | Between sets only; red-carded players cannot return |

Dodgeball tracks statistics by jersey number: **points, hits, outs, catches, revives, cards, and delays**. The same table appears in the scorer console and in the reader live view.

All rule values are configuration defaults. A DSO can adjust a value without changing the console or the bracket logic.

---

## Live scoring model

- **Server-authoritative**: the server stamps event times and rebuilds the scoreboard from the event list. Client clocks are only used to animate the countdown between polls.
- **Event-sourced**: each action is an immutable event. Undo appends a void event; it never edits history.
- **Offline-tolerant**: scoring actions wait in an ordered queue, retry with backoff, and hold safely on an auth pause.
- **Sport-isolated**: the tournament's sport resolves the engine and console. Kho-Kho, Sepak Takraw, and Dodgeball share the same session lifecycle, audit trail, and bracket completion pipeline.
- **Private by default**: reader payloads strip scorer identity, seeds, strong-team flags, and internal scoring state.

---

## School portal

- Dedicated school login with a forced first-login password change.
- Isolated layout with no DSO admin navigation.
- Next-match card, live countdown, venue details, and win/loss record.
- Today, upcoming, and completed schedules with opponent context and BYE cards.
- Schedule acknowledgement for organizers.
- In-app notifications for fixture publication, reschedules, venue changes, and results.
- Calendar export and printable match pass.
- Simplified bracket path.
- Live score cards for matches in progress.

---

## Running locally

```bash
npm run dev        # Development server on http://localhost:3000
npm run build      # Production build
npm start          # Run the production build
npm test           # 158 automated checks
npm run lint       # TypeScript check (tsc --noEmit)
```

Environment variables (see `.env.example`):

- `MONGODB_URI` — optional; without it the app uses the in-memory store.
- `JWT_SECRET` — signing key for session cookies.
- `TEMP_LOGIN_PASSWORD` — password for temporary seeded accounts (default `DSO@2026`).
- `NEXT_PUBLIC_ENABLE_TEMP_LOGINS` — shows the development quick-login dropdown.

### Test coverage

`npm test` runs 158 automated checks across:

- the pure fixture engine (byes, seeding, separation, reproducibility)
- the Kho-Kho scoring engine
- the Sepak Takraw scoring engine
- the Dodgeball scoring engine (30 cases: lineups, clock, hits, catches, all-out revival, cards, delays, extra time, sudden death, best-of-three, void/undo, statistics)
- the sport console registry and component registry
- the offline score-event queue
- participant access isolation and data secrecy
- scorer authorization, idempotency, and tournament scoping

The in-app **Engine Tests** page runs the same suites in the browser.

---

## Demo accounts

For local verification only:

```bash
npm run seed:temp-logins          # create temporary admin, organizer, scorer and school accounts
npm run seed:temp-logins:remove   # remove the seeded accounts
```

Temporary login code is marked with `// TEMP-LOGIN: remove later` and the quick-login dropdown is disabled in production.

---

## Icons

Icons render through `src/components/ui/Icon.tsx` using a Font Awesome kit. For production, add the deployed domain to the kit's allowed domains. If the kit is unavailable, the app remains usable because icons are decorative and every action keeps a text label.
