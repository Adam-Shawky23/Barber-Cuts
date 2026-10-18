import { describe, it, expect, vi, afterEach } from 'vitest';
import { tryOn, TryOnFailure } from '../../../src/lib/api';

const req = { image: 'data:image/jpeg;base64,AAA', styleId: 'buzz' };

function mockFetch(status: number, body: unknown = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('tryOn', () => {
  it('posts JSON to /api/tryon and returns the body on 200', async () => {
    const fn = mockFetch(200, { image: 'data:image/png;base64,B', label: 'Buzz cut' });
    await expect(tryOn(req)).resolves.toEqual({ image: 'data:image/png;base64,B', label: 'Buzz cut' });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/tryon');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(req);
  });

  it.each([
    [429, 'BUSY'],
    [504, 'TIMEOUT'],
    [413, 'BAD_REQUEST'],
    [400, 'BAD_REQUEST'],
    [502, 'FAILED'],
    [500, 'FAILED'],
  ])('maps status %i to %s', async (status, code) => {
    mockFetch(status, { error: 'X' });
    const err = await tryOn(req).catch((e) => e);
    expect(err).toBeInstanceOf(TryOnFailure);
    expect(err.code).toBe(code);
  });

  it('maps fetch rejection to NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')));
    const err = await tryOn(req).catch((e) => e);
    expect(err).toBeInstanceOf(TryOnFailure);
    expect(err.code).toBe('NETWORK');
  });
});
