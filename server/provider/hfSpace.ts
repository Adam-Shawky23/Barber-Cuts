import { Client } from '@gradio/client';
import { ProviderError, type HairProvider } from './types';

export interface HfSpaceConfig {
  space: string;
  endpoint: string;
  token?: string;
  timeoutMs?: number;
  imageParam?: string; // defaults to IMAGE_PARAM
  connect?: typeof Client.connect;
}

// Name of the image + prompt params on the chosen Space's endpoint (from view_api()).
// Single place to change when switching Spaces.
export const IMAGE_PARAM = 'input_image';
export const PROMPT_PARAM = 'prompt';

const BUSY_RE = /quota|queue|exceeded|too many|busy|sleeping|503|429/i;

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; detail?: unknown };
    return String(o.message ?? o.detail ?? '');
  }
  return String(e ?? '');
}

function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new ProviderError('FAILED', 'Invalid image data');
  const bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
  return new Blob([bytes], { type: m[1] });
}

function firstImageUrl(data: unknown): string | undefined {
  const list = Array.isArray(data) ? data : [data];
  for (const item of list) {
    if (typeof item === 'string' && /^https?:\/\//.test(item)) return item;
    if (item && typeof item === 'object' && typeof (item as { url?: unknown }).url === 'string') {
      return (item as { url: string }).url;
    }
  }
  return undefined;
}

export function createHfSpaceProvider(cfg: HfSpaceConfig): HairProvider {
  const timeoutMs = cfg.timeoutMs ?? 90_000;
  const connect = cfg.connect ?? ((...a: Parameters<typeof Client.connect>) => Client.connect(...a));

  async function run(imageDataUrl: string, prompt: string, signal: AbortSignal): Promise<string> {
    const client = await connect(cfg.space, cfg.token ? { token: cfg.token as `hf_${string}` } : undefined);
    const result = (await client.predict(cfg.endpoint, {
      [cfg.imageParam ?? IMAGE_PARAM]: dataUrlToBlob(imageDataUrl),
      [PROMPT_PARAM]: prompt,
    })) as { data?: unknown };
    const url = firstImageUrl(result?.data);
    if (!url) throw new ProviderError('FAILED', 'No image in model output');
    const res = await fetch(url, { signal });
    if (!res.ok) throw new ProviderError('FAILED', `Fetching result failed (${res.status})`);
    const type = res.headers.get('content-type')?.split(';')[0] || 'image/webp';
    const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    return `data:${type};base64,${b64}`;
  }

  return {
    async edit(imageDataUrl, prompt, signal) {
      const ctl = new AbortController();
      const onAbort = () => ctl.abort();
      signal?.addEventListener('abort', onAbort);
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctl.abort();
          reject(new ProviderError('TIMEOUT', 'Model timed out'));
        }, timeoutMs);
      });
      try {
        return await Promise.race([run(imageDataUrl, prompt, ctl.signal), timeout]);
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        const msg = errorText(e);
        throw new ProviderError(BUSY_RE.test(msg) ? 'BUSY' : 'FAILED', msg);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}
