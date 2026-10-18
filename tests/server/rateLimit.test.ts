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
