import { createCloudflareProvider } from './cloudflare';
import { createFalProvider } from './fal';
import type { NamedProvider } from './fallback';
import { createGeminiProvider } from './gemini';
import { createHfSpaceProvider } from './hfSpace';

type Env = Record<string, string | undefined>;

/**
 * HF_FALLBACK_SPACES: comma-separated "owner/space|/endpoint|image_param" (endpoint defaults to /infer,
 * image_param to input_image).
 */
export function parseFallbackSpaces(value: string | undefined): { space: string; endpoint: string; imageParam?: string }[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [space, endpoint, imageParam] = entry.split('|').map((s) => s.trim());
      return { space, endpoint: endpoint || '/infer', imageParam: imageParam || undefined };
    });
}

/**
 * Builds the chain: main HF Space, extra HF Spaces, then (when their keys are set) the free Cloudflare
 * allowance, then the paid fal.ai and Gemini.
 */
export function buildChain(env: Env): NamedProvider[] {
  const token = env.HF_TOKEN || undefined;
  const extraSpaces = parseFallbackSpaces(env.HF_FALLBACK_SPACES);
  const hasCloudflare = !!env.CF_ACCOUNT_ID && !!env.CF_API_TOKEN;
  const hasBackups = extraSpaces.length > 0 || hasCloudflare || !!env.FAL_KEY || !!env.GEMINI_API_KEY;
  // With backups, give up on a stuck free queue sooner so the customer isn't left waiting.
  const hfTimeoutMs = Number(env.HF_TIMEOUT_MS) || (hasBackups ? 60_000 : 120_000);

  const space = env.HF_SPACE || 'black-forest-labs/FLUX.1-Kontext-Dev';
  const chain: NamedProvider[] = [
    {
      name: `hf:${space}`,
      provider: createHfSpaceProvider({ space, endpoint: env.HF_ENDPOINT || '/infer', token, timeoutMs: hfTimeoutMs }),
    },
  ];
  for (const s of extraSpaces) {
    chain.push({
      name: `hf:${s.space}`,
      provider: createHfSpaceProvider({ ...s, token, timeoutMs: hfTimeoutMs }),
    });
  }
  if (hasCloudflare) {
    chain.push({
      name: 'cloudflare',
      provider: createCloudflareProvider({
        accountId: env.CF_ACCOUNT_ID!,
        token: env.CF_API_TOKEN!,
        model: env.CF_MODEL || undefined,
      }),
    });
  }
  if (env.FAL_KEY) {
    chain.push({ name: 'fal', provider: createFalProvider({ key: env.FAL_KEY, model: env.FAL_MODEL || undefined }) });
  }
  if (env.GEMINI_API_KEY) {
    chain.push({
      name: 'gemini',
      provider: createGeminiProvider({ key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined }),
    });
  }
  return chain;
}
