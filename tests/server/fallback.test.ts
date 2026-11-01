import { describe, it, expect, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { createCloudflareProvider } from '../../server/provider/cloudflare';
import { createFallbackProvider } from '../../server/provider/fallback';
import { createFalProvider } from '../../server/provider/fal';
import { createGeminiProvider } from '../../server/provider/gemini';
import { buildChain, parseFallbackSpaces } from '../../server/provider/fromEnv';
import { ProviderError, type HairProvider } from '../../server/provider/types';

const IMG = 'data:image/jpeg;base64,/9j/4AAQ';
const OUT = 'data:image/png;base64,BBBB';

const ok = (): HairProvider => ({ edit: vi.fn(async () => OUT) });
const fails = (code: ProviderError['code'], message?: string): HairProvider => ({
  edit: vi.fn(async () => {
    throw new ProviderError(code, message);
  }),
});

afterEach(() => vi.unstubAllGlobals());

describe('createFallbackProvider', () => {
  const quiet = { log: () => {} };

  it('uses the first service when it works', async () => {
    const a = ok();
    const b = ok();
    const p = createFallbackProvider([{ name: 'a', provider: a }, { name: 'b', provider: b }], quiet);
    expect(await p.edit(IMG, 'p')).toBe(OUT);
    expect(b.edit).not.toHaveBeenCalled();
  });

  it('moves on when a service is busy, failed or timed out', async () => {
    for (const code of ['BUSY', 'FAILED', 'TIMEOUT'] as const) {
      const b = ok();
      const p = createFallbackProvider([{ name: 'a', provider: fails(code) }, { name: 'b', provider: b }], quiet);
      expect(await p.edit(IMG, 'p')).toBe(OUT);
      expect(b.edit).toHaveBeenCalledOnce();
    }
  });

  it('skips a busy service until its cooldown ends', async () => {
    let t = 0;
    const a = fails('BUSY');
    const b = ok();
    const p = createFallbackProvider([{ name: 'a', provider: a }, { name: 'b', provider: b }], {
      ...quiet,
      busyCooldownMs: 1000,
      now: () => t,
    });
    await p.edit(IMG, 'p');
    await p.edit(IMG, 'p');
    expect(a.edit).toHaveBeenCalledTimes(1);
    t = 1000;
    await p.edit(IMG, 'p');
    expect(a.edit).toHaveBeenCalledTimes(2);
  });

  it('tries everything when every service is cooling down', async () => {
    const a = fails('BUSY');
    const p = createFallbackProvider([{ name: 'a', provider: a }], { ...quiet, now: () => 0 });
    await expect(p.edit(IMG, 'p')).rejects.toMatchObject({ code: 'BUSY' });
    await expect(p.edit(IMG, 'p')).rejects.toMatchObject({ code: 'BUSY' });
    expect(a.edit).toHaveBeenCalledTimes(2);
  });

  it('reports BUSY if any service was busy, else the last error', async () => {
    const busyThenFailed = createFallbackProvider(
      [{ name: 'a', provider: fails('BUSY') }, { name: 'b', provider: fails('FAILED') }],
      quiet,
    );
    await expect(busyThenFailed.edit(IMG, 'p')).rejects.toMatchObject({ code: 'BUSY' });
    const allFailed = createFallbackProvider(
      [{ name: 'a', provider: fails('FAILED') }, { name: 'b', provider: fails('TIMEOUT') }],
      quiet,
    );
    await expect(allFailed.edit(IMG, 'p')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('stops at an abort instead of trying the next service', async () => {
    const b = ok();
    const p = createFallbackProvider(
      [{ name: 'a', provider: fails('FAILED', 'ABORTED') }, { name: 'b', provider: b }],
      quiet,
    );
    await expect(p.edit(IMG, 'p')).rejects.toMatchObject({ message: 'ABORTED' });
    expect(b.edit).not.toHaveBeenCalled();
  });

  it('logs the switch without image data', async () => {
    const log = vi.fn();
    const p = createFallbackProvider([{ name: 'a', provider: fails('BUSY') }, { name: 'b', provider: ok() }], { log });
    await p.edit(IMG, 'p');
    expect(log).toHaveBeenCalledWith('[tryon] a BUSY, trying b');
  });
});

describe('createFalProvider', () => {
  it('sends the selfie and prompt and returns the image', async () => {
    const fetchMock = vi.fn(async () => Response.json({ images: [{ url: OUT }] }));
    vi.stubGlobal('fetch', fetchMock);
    const p = createFalProvider({ key: 'k' });
    expect(await p.edit(IMG, 'make it bald')).toBe(OUT);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://fal.run/fal-ai/flux-pro/kontext');
    expect((init.headers as Record<string, string>).Authorization).toBe('Key k');
    expect(JSON.parse(init.body as string)).toMatchObject({ prompt: 'make it bald', image_url: IMG });
  });

  it('downloads a result link into a data URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ images: [{ url: 'https://fal.media/x.jpg' }] }))
        .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/jpeg' } })),
    );
    expect(await createFalProvider({ key: 'k' }).edit(IMG, 'p')).toBe('data:image/jpeg;base64,AQI=');
  });

  it('maps rate limits and empty balance to BUSY, other errors to FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('slow down', { status: 429 })));
    await expect(createFalProvider({ key: 'k' }).edit(IMG, 'p')).rejects.toMatchObject({ code: 'BUSY' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('User is locked. Reason: Exhausted balance', { status: 403 })));
    await expect(createFalProvider({ key: 'k' }).edit(IMG, 'p')).rejects.toMatchObject({ code: 'BUSY' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 422 })));
    await expect(createFalProvider({ key: 'k' }).edit(IMG, 'p')).rejects.toMatchObject({ code: 'FAILED' });
  });

  it('times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted'))))),
    );
    await expect(createFalProvider({ key: 'k', timeoutMs: 10 }).edit(IMG, 'p')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('honours the caller abort', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(createFalProvider({ key: 'k' }).edit(IMG, 'p', AbortSignal.abort())).rejects.toMatchObject({
      message: 'ABORTED',
    });
  });
});

describe('createGeminiProvider', () => {
  it('sends the image inline and returns the image part', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: 'BBBB' } }] } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await createGeminiProvider({ key: 'g' }).edit(IMG, 'p')).toBe(OUT);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('gemini-2.5-flash-image:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('g');
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: 'image/jpeg', data: '/9j/4AAQ' });
  });

  it('fails when the reply has no image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: 'no' }] } }] })));
    await expect(createGeminiProvider({ key: 'g' }).edit(IMG, 'p')).rejects.toMatchObject({ code: 'FAILED' });
  });

  it('maps quota errors to BUSY', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429 })));
    await expect(createGeminiProvider({ key: 'g' }).edit(IMG, 'p')).rejects.toMatchObject({ code: 'BUSY' });
  });
});

describe('createCloudflareProvider', () => {
  async function selfie(width: number, height: number) {
    const buf = await sharp({ create: { width, height, channels: 3, background: '#a87' } }).jpeg().toBuffer();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  }

  it('sends a small copy of the selfie and keeps its shape', async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true, result: { image: '/9j/AAAA' } }));
    vi.stubGlobal('fetch', fetchMock);
    const p = createCloudflareProvider({ accountId: 'acc', token: 't' });
    expect(await p.edit(await selfie(768, 1024), 'make it bald')).toBe('data:image/jpeg;base64,/9j/AAAA');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/ai/run/@cf/black-forest-labs/flux-2-klein-4b');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t');
    const form = init.body as FormData;
    expect(form.get('prompt')).toBe('make it bald');
    expect(form.get('width')).toBe('768');
    expect(form.get('height')).toBe('1024');
    const sent = await sharp(Buffer.from(await (form.get('input_image_0') as Blob).arrayBuffer())).metadata();
    expect(Math.max(sent.width!, sent.height!)).toBeLessThan(512);
  });

  it('maps the used-up daily allowance to BUSY', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"errors":[{"message":"you have used up your daily free allocation of 10,000 neurons"}]}', { status: 400 })),
    );
    const p = createCloudflareProvider({ accountId: 'acc', token: 't' });
    await expect(p.edit(await selfie(300, 400), 'p')).rejects.toMatchObject({ code: 'BUSY' });
  });

  it('fails when the reply has no image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true, result: {} })));
    const p = createCloudflareProvider({ accountId: 'acc', token: 't' });
    await expect(p.edit(await selfie(300, 400), 'p')).rejects.toMatchObject({ code: 'FAILED' });
  });
});

describe('buildChain', () => {
  it('is just the main Space by default', () => {
    expect(buildChain({}).map((c) => c.name)).toEqual(['hf:black-forest-labs/FLUX.1-Kontext-Dev']);
  });

  it('adds extra Spaces, Cloudflare, fal and Gemini in order when configured', () => {
    const names = buildChain({
      HF_SPACE: 'me/main',
      HF_FALLBACK_SPACES: 'a/one|/run|image, b/two',
      CF_ACCOUNT_ID: 'acc',
      CF_API_TOKEN: 't',
      FAL_KEY: 'f',
      GEMINI_API_KEY: 'g',
    }).map((c) => c.name);
    expect(names).toEqual(['hf:me/main', 'hf:a/one', 'hf:b/two', 'cloudflare', 'fal', 'gemini']);
  });

  it('needs both Cloudflare settings', () => {
    expect(buildChain({ CF_ACCOUNT_ID: 'acc' }).map((c) => c.name)).not.toContain('cloudflare');
  });

  it('parses Space entries with defaults', () => {
    expect(parseFallbackSpaces('a/one|/run|image, b/two ,')).toEqual([
      { space: 'a/one', endpoint: '/run', imageParam: 'image' },
      { space: 'b/two', endpoint: '/infer', imageParam: undefined },
    ]);
  });
});
