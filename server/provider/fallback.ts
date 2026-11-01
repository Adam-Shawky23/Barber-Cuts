import { ProviderError, type HairProvider } from './types';

export interface NamedProvider {
  name: string;
  provider: HairProvider;
}

export interface FallbackOptions {
  /** How long to skip a service after it says busy / out of quota. */
  busyCooldownMs?: number;
  now?: () => number;
  log?: (msg: string) => void;
}

/**
 * Tries each service in order until one makes the look. A service that says busy (free quota used up,
 * out of credit, overloaded) is skipped for a while so later customers go straight to the next one.
 */
export function createFallbackProvider(chain: NamedProvider[], opts: FallbackOptions = {}): HairProvider {
  const cooldownMs = opts.busyCooldownMs ?? 5 * 60_000;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((msg: string) => console.warn(msg));
  const busyUntil = new Map<string, number>();

  return {
    async edit(imageDataUrl, prompt, signal) {
      const ready = chain.filter((c) => (busyUntil.get(c.name) ?? 0) <= now());
      // Everything cooling down: try them all anyway rather than refusing outright.
      const order = ready.length > 0 ? ready : chain;
      let sawBusy = false;
      let lastError: ProviderError = new ProviderError('FAILED', 'No AI service configured');

      for (const [i, { name, provider }] of order.entries()) {
        try {
          const image = await provider.edit(imageDataUrl, prompt, signal);
          busyUntil.delete(name);
          return image;
        } catch (e) {
          const err = e instanceof ProviderError ? e : new ProviderError('FAILED', String(e));
          if (signal?.aborted || err.message === 'ABORTED') throw err;
          if (err.code === 'BUSY') {
            sawBusy = true;
            busyUntil.set(name, now() + cooldownMs);
          }
          lastError = err;
          const next = order[i + 1];
          if (next) log(`[tryon] ${name} ${err.code}, trying ${next.name}`);
        }
      }
      throw sawBusy ? new ProviderError('BUSY', lastError.message) : lastError;
    },
  };
}
