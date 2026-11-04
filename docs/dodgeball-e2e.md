# Dodgeball — End-to-End Verification

This checklist covers the dodgeball module end to end: tournament setup, scorer
console, live reader views, jersey-wise statistics, and kho-kho/sepak-takraw
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
| Match | Best of 3 sets (first to 2 set wins) |
| Set | 8 minutes (5-minute short format configurable) |
| Extra time | 2 minutes when a set is tied |
| Sudden death | First point wins the set |
| On court | 6 players; minimum 4 to start |
| Squad | Up to 10 (6 on court + 4 substitutes), jerseys 1–10 |
| Point actions | Hit, line-out, catch, red card, injury, delay, revival failure |
| All-out | +2 bonus and a 5-second revival window |
| Revival failure | Opponent point, then the team re-enters so play continues |
| Catch | Thrower out and one team-mate revived (both configurable) |
| Cards | Yellow warning; red disqualifies for the match and awards a point |
| Delays | 5-second and 3-second delay types |
| Substitutions | Between sets only; red-carded players cannot return |

## 1. Automated gates

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: `tsc` is silent; `npm test` ends with
`Total: 158, Passed: 158`; the production build completes.

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

### Session start and lineups

- [ ] **Start scoring session** → phase shows `awaiting toss`.
- [ ] Toss: pick the winning team and click **Record toss**. The rulebook gives
      the toss winner the choice of court only.
- [ ] Each team's lineup panel: enter at least 4 and up to 6 distinct jersey
      numbers (1–10) on court; enter up to 4 substitute jerseys.
- [ ] Saving a lineup with 3 players, a duplicate jersey, or jersey `11` is
      rejected with a clear message.
- [ ] Save both lineups, then **Start set 1**.
- [ ] If a team has substitutes, the interval panel offers an outgoing player
      and an incoming substitute before the next set.

> Jersey numbers typed here are the player identifiers used by every stat.
> Scorers do not need the school roster; they enter the numbers worn on court.

### Clock and pause

- [ ] The set clock starts at `8:00` and counts down in the console header.
- [ ] **Stop clock** freezes the countdown; **Resume clock** continues from the
      same remaining time.
- [ ] After regulation expires the console shows **Set time is over** and
      scoring buttons are replaced by **End set**.
- [ ] Ending a set before the timer expires is rejected by the engine.

### Point actions

- [ ] Select an opponent player and click **Hit** → the scoring team gains one
      point and the target appears in the out list with a red jersey chip.
- [ ] Select an opponent player and click **Line out** → one point and the
      target is out.
- [ ] Select an own player and click **Catch** → the catcher is credited, the
      chosen opponent thrower is out, and one own out player is revived.
      Leaving the revival target on “Automatic” revives the first out player.
- [ ] **Yellow card** records a warning; a second yellow for the same player is
      rejected and must be entered as a red.
- [ ] **Red card** puts the player out, disqualifies them for the match, and
      awards the opponent a point.
- [ ] **Injury out** puts the player out and awards the opponent a point.
- [ ] **Delay** (5-second or 3-second) awards the opponent a point but does not
      put the player out.
- [ ] Attempting to score after the target is already out is rejected.

### All-out and revival

- [ ] Put all six players of one team out with hits/line-outs.
- [ ] The scoreboard shows **Revival window**, the six out jerseys, and a
      5-second countdown.
- [ ] **All back in** returns all six players and closes the window.
- [ ] Repeating the all-out cycle awards the +2 bonus again (default
      `allOutBonusRepeats: true`).
- [ ] **Revival failed** awards the opponent a point, then returns all six so
      play can continue.
- [ ] No other action is accepted while the revival window is open.

### Set and match flow

- [ ] After the set clock expires with a non-tied score, click **End set** →
      the set appears in the history with its winner and the console offers
      **Start set 2**.
- [ ] Substitutions are available between sets and update the on-court list.
- [ ] If the set is tied at the end of regulation, the console offers
      **Start 2-minute extra time**.
- [ ] If extra time ends tied, the console offers **Start sudden death**.
- [ ] The first point in sudden death completes the set immediately.
- [ ] Win two sets → console shows **Match decided** → click **Complete match**.
- [ ] The winner advances in the bracket; if this was the final, the tournament
      completes and the result is audited/notified.
- [ ] After a red card, the next set's lineup panel rejects the disqualified
      jersey; replace that player with another squad number.

### Statistics

- [ ] The console's **Player stats (by jersey)** table shows a row per jersey
      and columns for Pts, Hit, Out, Catch, Rev, Card, Delay.
- [ ] A hit credits the thrower with a point and a hit; the victim gets an out.
- [ ] A catch credits the catcher with a catch and the thrower with an out.
- [ ] A revival credits the returning jersey with a revive.
- [ ] The all-out bonus appears on the team-level row, separate from player
      rows.
- [ ] **Undo last event** voids the latest action and removes its stats.

### Corrections / emergency

- [ ] Undo works mid-match while the event queue is drained.
- [ ] **Override winner** requires a reason of at least 5 characters and
      records the result through the bracket pipeline.
- [ ] The recent-events ticker shows toss, lineups, sets, hits, catches, cards,
      revivals, time events and voids without scorer identity.

## 4. Reader surfaces

- [ ] Public tournament page (`/public/tournaments/<id>`) shows the live card
      for the ongoing match.
- [ ] School portal (`/school/...` → match) shows the same card.
- [ ] Card shows: phase badge (In play / Extra time / Sudden death / Final),
      current points, set wins, set clock, active jersey chips, out jersey chips
      (struck through), and the revival banner while the window is open.
- [ ] Set history shows regulation, extra-time and sudden-death states.
- [ ] Player stats are grouped by team and jersey.
- [ ] Completed match shows the winner and set-win label.
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
