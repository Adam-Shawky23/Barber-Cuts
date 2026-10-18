import request from 'supertest';
import { createApp } from '../../server/app';
import { createLimiter } from '../../server/rateLimit';
import { ProviderError, type HairProvider } from '../../server/provider/types';

const IMG = 'data:image/jpeg;base64,AAAA';
const OUT = 'data:image/png;base64,BBBB';

function make(edit: HairProvider['edit'], perMinute = 5) {
  return createApp({ provider: { edit }, limiter: createLimiter({ perMinute }) });
}

test('happy path returns image and label', async () => {
  const edit = vi.fn().mockResolvedValue(OUT);
  const res = await request(make(edit)).post('/api/tryon').send({ image: IMG, styleId: 'skin-fade' });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ image: OUT, label: 'Skin fade' });
  expect(edit.mock.calls[0][0]).toBe(IMG);
  expect(edit.mock.calls[0][1]).toContain('skin fade');
});

test('health', async () => {
  const res = await request(make(vi.fn())).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});

test('bad image -> 400', async () => {
  const res = await request(make(vi.fn())).post('/api/tryon').send({ image: 'http://x/a.jpg', styleId: 'bald' });
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'BAD_REQUEST' });
});

test('no style or description -> 400', async () => {
  const res = await request(make(vi.fn())).post('/api/tryon').send({ image: IMG });
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'BAD_REQUEST' });
});

test('provider BUSY -> 429', async () => {
  const res = await request(make(async () => { throw new ProviderError('BUSY'); }))
    .post('/api/tryon').send({ image: IMG, styleId: 'bald' });
  expect(res.status).toBe(429);
  expect(res.body).toEqual({ error: 'BUSY' });
});

test('provider TIMEOUT -> 504', async () => {
  const res = await request(make(async () => { throw new ProviderError('TIMEOUT'); }))
    .post('/api/tryon').send({ image: IMG, styleId: 'bald' });
  expect(res.status).toBe(504);
  expect(res.body).toEqual({ error: 'TIMEOUT' });
});

test('unknown error -> 502 FAILED with no leaked details', async () => {
  const res = await request(make(async () => { throw new Error('secret stack detail'); }))
    .post('/api/tryon').send({ image: IMG, styleId: 'bald' });
  expect(res.status).toBe(502);
  expect(res.body).toEqual({ error: 'FAILED' });
  expect(res.text).not.toContain('secret');
  expect(res.text).not.toContain('at ');
});

test('second concurrent request from same IP -> 429', async () => {
  let release!: (v: string) => void;
  const edit = vi.fn(() => new Promise<string>((r) => { release = r; }));
  const app = make(edit);
  const first = request(app).post('/api/tryon').send({ image: IMG, styleId: 'bald' }).then((r) => r);
  await vi.waitFor(() => expect(edit).toHaveBeenCalled());
  const second = await request(app).post('/api/tryon').send({ image: IMG, styleId: 'bald' });
  expect(second.status).toBe(429);
  expect(second.body).toEqual({ error: 'BUSY' });
  release(OUT);
  expect((await first).status).toBe(200);
});

test('limiter slot freed after failure', async () => {
  const app = make(async () => { throw new Error('x'); });
  await request(app).post('/api/tryon').send({ image: IMG, styleId: 'bald' });
  const res = await request(app).post('/api/tryon').send({ image: IMG, styleId: 'bald' });
  expect(res.status).toBe(502);
});

test('body over 8mb -> 413', async () => {
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(9 * 1024 * 1024);
  const res = await request(make(vi.fn())).post('/api/tryon').send({ image: big, styleId: 'bald' });
  expect(res.status).toBe(413);
});
