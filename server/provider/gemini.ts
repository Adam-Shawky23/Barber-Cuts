import { errorFromResponse, withTimeout } from './http';
import { ProviderError, type HairProvider } from './types';

export interface GeminiConfig {
  key: string;
  model?: string;
  timeoutMs?: number;
}

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash-image';

type Part = { text?: string; inlineData?: { mimeType?: string; data?: string } };

/** Google Gemini image editing (Google AI Studio key). */
export function createGeminiProvider(cfg: GeminiConfig): HairProvider {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model ?? GEMINI_DEFAULT_MODEL}:generateContent`;
  return {
    edit(imageDataUrl, prompt, signal) {
      const m = /^data:([^;,]+);base64,(.*)$/s.exec(imageDataUrl);
      if (!m) return Promise.reject(new ProviderError('FAILED', 'Invalid image data'));
      return withTimeout(cfg.timeoutMs ?? 90_000, signal, async (s) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'x-goog-api-key': cfg.key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: m[1], data: m[2] } }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
          signal: s,
        });
        if (!res.ok) throw await errorFromResponse(res, 'gemini');
        const data = (await res.json()) as { candidates?: { content?: { parts?: Part[] } }[] };
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const img = parts.find((p) => p.inlineData?.data)?.inlineData;
        if (!img?.data) throw new ProviderError('FAILED', 'No image in Gemini output');
        return `data:${img.mimeType || 'image/png'};base64,${img.data}`;
      });
    },
  };
}
