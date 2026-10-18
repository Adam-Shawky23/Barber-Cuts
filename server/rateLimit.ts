export function createLimiter(opts: { perMinute: number; now?: () => number }): {
  tryStart(key: string): boolean;
  finish(key: string): void;
} {
  const getNow = opts.now ?? (() => Date.now());
  const perMinute = opts.perMinute;
  const state = new Map<string, { inFlight: boolean; starts: number[] }>();

  function pruneOldStarts(starts: number[], currentTime: number): number[] {
    const cutoffTime = currentTime - 60_000;
    return starts.filter((startTime) => startTime > cutoffTime);
  }

  return {
    tryStart(key: string): boolean {
      const now = getNow();
      let entry = state.get(key);

      // Initialize if not exists
      if (!entry) {
        entry = { inFlight: false, starts: [] };
        state.set(key, entry);
      }

      // Prune old starts
      entry.starts = pruneOldStarts(entry.starts, now);

      // Check if already in flight
      if (entry.inFlight) {
        return false;
      }

      // Check if at or over the per-minute limit
      if (entry.starts.length >= perMinute) {
        return false;
      }

      // Mark as in flight and record the start time
      entry.inFlight = true;
      entry.starts.push(now);
      return true;
    },

    finish(key: string): void {
      const entry = state.get(key);
      if (entry) {
        entry.inFlight = false;
      }
    },
  };
}
