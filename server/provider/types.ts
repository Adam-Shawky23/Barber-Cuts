export interface HairProvider {
  /** Takes a selfie data URL + edit prompt, returns the edited image as a data URL. */
  edit(imageDataUrl: string, prompt: string, signal?: AbortSignal): Promise<string>;
}

export class ProviderError extends Error {
  constructor(public code: 'BUSY' | 'FAILED' | 'TIMEOUT', message?: string) {
    super(message ?? code);
    this.name = 'ProviderError';
  }
}
