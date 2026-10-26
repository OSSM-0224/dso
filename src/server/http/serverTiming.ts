import 'server-only';

interface TimingEntry {
  name: string;
  durationMs: number;
  description?: string;
}

const clock = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

/** Small helper for the Server-Timing response header. */
export class ServerTiming {
  private readonly startedAt = clock();
  private readonly entries: TimingEntry[] = [];

  now(): number {
    return clock();
  }

  measure(name: string, startedAt: number, description?: string): number {
    const durationMs = Math.max(0, clock() - startedAt);
    this.entries.push({ name, durationMs, description });
    return durationMs;
  }

  header(): string {
    const parts = this.entries.map((entry) => {
      const duration = entry.durationMs.toFixed(1);
      return entry.description
        ? `${entry.name};dur=${duration};desc="${entry.description.replace(/"/g, "'")}"`
        : `${entry.name};dur=${duration}`;
    });
    parts.push(`total;dur=${Math.max(0, clock() - this.startedAt).toFixed(1)}`);
    return parts.join(', ');
  }
}
