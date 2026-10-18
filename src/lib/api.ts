export type TryOnError = 'BUSY' | 'TIMEOUT' | 'FAILED' | 'BAD_REQUEST' | 'NETWORK';

export class TryOnFailure extends Error {
  code: TryOnError;
  constructor(code: TryOnError) {
    super(code);
    this.name = 'TryOnFailure';
    this.code = code;
  }
}

function codeForStatus(status: number): TryOnError {
  if (status === 429) return 'BUSY';
  if (status === 504) return 'TIMEOUT';
  if (status === 400 || status === 413) return 'BAD_REQUEST';
  return 'FAILED';
}

export async function tryOn(
  req: {
    image: string;
    styleId?: string;
    description?: string;
  },
  signal?: AbortSignal,
): Promise<{ image: string; label: string }> {
  let res: Response;
  try {
    res = await fetch('/api/tryon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
  } catch {
    throw new TryOnFailure('NETWORK');
  }
  if (!res.ok) throw new TryOnFailure(codeForStatus(res.status));
  try {
    return (await res.json()) as { image: string; label: string };
  } catch {
    throw new TryOnFailure('FAILED');
  }
}
