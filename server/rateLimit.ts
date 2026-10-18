const WINDOW_MS = 60_000;

/**
 * Per-key limiter: at most `maxConcurrent` requests in flight and `perMinute` starts
 * in any rolling 60 s window. Keys with nothing in flight and no starts in the window
 * are evicted so the map does not grow with every visitor.
 */
export function createLimiter(opts: { perMinute: number; maxConcurrent?: number; now?: () => number }): {
  tryStart(key: string): boolean;
  finish(key: string): void;
  /** Number of tracked keys (for tests). */
  size(): number;
} {
  const getNow = opts.now ?? (() => Date.now());
  const { perMinute, maxConcurrent = 1 } = opts;
  const state = new Map<string, { inFlight: number; starts: number[] }>();

  function prune(entry: { starts: number[] }, now: number): void {
    const cutoff = now - WINDOW_MS;
    entry.starts = entry.starts.filter((t) => t > cutoff);
  }

  function evictIdle(now: number): void {
    for (const [key, entry] of state) {
      prune(entry, now);
      if (entry.inFlight === 0 && entry.starts.length === 0) state.delete(key);
    }
  }

  return {
    tryStart(key: string): boolean {
      const now = getNow();
      evictIdle(now);

      let entry = state.get(key);
      if (!entry) {
        entry = { inFlight: 0, starts: [] };
        state.set(key, entry);
      }

      if (entry.inFlight >= maxConcurrent || entry.starts.length >= perMinute) return false;

      entry.inFlight += 1;
      entry.starts.push(now);
      return true;
    },

    finish(key: string): void {
      const entry = state.get(key);
      if (entry && entry.inFlight > 0) entry.inFlight -= 1;
    },

    size(): number {
      return state.size;
    },
  };
}
