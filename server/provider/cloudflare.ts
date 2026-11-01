import sharp from 'sharp';
import { errorFromResponse, withTimeout } from './http';
import { ProviderError, type HairProvider } from './types';

export interface CloudflareConfig {
  accountId: string;
  token: string;
  model?: string;
  timeoutMs?: number;
}

// Free Workers AI allowance is 10,000 neurons/day; one look with klein-4b costs roughly 110.
export const CLOUDFLARE_DEFAULT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

// Workers AI FLUX.2 reference images must be smaller than 512x512.
const INPUT_MAX = 511;
const OUTPUT_LONG_SIDE = 1024;

function imageType(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

/** FLUX.2 [klein] on Cloudflare Workers AI (free daily allowance). */
export function createCloudflareProvider(cfg: CloudflareConfig): HairProvider {
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/ai/run/${cfg.model ?? CLOUDFLARE_DEFAULT_MODEL}`;
  return {
    edit(imageDataUrl, prompt, signal) {
      return withTimeout(cfg.timeoutMs ?? 90_000, signal, async (s) => {
        const m = /^data:[^;,]+;base64,(.*)$/s.exec(imageDataUrl);
        if (!m) throw new ProviderError('FAILED', 'Invalid image data');
        const input = sharp(Buffer.from(m[1], 'base64')).rotate();
        const { width = 3, height = 4 } = await input.metadata();
        const small = await input.resize(INPUT_MAX, INPUT_MAX, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();

        // Keep the selfie's shape: long side 1024, both sides multiples of 16.
        const scale = OUTPUT_LONG_SIDE / Math.max(width, height);
        const round16 = (n: number) => Math.max(256, Math.round((n * scale) / 16) * 16);

        const form = new FormData();
        form.append('prompt', prompt);
        form.append('input_image_0', new Blob([small], { type: 'image/jpeg' }), 'selfie.jpg');
        form.append('width', String(round16(width)));
        form.append('height', String(round16(height)));

        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.token}` },
          body: form,
          signal: s,
        });
        if (!res.ok) throw await errorFromResponse(res, 'cloudflare');
        const data = (await res.json()) as { result?: { image?: unknown } };
        const out = data.result?.image;
        if (typeof out !== 'string' || !out) throw new ProviderError('FAILED', 'No image in Cloudflare output');
        return `data:${imageType(out)};base64,${out}`;
      });
    },
  };
}
