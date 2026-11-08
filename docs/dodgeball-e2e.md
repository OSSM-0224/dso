# Dodgeball — End-to-End Verification

This checklist covers the dodgeball module end to end: tournament setup, scorer
console, live reader views, team statistics, and kho-kho/sepak-takraw
regression.

## What is wired

- Pure engine + rules: `src/shared/scoring/sports/dodgeball/` (registered in
  `src/shared/scoring/engine.ts`).
- Server session defaults, validation and undo:
  `src/server/services/scoringService.ts`.
- Scorer console: `src/features/scoring/consoles/dodgeball/DodgeballConsole.tsx`.
- Reader live view: `src/features/scoring/consoles/dodgeball/DodgeballLiveView.tsx`.
- Registry entries: `src/features/scoring/consoles/registry.ts` +
  `registryComponents.ts`.
- Engine tests: `src/shared/tests/dodgeballTestSuite.ts` (30 cases).

## Rule quick reference

| Item | Value |
| --- | --- |
| Match | Two 1:30 sets; a third set is played only when the first two leave the match level |
| Set | 1 minute 30 seconds |
| Tie | A level set is recorded as a draw; no set point, no extra time, no sudden death |
| Court | 6 players per side (not listed in the console) |
| Balls | 3 balls per team to attack with |
| Points | Team points only; no individual player points |
| Scoring | Tap **Team point +1** on a team card; no player selection |
| Player selection | None — no jerseys, no on-court/out picks, no dropdowns |
| Toss | Not used; set 1 starts straight away |
| Legacy events | Older hit/catch/card/revival events still replay, but the console exposes team points only |

## 1. Automated gates

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: `tsc` is silent; `npm test` ends with
`Total: 160, Passed: 160`; the production build completes.

In the app (staff): open `/engine-tests` and click **Run All Engine Tests**.
The dodgeball suite is included, plus `TEST_REGISTRY_*` and the shared scoring
suites. The node test runner reports the component-registry suite as
**NOT COVERED** by design (it cannot import `next/link` under the `react-server`
condition); the browser walkthrough in sections 3–4 is the real check for
Console/LiveView wiring.

## 2. Setup (staff)

1. `npm run dev` and open `http://localhost:3000`.
2. Sign in as admin/organizer from the landing page.
3. **Tournaments → New Tournament**: choose sport **Dodgeball**, set age
   group/gender, create.
4. Confirm the tournament record shows sport `Dodgeball` in the list and in
   **Past Champions** (record a past tournament with the same sport).
5. Create/enroll at least 2 teams (4 is better to verify advancement), then
   generate fixtures and publish the tournament.
   - The scorer hub only lists matches once both teams are decided and the
     tournament is published/ongoing.
6. Open the tournament → **Scorers** tab → assign a scorer account.
7. As the scorer: open `/score`, pick the tournament, then open the match card.

## 3. Scorer console checklist

### Session start

- [ ] **Start scoring session** → the console shows **Ready for set 1** with a
      **Start set 1** button.
- [ ] There is no toss step, no lineup entry, no jersey-number input and no
      player selection of any kind.
- [ ] There is no team-colour picker in the console header or score cards.
- [ ] Each team card shows the team's set points and **3 balls**; there are no
      player slots, player chips or player dropdowns.
- [ ] Start set 1 → the clock shows `1:30` and counts down.

### Clock and pause

- [ ] The set clock starts at `1:30` and counts down in the console header.
- [ ] **Stop clock** freezes the countdown; **Resume clock** continues from the
      same remaining time.
- [ ] After 1:30 the console shows **Set time is over** and the scoring buttons
      are replaced by **End set**.
- [ ] Ending a set before the timer expires is rejected by the engine.

### Team points

- [ ] Each team card has a **Team point +1** button and no player controls.
- [ ] Tap a team's button → that team's set points increase by one; no player
      is selected, put out, credited or shown.
- [ ] The team's set points update on the score card and in the set history.
- [ ] **Undo last event** removes the point and restores the previous total.
- [ ] Scoring after the 1:30 clock expires is rejected until the set is ended.
- [ ] Legacy sessions with older hit/catch events still replay correctly, but
      the DSO console never asks for a player.

### Set and match flow

- [ ] After the 1:30 clock expires with a non-tied score, click **End set** →
      the set appears in the history with its winner and the console offers
      **Start set 2**.
- [ ] If a set is level at the end of regulation, it is recorded as a **Draw**
      and awards no set point; there is no extra-time or sudden-death prompt.
- [ ] If the first two sets are level (`0-0` or `1-1`), the console offers
      **Start set 3** labelled as the deciding set.
- [ ] A third set is not offered when one team has won both regulation sets.
- [ ] Win two sets, or win the deciding set, → console shows **Match decided** →
      click **Complete match**.
- [ ] A deciding set that is itself level ends the match as a draw; the
      **Override winner** flow records the official result.
- [ ] The winner advances in the bracket; if this was the final, the tournament
      completes and the result is audited/notified.

### Statistics

- [ ] The console shows only team-level points; there is no per-player or
      per-jersey stats table and no player point attribution.
- [ ] Every **Team point +1** tap adds exactly one point to that team.
- [ ] **Undo last event** voids the latest point and restores the total.

### Corrections / emergency

- [ ] Undo works mid-match while the event queue is drained.
- [ ] **Override winner** requires a reason of at least 5 characters and
      records the result through the bracket pipeline.
- [ ] The recent-events ticker shows sets, team points, time events and voids
      without scorer identity.

## 4. Reader surfaces

- [ ] Public tournament page (`/public/tournaments/<id>`) shows the live card
      for the ongoing match.
- [ ] School portal (`/school/...` → match) shows the same card.
- [ ] Card shows: phase badge (In play / Clock stopped / Final), current set
      points, set wins, the 1:30 clock and the three balls per team.
- [ ] There are no player chips, player selections, jersey numbers or
      player-level statistics anywhere on the card.
- [ ] Set history shows completed sets, draws, and the deciding set.
- [ ] Completed match shows the winner and set-win label, or **Match drawn**.
- [ ] No team colours are used on the card.
- [ ] No scorer name, email, seed, strong-team flag or internal key appears in
      the reader payload or the card.

## 5. Regression checks

- [ ] A kho-kho tournament still opens its console and scores normally
      (toss → turn start → dismissal → undo → completion).
- [ ] A sepak-takraw tournament still scores a rally, fault, set and completion.
- [ ] Both existing live cards are unchanged.
- [ ] New Tournament and Past Champions sport dropdowns include **Dodgeball**
      and do not list Kabaddi or Volleyball.
- [ ] Unknown sports still fall back to the generic live card.

## 6. Housekeeping

- `tsconfig.tsbuildinfo` is a build artifact — leave it uncommitted.
- After the walkthrough, report any rule mismatch with the DSO rulebook; all
  rule values live in `DEFAULT_DODGEBALL_SCORING_CONFIG` and can be changed
  without touching the console.
