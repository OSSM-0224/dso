import { FixtureStrategy } from './strategies/fixtureStrategy.ts';
import { SingleEliminationStrategy } from './strategies/singleEliminationStrategy.ts';
import { RoundRobinStrategy } from './strategies/roundRobinStrategy.ts';
import { GroupsKnockoutStrategy } from './strategies/groupsKnockoutStrategy.ts';
import { FixtureGenerationInput, FixtureGenerationResult } from './types.ts';

export class FixtureEngineRegistry {
  private static instance: FixtureEngineRegistry;
  private strategies = new Map<string, FixtureStrategy>();

  private constructor() {
    // Register Single Elimination strategies across sports
    const singleElimination = new SingleEliminationStrategy();
    this.register(singleElimination);
    this.registerCustom('kho-kho', 'single-elimination', singleElimination);
    this.registerCustom('kabaddi', 'single-elimination', singleElimination);
    this.registerCustom('volleyball', 'single-elimination', singleElimination);
    this.registerCustom('*', 'single-elimination', singleElimination);
    this.registerCustom('*', 'knockout', singleElimination);

    // Register Round Robin strategies across sports
    const roundRobin = new RoundRobinStrategy();
    this.register(roundRobin);
    this.registerCustom('kho-kho', 'round-robin', roundRobin);
    this.registerCustom('kabaddi', 'round-robin', roundRobin);
    this.registerCustom('volleyball', 'round-robin', roundRobin);
    this.registerCustom('*', 'round-robin', roundRobin);
    this.registerCustom('*', 'league', roundRobin);

    // Register Groups + Knockout strategies across sports
    const groupsKnockout = new GroupsKnockoutStrategy();
    this.register(groupsKnockout);
    this.registerCustom('kho-kho', 'groups-knockout', groupsKnockout);
    this.registerCustom('kabaddi', 'groups-knockout', groupsKnockout);
    this.registerCustom('volleyball', 'groups-knockout', groupsKnockout);
    this.registerCustom('*', 'groups-knockout', groupsKnockout);
    this.registerCustom('*', 'groups', groupsKnockout);
  }

  static getInstance(): FixtureEngineRegistry {
    if (!FixtureEngineRegistry.instance) {
      FixtureEngineRegistry.instance = new FixtureEngineRegistry();
    }
    return FixtureEngineRegistry.instance;
  }

  register(strategy: FixtureStrategy): void {
    const key = this.getKey(strategy.sport, strategy.format);
    this.strategies.set(key, strategy);
  }

  registerCustom(sport: string, format: string, strategy: FixtureStrategy): void {
    const key = this.getKey(sport, format);
    this.strategies.set(key, strategy);
  }

  getStrategy(sport: string, format: string): FixtureStrategy | undefined {
    const normalizedSport = (sport || '').toLowerCase().trim();
    const rawFormat = (format || '').toLowerCase().trim();
    const cleanFormat = rawFormat.replace(/[_\s]+/g, '-');

    // 1. Direct match: sport:format
    const directKey = this.getKey(normalizedSport, cleanFormat);
    if (this.strategies.has(directKey)) {
      return this.strategies.get(directKey);
    }

    // 2. Format match with wildcard sport: *:format
    const wildcardKey = this.getKey('*', cleanFormat);
    if (this.strategies.has(wildcardKey)) {
      return this.strategies.get(wildcardKey);
    }

    // 3. Normalized format aliases
    if (
      cleanFormat === 'round-robin' ||
      cleanFormat === 'roundrobin' ||
      cleanFormat === 'league' ||
      cleanFormat.includes('round-robin') ||
      cleanFormat.includes('league')
    ) {
      return this.strategies.get('*:round-robin') || this.strategies.get('round-robin');
    }

    if (
      cleanFormat === 'groups-knockout' ||
      cleanFormat === 'groupsknockout' ||
      cleanFormat === 'groups' ||
      cleanFormat.includes('group')
    ) {
      return this.strategies.get('*:groups-knockout') || this.strategies.get('groups-knockout');
    }

    if (
      cleanFormat === 'single-elimination' ||
      cleanFormat === 'singleelimination' ||
      cleanFormat === 'knockout' ||
      cleanFormat.includes('elimination') ||
      cleanFormat.includes('knockout')
    ) {
      return (
        this.strategies.get('kho-kho:single-elimination') ||
        this.strategies.get('*:single-elimination')
      );
    }

    // 4. Default fallback: single elimination
    return (
      this.strategies.get('*:single-elimination') ||
      this.strategies.get('kho-kho:single-elimination')
    );
  }

  listSupported(): Array<{ sport: string; format: string; name: string }> {
    return Array.from(this.strategies.entries()).map(([key, s]) => {
      const [sport, format] = key.split(':');
      return {
        sport,
        format,
        name: s.name,
      };
    });
  }

  generate(input: FixtureGenerationInput): FixtureGenerationResult {
    const strategy = this.getStrategy(input.sport, input.format);
    if (!strategy) {
      throw new Error(
        `No fixture strategy registered for sport="${input.sport}", format="${input.format}". Available formats: ${this.listSupported().map((s) => `${s.sport}/${s.format}`).join(', ')}`
      );
    }
    return strategy.generate(input);
  }

  private getKey(sport: string, format: string): string {
    return `${sport.toLowerCase()}:${format.toLowerCase()}`;
  }
}

export const fixtureEngine = FixtureEngineRegistry.getInstance();
