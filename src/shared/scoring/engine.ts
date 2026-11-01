import { ScoringRuleError, ScoringSport } from './types.ts';
import type {
  CreateScoringMatchInput,
  KhoKhoNextAction,
  KhoKhoScoreEvent,
  KhoKhoScoreboard,
  KhoKhoWinnerEvaluation,
  MatchScoringState,
} from './types.ts';
import { khoKhoScoringEngine } from './khoKhoStrategy.ts';
import { sepakTakrawScoringEngine } from './sports/sepakTakraw/engine.ts';
import type {
  CreateSepakTakrawMatchInput,
  SepakTakrawNextAction,
  SepakTakrawScoreEvent,
  SepakTakrawScoreboard,
  SepakTakrawScoringState,
  SepakTakrawWinnerEvaluation,
} from './sports/sepakTakraw/types.ts';

/**
 * Sport-erased engine contract. The service and the client replay resolve an
 * engine by `tournament.sport`, so the registry cannot keep kho-kho state/event
 * types in its signature. Concrete engines stay fully typed; the defaults here
 * are the erased view used across the dynamic registry boundary.
 */
export interface ScoringEngine<
  TState = any,
  TEvent = any,
  TScoreboard = any,
  TNextAction = any,
  TWinner = any,
  TInput = any,
> {
  readonly sport: ScoringSport;
  createInitialState(input: TInput): TState;
  applyEvent(state: TState, event: TEvent): TState;
  validateEvent(state: TState, event: TEvent): void;
  getScoreboard(state: TState, nowMs?: number): TScoreboard;
  getNextAction(state: TState, nowMs?: number): TNextAction;
  getUndoTarget(state: TState): TEvent | null;
  canUndo(state: TState): boolean;
  computeWinner(state: TState): TWinner;
}

const engines: Record<string, ScoringEngine> = {
  'kho-kho': khoKhoScoringEngine,
  'sepak-takraw': sepakTakrawScoringEngine,
};

export function getScoringEngine(sport: 'kho-kho'): ScoringEngine<
  MatchScoringState,
  KhoKhoScoreEvent,
  KhoKhoScoreboard,
  KhoKhoNextAction,
  KhoKhoWinnerEvaluation,
  CreateScoringMatchInput
>;
export function getScoringEngine(sport: 'sepak-takraw'): ScoringEngine<
  SepakTakrawScoringState,
  SepakTakrawScoreEvent,
  SepakTakrawScoreboard,
  SepakTakrawNextAction,
  SepakTakrawWinnerEvaluation,
  CreateSepakTakrawMatchInput
>;
export function getScoringEngine(sport: ScoringSport): ScoringEngine;
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
