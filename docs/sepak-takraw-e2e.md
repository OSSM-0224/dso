# Sepak Takraw — End-to-End Verification

This checklist covers the sepak-takraw module end to end: tournament setup,
scorer console, live reader views, and kho-kho regression. Run it on the
`feature/sepak-takraw` branch before merging to `main`.

## What is wired

- Pure engine + rules: `src/shared/scoring/sports/sepakTakraw/` (registered in
  `src/shared/scoring/engine.ts`).
- Server session defaults, validation and undo:
  `src/server/services/scoringService.ts`.
- Scorer console: `src/features/scoring/consoles/sepakTakraw/SepakTakrawConsole.tsx`.
- Reader live view: `src/features/scoring/consoles/sepakTakraw/SepakTakrawLiveView.tsx`.
- Registry entries: `src/features/scoring/consoles/registry.ts` +
  `registryComponents.ts`.

## Rule quick reference

| Item | Value |
| --- | --- |
| Match | Best of 3 sets (first to 2 set wins) |
| Set 1 / Set 2 | 21 points, win by 2, hard cap 25 (deuce at 20-20) |
| Deciding set | 15 points, win by 2, hard cap 17 (deuce at 14-14) |
| On court | 3 players — Tekong (T), Feeder (F), Striker (S) |
| Roster | Up to 5 (3 on court + 2 subs) |
| Serve rotation | 3 consecutive rallies per team, regardless of rally winner |
| Deuce serve | Changes after every rally (display 1/1) |
| Service fault | Counts as a serve; awards the point to the opponent |
| Toss | Set 1 toss; set 2 first serve alternates; deciding set needs a fresh toss |
| Side change | Deciding set, when a team reaches 8 points |
| Timeouts | 1 per team per set (configurable) |

## 1. Automated gates

```bash
npx tsc --noEmit
npm test
```

Expected: `tsc` is silent; `npm test` ends with `Total: 126, Passed: 126`.

In the app (staff): open `/engine-tests` and click **Run All Engine Tests**.
The sepak suite is included, plus `TEST_REGISTRY_*` and
`TEST_SCORING_SEPAK_TAKRAW_SESSION`. The node test runner reports the
component-registry suite as **NOT COVERED** by design (it cannot import
`next/link` under the `react-server` condition) — the browser walkthrough in
sections 3–4 is the real check for Console/LiveView wiring.

## 2. Setup (staff)

1. `npm run dev` and open `http://localhost:3000`.
2. Sign in as admin/organizer from the landing page.
3. **Tournaments → New Tournament**: choose sport **Sepak Takraw**, set age
   group/gender, create.
4. Create/enroll at least 2 teams (4 is better to verify advancement), then
   generate fixtures and publish the tournament.
   - The scorer hub only lists matches once both teams are decided and the
     tournament is published/ongoing.
5. Open the tournament → **Scorers** tab → assign a scorer account
   (tournament-level roster; per-match assignment still works).
6. As the scorer: open `/score` (or use the dev Quick Login dropdown), pick the
   tournament, then open the match card.

## 3. Scorer console checklist

### Session start

- [ ] **Start scoring session** → phase shows `awaiting toss`.
- [ ] Toss: pick the winning team, choose **Serve first** or **Receive first**,
      click **Record toss**.
- [ ] Lineups: for each team enter three distinct jersey numbers and assign
      Tekong / Feeder / Striker; optionally add comma-separated substitute
      jersey numbers. Save both lineups.
- [ ] **Start set 1**.

> Jersey numbers typed here become the player identifiers used by stats.
> Scorers cannot list the school player roster (staff-only endpoint), so enter
> the numbers worn by the players on court.

### Rally scoring

- [ ] Serving badge shows `1/3`; after each rally it advances `2/3`, `3/3`,
      then the serve changes team — even when the serving team wins the rally.
- [ ] **Ace** is enabled only for the serving team; it credits the current
      Tekong.
- [ ] **Attack / Block / Other point** score for either team; the optional
      player dropdown attributes the point.
- [ ] **Fault** by the serving team offers service faults; a fault awards the
      point to the opponent and consumes a serve.
- [ ] **Fault** by the receiving team offers only play/boundary faults.
- [ ] If the tournament config has `letServeAllowed: true`, the
      "Serve touched the net" fault is hidden (played on instead).
- [ ] **Timeout** is allowed once per team per set; the button disables at the
      limit and resets in the next set.
- [ ] **Undo last event** voids the last event and reverts the score/serve.
- [ ] Role swap and substitution controls update the on-court list (subs can
      return later).

### Set and match flow

- [ ] Reach 21 with a 2-point lead → set completes (21-20 continues; 22-20
      wins; 25-24 hits the cap).
- [ ] **Start set 2** → first serve is the opposite of set 1.
- [ ] Reach 1-1 in sets → deciding-set toss is required before the set starts.
- [ ] Deciding set: at 8 points the side-change banner appears; confirm it and
      the banner clears (scoring is never blocked by it).
- [ ] Deciding set: 15 with a 2-point lead wins (14-14 deuce → win by 2, cap
      17); serve changes every rally and shows `1/1`.
- [ ] After the second set win the console shows **Match decided** → click
      **Complete match**.
- [ ] The winner advances in the bracket; if this was the final, the tournament
      completes and the result is audited/notified.

### Corrections / emergency

- [ ] Undo works mid-match while the event queue is drained.
- [ ] **Override winner** requires a reason of at least 5 characters and
      records the result through the bracket pipeline.
- [ ] The recent-events ticker shows toss, lineups, sets, points, faults,
      timeouts and voids without scorer identity.

## 4. Reader surfaces

- [ ] Public tournament page (`/public/tournaments/<id>`) shows the live card
      for the ongoing match.
- [ ] School portal (`/school/...` → match) shows the same card.
- [ ] Card shows: phase badge (In play / Set break / Final), current points,
      set wins, serving team + `n/3` (or `1/1` at deuce), Tekong, deuce strip,
      timeouts while live, side-change note, sets history, last events.
- [ ] Completed match shows the winner and set-score label (e.g. `2-0`).
- [ ] No scorer name, email, seed, strong-team flag or internal key appears in
      the reader payload or the card.

## 5. Regression checks

- [ ] A kho-kho tournament still opens its console and scores normally
      (toss → turn start → dismissal → undo → completion).
- [ ] Kho-kho live cards are unchanged.
- [ ] Tournament and past-tournament sport dropdowns persist
      **Sepak Takraw** as `sepak-takraw` (no duplicate `volleyball` option).
- [ ] Unknown sports still fall back to the generic live card.

## 6. Housekeeping

- `tsconfig.tsbuildinfo` is a build artifact — leave it uncommitted.
- After the walkthrough, report any rule mismatch with the DSO rulebook;
  all rule values live in `DEFAULT_SEPAK_TAKRAW_SCORING_CONFIG` and can be
  changed without touching the console.
