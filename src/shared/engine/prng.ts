/**
 * Deterministic Pseudo-Random Number Generator (Mulberry32).
 * Fast, 32-bit state, high statistical quality, reproducible across environments.
 */

export class PRNG {
  private state: number;

  constructor(seed: number = Date.now()) {
    // Ensure 32-bit unsigned integer
    this.state = seed >>> 0;
  }

  /**
   * Generates a float between 0 (inclusive) and 1 (exclusive).
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates an integer in [min, max] inclusive.
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Fisher-Yates shuffle using deterministic PRNG.
   */
  shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
