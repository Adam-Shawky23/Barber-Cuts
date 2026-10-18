import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHfSpaceProvider } from '../../server/provider/hfSpace';
import { ProviderError } from '../../server/provider/types';

const IMG = 'data:image/jpeg;base64,/9j/4AAQ';

function fakeConnect(predict: (...a: unknown[]) => Promise<unknown>) {
  return (async () => ({ predict })) as never;
}

afterEach(() => vi.unstubAllGlobals());

describe('createHfSpaceProvider', () => {
  it('returns data URL from first image output', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } })));
    const p = createHfSpaceProvider({
      space: 's/x', endpoint: '/e',
      connect: fakeConnect(async () => ({ data: [{ url: 'https://x/img.webp' }] })),
    });
    expect((await p.edit(IMG, 'prompt')).startsWith('data:image/')).toBe(true);
  });

  it('maps quota/queue errors to BUSY', async () => {
    const p = createHfSpaceProvider({
      space: 's/x', endpoint: '/e',
      connect: fakeConnect(async () => { throw new Error('You have exceeded your GPU quota'); }),
    });
    await expect(p.edit(IMG, 'p')).rejects.toMatchObject({ code: 'BUSY' });
  });

  it('maps other errors to FAILED', async () => {
    const p = createHfSpaceProvider({
      space: 's/x', endpoint: '/e',
      connect: fakeConnect(async () => { throw new Error('kaboom'); }),
    });
    const err = await p.edit(IMG, 'p').catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('FAILED');
  });

  it('times out → TIMEOUT', async () => {
    const p = createHfSpaceProvider({
      space: 's/x', endpoint: '/e', timeoutMs: 10,
      connect: fakeConnect(() => new Promise(() => {})),
    });
    await expect(p.edit(IMG, 'p')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('maps ZeroGPU duration errors to BUSY', async () => {
    const p = createHfSpaceProvider({
      space: 's/x', endpoint: '/e',
      connect: fakeConnect(async () => { throw new Error('The requested GPU duration (240s) is larger than the maximum allowed'); }),
    });
    await expect(p.edit(IMG, 'p')).rejects.toMatchObject({ code: 'BUSY' });
  });

  it('abort mid-predict rejects promptly', async () => {
    const p = createHfSpaceProvider({
      space: 's/x', endpoint: '/e',
      connect: fakeConnect(() => new Promise(() => {})),
    });
    const ctl = new AbortController();
    const pending = p.edit(IMG, 'p', ctl.signal);
    setTimeout(() => ctl.abort(), 5);
    await expect(pending).rejects.toMatchObject({ code: 'FAILED', message: 'ABORTED' });
  });

  it('already-aborted signal rejects', async () => {
    const p = createHfSpaceProvider({
      space: 's/x', endpoint: '/e',
      connect: fakeConnect(() => new Promise(() => {})),
    });
    await expect(p.edit(IMG, 'p', AbortSignal.abort())).rejects.toMatchObject({ message: 'ABORTED' });
  });
  it('closes a client that connects after abort and never calls predict', async () => {
    let finishConnect!: () => void;
    const predict = vi.fn();
    const close = vi.fn();
    const connect = (() => new Promise((r) => { finishConnect = () => r({ predict, close }); })) as never;
    const p = createHfSpaceProvider({ space: 's/x', endpoint: '/e', connect });
    const ctl = new AbortController();
    const pending = p.edit(IMG, 'p', ctl.signal);
    ctl.abort();
    await expect(pending).rejects.toMatchObject({ message: 'ABORTED' });
    finishConnect();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(predict).not.toHaveBeenCalled();
  });

  it('closes a client that connects after the timeout and never calls predict', async () => {
    let finishConnect!: () => void;
    const predict = vi.fn();
    const close = vi.fn();
    const connect = (() => new Promise((r) => { finishConnect = () => r({ predict, close }); })) as never;
    const p = createHfSpaceProvider({ space: 's/x', endpoint: '/e', timeoutMs: 5, connect });
    await expect(p.edit(IMG, 'p')).rejects.toMatchObject({ code: 'TIMEOUT' });
    finishConnect();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(predict).not.toHaveBeenCalled();
  });
});
