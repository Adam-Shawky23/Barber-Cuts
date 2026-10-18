import { buildPrompt } from '../../server/prompt';

test('preset wraps phrase in hair-only instruction', () => {
  const r = buildPrompt({ styleId: 'skin-fade' });
  expect(r.label).toBe('Skin fade');
  expect(r.prompt).toMatch(/^Change only the person's hairstyle to /);
  expect(r.prompt).toContain('Keep the face, skin tone, expression, clothing and background identical.');
});
test('description is trimmed, capped and labelled', () => {
  const r = buildPrompt({ description: '  low taper, curls  ' });
  expect(r.label).toBe('low taper, curls');
  expect(r.prompt).toContain('low taper, curls');
  expect(buildPrompt({ description: 'x'.repeat(500) }).label).toHaveLength(200);
});
test('rejects empty input', () => {
  expect(() => buildPrompt({})).toThrow('INVALID_INPUT');
  expect(() => buildPrompt({ description: '   ' })).toThrow('INVALID_INPUT');
  expect(() => buildPrompt({ styleId: 'nope' })).toThrow('INVALID_INPUT');
});
