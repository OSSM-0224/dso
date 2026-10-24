import {
  CreateScoringMatchInput,
  KhoKhoScoreEvent,
  KhoKhoNextAction,
  KhoKhoScoreboard,
  KhoKhoWinnerEvaluation,
  MatchScoringState,
  ScoringRuleError,
  ScoringSport,
} from './types.ts';
import { khoKhoScoringEngine } from './khoKhoStrategy.ts';

export interface ScoringEngine {
  readonly sport: ScoringSport;
  createInitialState(input: CreateScoringMatchInput): MatchScoringState;
  applyEvent(state: MatchScoringState, event: KhoKhoScoreEvent): MatchScoringState;
  validateEvent(state: MatchScoringState, event: KhoKhoScoreEvent): void;
  getScoreboard(state: MatchScoringState, nowMs?: number): KhoKhoScoreboard;
  getNextAction(state: MatchScoringState, nowMs?: number): KhoKhoNextAction;
  getUndoTarget(state: MatchScoringState): KhoKhoScoreEvent | null;
  canUndo(state: MatchScoringState): boolean;
  computeWinner(state: MatchScoringState): KhoKhoWinnerEvaluation;
}

const engines: Record<string, ScoringEngine> = {
  'kho-kho': khoKhoScoringEngine,
};

export function getScoringEngine(sport: ScoringSport): ScoringEngine {
  const engine = engines[sport];
  if (!engine) {
    throw new ScoringRuleError(
      'SPORT_NOT_SUPPORTED',
      `No scoring engine registered for sport "${sport}".`
    );
  }
  return engine;
}

export function listSupportedScoringSports(): ScoringSport[] {
  return Object.keys(engines) as ScoringSport[];
}

export { ScoringRuleError } from './types.ts';
