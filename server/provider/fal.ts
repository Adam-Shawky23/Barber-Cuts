import { errorFromResponse, toDataUrl, withTimeout } from './http';
import { ProviderError, type HairProvider } from './types';

export interface FalConfig {
  key: string;
  model?: string; // fal model id, e.g. fal-ai/flux-pro/kontext
  timeoutMs?: number;
}

export const FAL_DEFAULT_MODEL = 'fal-ai/flux-pro/kontext';

/** FLUX Kontext on fal.ai (paid per image). Same model family as the default Hugging Face Space. */
export function createFalProvider(cfg: FalConfig): HairProvider {
  const url = `https://fal.run/${cfg.model ?? FAL_DEFAULT_MODEL}`;
  return {
    edit(imageDataUrl, prompt, signal) {
      return withTimeout(cfg.timeoutMs ?? 90_000, signal, async (s) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Key ${cfg.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, image_url: imageDataUrl, num_images: 1, output_format: 'jpeg' }),
          signal: s,
        });
        if (!res.ok) throw await errorFromResponse(res, 'fal');
        const data = (await res.json()) as { images?: { url?: unknown }[] };
        const out = data.images?.[0]?.url;
        if (typeof out !== 'string') throw new ProviderError('FAILED', 'No image in fal output');
        return toDataUrl(out, s);
      });
    },
  };
}
