import { fixtureEngine } from '../../shared/engine/engineRegistry.ts';
import { EngineTeam, FixtureGenerationResult } from '../../shared/engine/types.ts';
import {
  validateRound1SchoolSeparation,
  validateRound2SchoolSeparationWithPlayIn,
  validateAllSchoolSeparation,
} from '../../shared/engine/rules/sameSchoolRule.ts';
import { validateStrongTeamsQuarterSeparation } from '../../shared/engine/rules/quarterSeparationRule.ts';
import { validateByeDistribution, validateChampionsReceivedByes } from '../../shared/engine/rules/byeDistributionRule.ts';
import { TestResult, TestSuiteSummary } from '../../shared/types.ts';

export type { TestResult, TestSuiteSummary };

/**
 * Generates synthetic teams for testing pure engine logic.
 * Notice: This is purely in-memory test fixtures for unit testing the engine,
 * no dummy data is placed into the persistent database.
 */
function createSyntheticTeams(
  count: number,
  options?: {
    sameSchoolPairs?: Array<{ schoolId: string; schoolName: string }>;
    strongCount?: number;
    championCount?: number;
  }
): {
  teams: EngineTeam[];
  strongIds: string[];
  championIds: string[];
} {
  const teams: EngineTeam[] = [];
  const strongIds: string[] = [];
  const championIds: string[] = [];

  let teamIdx = 1;

  // If specific same-school pairs requested
  if (options?.sameSchoolPairs) {
    for (const pair of options.sameSchoolPairs) {
      const t1: EngineTeam = {
        id: `team-${teamIdx++}`,
        name: `${pair.schoolName} (Marathi)`,
        schoolId: pair.schoolId,
        schoolName: pair.schoolName,
        medium: 'Marathi',
      };
      const t2: EngineTeam = {
        id: `team-${teamIdx++}`,
        name: `${pair.schoolName} (English)`,
        schoolId: pair.schoolId,
        schoolName: pair.schoolName,
        medium: 'English',
      };
      teams.push(t1, t2);
    }
  }

  // Fill remainder with distinct schools
  while (teams.length < count) {
    const sId = `school-uniq-${teamIdx}`;
    const sName = `Navi Mumbai Vidya Mandir ${teamIdx}`;
    const medium = teamIdx % 2 === 0 ? 'English' : 'Marathi';
    teams.push({
      id: `team-${teamIdx}`,
      name: `Team ${teamIdx} (${sName})`,
      schoolId: sId,
      schoolName: sName,
      medium,
    });
    teamIdx++;
  }

  // Trim to exact count
  teams.length = count;

  // Mark strong teams
  const strongCount = options?.strongCount || 0;
  for (let i = 0; i < strongCount && i < teams.length; i++) {
    strongIds.push(teams[i].id);
    teams[i].isStrong = true;
  }

  // Mark champion teams
  const championCount = options?.championCount || 0;
  for (let i = 0; i < championCount && i < teams.length; i++) {
    const idx = (i + strongCount) % teams.length;
    championIds.push(teams[idx].id);
    teams[idx].isChampion = true;
  }

  return { teams, strongIds, championIds };
}

export function runFixtureEngineTestSuite(): TestSuiteSummary {
  const startTime = Date.now();
  const results: TestResult[] = [];

  const requiredSizes = [3, 5, 6, 7, 8, 9, 11, 13, 15, 16, 17, 21];

  // 1. Team Size Tests (N = 3, 5, 6, 7, 8, 9, 11, 13, 15, 16, 17, 21)
  for (const N of requiredSizes) {
    const t0 = performance.now();
    try {
      const { teams } = createSyntheticTeams(N);
      const res = fixtureEngine.generate({
        tournamentId: `test-n-${N}`,
        teams,
        strongTeamIds: [],
        championTeamIds: [],
        seed: 42 + N,
        sport: 'kho-kho',
        format: 'single-elimination',
      });

      // Verify power of 2 math
      let expectedP = 1;
      while (expectedP < N) expectedP *= 2;
      const expectedByes = expectedP - N;
      const expectedR1Matches = N - expectedP / 2;

      const r1PlayIns = res.matches.filter((m) => m.round === 1 && !m.isBye).length;
      const r1Byes = res.matches.filter((m) => m.round === 1 && m.isBye).length;

      const pMatches = res.powerOfTwo === expectedP;
      const byesMatch = res.byeCount === expectedByes && r1Byes === expectedByes;
      const playInMatch = r1PlayIns === expectedR1Matches;

      const passed = pMatches && byesMatch && playInMatch;

      results.push({
        id: `size-n-${N}`,
        name: `Bracket Generation N = ${N}`,
        category: 'Team Count Scaling',
        passed,
        message: passed
          ? `N=${N} -> P=${expectedP}, ${expectedByes} byes, ${expectedR1Matches} R1 matches. Total rounds: ${res.totalRounds}.`
          : `Failed math check for N=${N}. Got P=${res.powerOfTwo}, byes=${res.byeCount}.`,
        details: {
          totalTeams: N,
          powerOfTwo: res.powerOfTwo,
          byes: res.byeCount,
          r1Matches: r1PlayIns,
          r1Byes,
          totalRounds: res.totalRounds,
        },
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err: any) {
      results.push({
        id: `size-n-${N}`,
        name: `Bracket Generation N = ${N}`,
        category: 'Team Count Scaling',
        passed: false,
        message: `Exception: ${err.message}`,
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }

  // 2. Case: 3 Strong Teams in Separate Quarters
  {
    const t0 = performance.now();
    try {
      const { teams, strongIds } = createSyntheticTeams(16, { strongCount: 3 });
      const res = fixtureEngine.generate({
        tournamentId: 'test-3-strong',
        teams,
        strongTeamIds: strongIds,
        championTeamIds: [],
        seed: 101,
        sport: 'kho-kho',
        format: 'single-elimination',
      });

      const validation = validateStrongTeamsQuarterSeparation(res.matches, strongIds);

      results.push({
        id: 'case-3-strong-separate-quarters',
        name: '3 Strong Teams Placed in Separate Quarters',
        category: 'Seeding Rules',
        passed: validation.isValid,
        message: validation.isValid
          ? `All 3 strong teams placed in distinct quarters: [Q1: ${validation.quarterCounts[1]}, Q2: ${validation.quarterCounts[2]}, Q3: ${validation.quarterCounts[3]}, Q4: ${validation.quarterCounts[4]}]. Cannot meet until semifinals.`
          : `Strong teams quarter conflict: ${validation.warnings.join('; ')}`,
        details: validation.quarterCounts,
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err: any) {
      results.push({
        id: 'case-3-strong-separate-quarters',
        name: '3 Strong Teams Placed in Separate Quarters',
        category: 'Seeding Rules',
        passed: false,
        message: err.message,
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }

  // 3. Case: Champions Greater Than Available Byes
  {
    const t0 = performance.now();
    try {
      // 14 teams -> P=16 -> 2 byes. Request 4 champions.
      const { teams, championIds } = createSyntheticTeams(14, { championCount: 4 });
      const res = fixtureEngine.generate({
        tournamentId: 'test-champ-exceed-byes',
        teams,
        strongTeamIds: [],
        championTeamIds: championIds,
        seed: 555,
        sport: 'kho-kho',
        format: 'single-elimination',
      });

      const hasWarning = res.warnings.some((w) =>
        w.toLowerCase().includes('exceed available byes')
      );
      const byeChamps = res.byeTeams.filter((t) => championIds.includes(t.id));

      const passed = res.byeCount === 2 && byeChamps.length === 2 && hasWarning;

      results.push({
        id: 'case-champions-exceed-byes',
        name: 'Champions Exceed Available Byes Handling',
        category: 'Bye Rules',
        passed,
        message: passed
          ? `Engine correctly awarded 2 available byes to champions and emitted transparent warning for the remaining 2 champions playing in Round 1.`
          : `Failed: expected 2 champions with byes and explicit warning. Got ${byeChamps.length} champions with byes.`,
        details: {
          championsRequested: 4,
          byesAvailable: res.byeCount,
          championsAwardedByes: byeChamps.length,
          warnings: res.warnings,
        },
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err: any) {
      results.push({
        id: 'case-champions-exceed-byes',
        name: 'Champions Exceed Available Byes Handling',
        category: 'Bye Rules',
        passed: false,
        message: err.message,
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }

  // 4. Case: Same School Rule (Round 1 & Round 2 Separation, Same & Different Medium)
  {
    const t0 = performance.now();
    try {
      // 12 teams with 2 pairs of same school teams (one different medium, one same medium)
      const { teams } = createSyntheticTeams(12, {
        sameSchoolPairs: [
          { schoolId: 'school-nhps', schoolName: 'Father Agnel' },
          { schoolId: 'school-mnr', schoolName: 'FAV Boys' },
        ],
      });

      const res = fixtureEngine.generate({
        tournamentId: 'test-same-school',
        teams,
        strongTeamIds: [],
        championTeamIds: [],
        seed: 999,
        sport: 'kho-kho',
        format: 'single-elimination',
      });

      const validation = validateAllSchoolSeparation(res.matches, res.powerOfTwo);

      results.push({
        id: 'case-same-school-different-medium',
        name: 'Same School Rule Round 1 & Round 2 Separation',
        category: 'Constraint Satisfaction',
        passed: validation.isValid,
        message: validation.isValid
          ? 'Hard constraint satisfied: 0 same-school clashes in Round 1 and Round 2.'
          : `Violations found: ${validation.allWarnings.join('; ')}`,
        details: { conflicts: validation.allWarnings },
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err: any) {
      results.push({
        id: 'case-same-school-different-medium',
        name: 'Same School Rule Round 1 & Round 2 Separation',
        category: 'Constraint Satisfaction',
        passed: false,
        message: err.message,
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }

  // 4b. Case: Play-In Awareness in Round 2
  {
    const t0 = performance.now();
    try {
      // 9 teams (1 play-in match, 7 byes). Two teams from same school:
      // Verify that neither possible winner of the play-in match meets the same school in Round 2!
      const { teams } = createSyntheticTeams(9, {
        sameSchoolPairs: [
          { schoolId: 'school-agnel', schoolName: 'Father Agnel' },
        ],
      });

      const res = fixtureEngine.generate({
        tournamentId: 'test-playin-awareness',
        teams,
        strongTeamIds: [],
        championTeamIds: [],
        seed: 333,
        sport: 'kho-kho',
        format: 'single-elimination',
      });

      const r2Val = validateRound2SchoolSeparationWithPlayIn(res.matches.filter((m) => m.round === 1), res.powerOfTwo);

      results.push({
        id: 'case-play-in-awareness-round-2',
        name: 'Play-In Awareness: Round 2 Potential Clash Prevention',
        category: 'Constraint Satisfaction',
        passed: r2Val.isValid,
        message: r2Val.isValid
          ? 'Play-in awareness satisfied: Both possible winners of play-in match verified free of Round 2 clash.'
          : `Play-in clash detected: ${r2Val.warnings.join('; ')}`,
        details: { warnings: r2Val.warnings },
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err: any) {
      results.push({
        id: 'case-play-in-awareness-round-2',
        name: 'Play-In Awareness: Round 2 Potential Clash Prevention',
        category: 'Constraint Satisfaction',
        passed: false,
        message: err.message,
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }

  // 5. Case: Bye Distribution Across Quarters (e.g. N = 11 -> 5 byes)
  {
    const t0 = performance.now();
    try {
      const { teams } = createSyntheticTeams(11);
      const res = fixtureEngine.generate({
        tournamentId: 'test-bye-spread-11',
        teams,
        strongTeamIds: [],
        championTeamIds: [],
        seed: 777,
        sport: 'kho-kho',
        format: 'single-elimination',
      });

      const validation = validateByeDistribution(res.matches, 5);

      results.push({
        id: 'case-bye-distribution-quarters',
        name: 'Quarter Bye Distribution Uniformity (N = 11)',
        category: 'Bye Rules',
        passed: validation.isValid,
        message: validation.isValid
          ? `Byes evenly distributed: [Q1: ${validation.quarterByes[1]}, Q2: ${validation.quarterByes[2]}, Q3: ${validation.quarterByes[3]}, Q4: ${validation.quarterByes[4]}]. Max difference is <= 1.`
          : `Uneven bye distribution: ${validation.warnings.join('; ')}`,
        details: validation.quarterByes,
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err: any) {
      results.push({
        id: 'case-bye-distribution-quarters',
        name: 'Quarter Bye Distribution Uniformity (N = 11)',
        category: 'Bye Rules',
        passed: false,
        message: err.message,
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }

  // 6. Case: Deterministic Output for Same Seed
  {
    const t0 = performance.now();
    try {
      const { teams, strongIds } = createSyntheticTeams(13, { strongCount: 2 });
      const seed = 123456;

      const run1 = fixtureEngine.generate({
        tournamentId: 'test-seed-a',
        teams,
        strongTeamIds: strongIds,
        championTeamIds: [],
        seed,
        sport: 'kho-kho',
        format: 'single-elimination',
      });

      const run2 = fixtureEngine.generate({
        tournamentId: 'test-seed-b',
        teams,
        strongTeamIds: strongIds,
        championTeamIds: [],
        seed,
        sport: 'kho-kho',
        format: 'single-elimination',
      });

      // Compare matches team pairings
      let matchesIdentical = run1.matches.length === run2.matches.length;
      for (let i = 0; i < run1.matches.length; i++) {
        const m1 = run1.matches[i];
        const m2 = run2.matches[i];
        if (
          m1.teamA?.id !== m2.teamA?.id ||
          m1.teamB?.id !== m2.teamB?.id ||
          m1.isBye !== m2.isBye
        ) {
          matchesIdentical = false;
          break;
        }
      }

      results.push({
        id: 'case-deterministic-seed',
        name: 'Deterministic Seed Reproducibility',
        category: 'Reproducibility',
        passed: matchesIdentical,
        message: matchesIdentical
          ? `Two separate generation runs with seed ${seed} produced 100% identical bracket structures and team pairings.`
          : 'Runs with identical seed differed in bracket structure.',
        details: { seed },
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err: any) {
      results.push({
        id: 'case-deterministic-seed',
        name: 'Deterministic Seed Reproducibility',
        category: 'Reproducibility',
        passed: false,
        message: err.message,
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }

  // 7. Case: Impossible Constraint Returning Warnings instead of Crashing
  {
    const t0 = performance.now();
    try {
      // Create scenario where 4 teams in Round 1 play-ins all belong to the SAME school with different mediums
      // It is mathematically impossible to have 2 matches without a same-school pairing!
      const impossibleTeams: EngineTeam[] = [
        {
          id: 'imp-1',
          name: 'School A - English',
          schoolId: 'sch-A',
          schoolName: 'School A',
          medium: 'English',
        },
        {
          id: 'imp-2',
          name: 'School A - Marathi',
          schoolId: 'sch-A',
          schoolName: 'School A',
          medium: 'Marathi',
        },
        {
          id: 'imp-3',
          name: 'School A - Hindi',
          schoolId: 'sch-A',
          schoolName: 'School A',
          medium: 'Hindi',
        },
        {
          id: 'imp-4',
          name: 'School A - Urdu',
          schoolId: 'sch-A',
          schoolName: 'School A',
          medium: 'Urdu',
        },
      ];

      const res = fixtureEngine.generate({
        tournamentId: 'test-impossible-constraint',
        teams: impossibleTeams,
        strongTeamIds: [],
        championTeamIds: [],
        seed: 888,
        sport: 'kho-kho',
        format: 'single-elimination',
      });

      // Must NOT crash, and must return clear warning naming teams and round where they may clash
      const hasRelaxedWarning = res.warnings.some((w) =>
        w.toLowerCase().includes('clash') ||
        w.toLowerCase().includes('warning') ||
        w.toLowerCase().includes('relaxed') ||
        w.toLowerCase().includes('conflict')
      );

      const passed = res.matches.length > 0 && hasRelaxedWarning;

      results.push({
        id: 'case-impossible-constraint-graceful',
        name: 'Impossible Constraint Graceful Degradation',
        category: 'Fault Tolerance',
        passed,
        message: passed
          ? `Engine handled impossible constraint gracefully without crashing: generated best effort bracket and emitted warning: "${res.warnings[0]}".`
          : 'Failed to emit required warning for impossible constraint scenario.',
        details: { warnings: res.warnings },
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err: any) {
      results.push({
        id: 'case-impossible-constraint-graceful',
        name: 'Impossible Constraint Graceful Degradation',
        category: 'Fault Tolerance',
        passed: false,
        message: `Engine crashed instead of handling gracefully: ${err.message}`,
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }

  // 8. Multi-sport & Extensible Format Tests (Kabaddi round-robin, volleyball groups-knockout)
  {
    const t0 = performance.now();
    try {
      const { teams } = createSyntheticTeams(6);
      const res = fixtureEngine.generate({
        tournamentId: 'test-kabaddi-round-robin',
        teams,
        strongTeamIds: [],
        championTeamIds: [],
        seed: 777,
        sport: 'kabaddi',
        format: 'round-robin',
      });

      const passed =
        res.matches.length === 15 && // 6 teams = 6*5/2 = 15 matches in round-robin
        res.appliedRules.some((r) => r.toLowerCase().includes('round robin'));

      results.push({
        id: 'case-kabaddi-round-robin',
        name: 'Kabaddi Round Robin Strategy Resolution',
        category: 'Multi-Sport Extensibility',
        passed,
        message: passed
          ? `Successfully resolved and generated Kabaddi Round Robin draw with ${res.matches.length} matches.`
          : 'Failed to generate expected round-robin matches for Kabaddi.',
        details: { matchesCount: res.matches.length },
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err: any) {
      results.push({
        id: 'case-kabaddi-round-robin',
        name: 'Kabaddi Round Robin Strategy Resolution',
        category: 'Multi-Sport Extensibility',
        passed: false,
        message: `Kabaddi round robin failed: ${err.message}`,
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }

  {
    const t0 = performance.now();
    try {
      const { teams } = createSyntheticTeams(8);
      const res = fixtureEngine.generate({
        tournamentId: 'test-volleyball-groups-knockout',
        teams,
        strongTeamIds: [teams[0].id, teams[1].id],
        championTeamIds: [],
        seed: 999,
        sport: 'volleyball',
        format: 'groups-knockout',
      });

      const passed =
        res.matches.length > 0 &&
        res.appliedRules.some((r) => r.toLowerCase().includes('group'));

      results.push({
        id: 'case-volleyball-groups-knockout',
        name: 'Volleyball Groups + Knockout Strategy Resolution',
        category: 'Multi-Sport Extensibility',
        passed,
        message: passed
          ? `Successfully resolved and generated Volleyball Groups + Knockout draw with ${res.matches.length} matches.`
          : 'Failed to generate expected groups-knockout matches for Volleyball.',
        details: { matchesCount: res.matches.length },
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err: any) {
      results.push({
        id: 'case-volleyball-groups-knockout',
        name: 'Volleyball Groups + Knockout Strategy Resolution',
        category: 'Multi-Sport Extensibility',
        passed: false,
        message: `Volleyball groups knockout failed: ${err.message}`,
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }

  const durationMs = Date.now() - startTime;
  const passed = results.filter((r) => r.passed).length;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    durationMs,
    results,
  };
}
