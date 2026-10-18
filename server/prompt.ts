import { MAX_DESCRIPTION, findStyle } from '../shared/styles';

export function buildPrompt(input: { styleId?: string; description?: string }): { prompt: string; label: string } {
  const style = input.styleId ? findStyle(input.styleId) : undefined;
  const text = input.description?.trim().slice(0, MAX_DESCRIPTION).trim();
  const phrase = style?.phrase ?? text;
  if (!phrase) throw new Error('INVALID_INPUT');
  const label = style?.name ?? phrase;
  return {
    prompt: `Change only the person's hairstyle to ${phrase}. Keep the face, skin tone, expression, clothing and background identical.`,
    label,
  };
}
