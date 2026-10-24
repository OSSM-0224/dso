import { FixtureGenerationInput, FixtureGenerationResult } from '../types.ts';

export interface FixtureStrategy {
  readonly name: string;
  readonly sport: string;
  readonly format: string;

  /**
   * Generates complete tournament fixtures given teams, seeds, and constraints.
   * Framework-free and purely deterministic for a given seed.
   */
  generate(input: FixtureGenerationInput): FixtureGenerationResult;
}
