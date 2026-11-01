import { ProviderError } from './types';

// Out of quota, out of credit or overloaded: the customer sees "busy" and the chain tries the next service.
const BUSY_STATUS = new Set([402, 429, 502, 503, 504]);
const BUSY_RE = /quota|exhausted|balance|locked|rate limit|overloaded|unavailable|allocation|neurons/i;

/** Runs fn with a timeout and the caller's abort signal; maps aborts and timeouts to ProviderErrors. */
export async function withTimeout<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (signal?.aborted) throw new ProviderError('FAILED', 'ABORTED');
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    return await fn(combined);
  } catch (e) {
    if (signal?.aborted) throw new ProviderError('FAILED', 'ABORTED');
    if (timeout.aborted) throw new ProviderError('TIMEOUT', 'Model timed out');
    if (e instanceof ProviderError) throw e;
    throw new ProviderError('FAILED', e instanceof Error ? e.message : String(e));
  }
}

/** Turns a non-2xx response into a ProviderError. Only a short excerpt of the body is kept (never image data). */
export async function errorFromResponse(res: Response, service: string): Promise<ProviderError> {
  const body = (await res.text().catch(() => '')).slice(0, 300);
  const busy = BUSY_STATUS.has(res.status) || BUSY_RE.test(body);
  return new ProviderError(busy ? 'BUSY' : 'FAILED', `${service} ${res.status}: ${body}`);
}

/** Returns the image as a data URL, downloading it first when the service gave a link. */
export async function toDataUrl(url: string, signal: AbortSignal): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new ProviderError('FAILED', `Fetching result failed (${res.status})`);
  const type = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
}
