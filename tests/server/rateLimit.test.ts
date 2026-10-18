import { createLimiter } from '../../server/rateLimit';

test('one in flight per key', () => {
  const limiter = createLimiter({ perMinute: 5 });

  // First tryStart should succeed
  expect(limiter.tryStart('key1')).toBe(true);

  // Second tryStart on same key should fail (already in flight)
  expect(limiter.tryStart('key1')).toBe(false);

  // Different key should succeed
  expect(limiter.tryStart('key2')).toBe(true);

  // After finishing key1, tryStart should succeed again
  limiter.finish('key1');
  expect(limiter.tryStart('key1')).toBe(true);

  // key2 still in flight
  expect(limiter.tryStart('key2')).toBe(false);
});

test('caps per minute', () => {
  let now = 0;
  const limiter = createLimiter({ perMinute: 5, now: () => now });

  // 5 start/finish cycles should succeed
  for (let i = 0; i < 5; i++) {
    expect(limiter.tryStart('key')).toBe(true);
    limiter.finish('key');
  }

  // 6th should fail (already at 5 requests in the last 60s)
  expect(limiter.tryStart('key')).toBe(false);

  // After advancing time by 60_001 ms, should succeed
  now += 60_001;
  expect(limiter.tryStart('key')).toBe(true);
});

test('finish on unknown key is a no-op', () => {
  const limiter = createLimiter({ perMinute: 5 });

  // Should not throw
  expect(() => limiter.finish('unknown')).not.toThrow();
});

test('maxConcurrent 2: two in flight allowed, third refused', () => {
  const limiter = createLimiter({ perMinute: 10, maxConcurrent: 2 });
  expect(limiter.tryStart('shop')).toBe(true);
  expect(limiter.tryStart('shop')).toBe(true);
  expect(limiter.tryStart('shop')).toBe(false);
  limiter.finish('shop');
  expect(limiter.tryStart('shop')).toBe(true);
  expect(limiter.tryStart('shop')).toBe(false);
});

test('refused attempts do not count toward the per-minute cap', () => {
  let now = 0;
  const limiter = createLimiter({ perMinute: 2, maxConcurrent: 1, now: () => now });
  expect(limiter.tryStart('k')).toBe(true);
  expect(limiter.tryStart('k')).toBe(false); // refused: in flight
  limiter.finish('k');
  expect(limiter.tryStart('k')).toBe(true);
  limiter.finish('k');
  expect(limiter.tryStart('k')).toBe(false); // 2 starts in window
});

test('idle keys are evicted without breaking counting', () => {
  let now = 0;
  const limiter = createLimiter({ perMinute: 2, now: () => now });
  expect(limiter.size()).toBe(0);

  expect(limiter.tryStart('a')).toBe(true);
  limiter.finish('a');
  // Nothing in flight, but a start is still in the window: kept, still counted.
  expect(limiter.size()).toBe(1);
  expect(limiter.tryStart('a')).toBe(true);
  limiter.finish('a');
  expect(limiter.tryStart('a')).toBe(false);

  // Window passes: the next touch of any key sweeps idle entries.
  now += 60_001;
  expect(limiter.tryStart('b')).toBe(true);
  expect(limiter.size()).toBe(1); // 'a' evicted, only 'b'
  limiter.finish('b');

  // An evicted key starts fresh with a full allowance.
  expect(limiter.tryStart('a')).toBe(true);
  limiter.finish('a');
  expect(limiter.tryStart('a')).toBe(true);
  limiter.finish('a');
  expect(limiter.tryStart('a')).toBe(false);
});

test('finish never drives in-flight count below zero', () => {
  const limiter = createLimiter({ perMinute: 10, maxConcurrent: 1 });
  limiter.finish('k');
  expect(limiter.tryStart('k')).toBe(true);
  limiter.finish('k');
  limiter.finish('k');
  expect(limiter.tryStart('k')).toBe(true);
  expect(limiter.tryStart('k')).toBe(false);
});
