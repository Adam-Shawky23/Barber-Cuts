import express from 'express';
import { buildPrompt } from './prompt';
import type { createLimiter } from './rateLimit';
import { ProviderError, type HairProvider } from './provider/types';

const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,/;

export function createApp(deps: { provider: HairProvider; limiter: ReturnType<typeof createLimiter> }): express.Express {
  const { provider, limiter } = deps;
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/tryon', async (req, res) => {
    const body = (req.body ?? {}) as { image?: unknown; styleId?: unknown; description?: unknown };
    if (typeof body.image !== 'string' || !IMAGE_RE.test(body.image)) {
      res.status(400).json({ error: 'BAD_REQUEST' });
      return;
    }
    let built: { prompt: string; label: string };
    try {
      built = buildPrompt({
        styleId: typeof body.styleId === 'string' ? body.styleId : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
      });
    } catch {
      res.status(400).json({ error: 'BAD_REQUEST' });
      return;
    }

    const key = req.ip ?? 'unknown';
    if (!limiter.tryStart(key)) {
      res.status(429).json({ error: 'BUSY' });
      return;
    }

    // Abort the provider call if the client disconnects before we respond.
    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableFinished) controller.abort();
    };
    res.on('close', onClose);

    try {
      const image = await provider.edit(body.image, built.prompt, controller.signal);
      res.json({ image, label: built.label });
    } catch (e) {
      if (e instanceof ProviderError && e.code === 'BUSY') res.status(429).json({ error: 'BUSY' });
      else if (e instanceof ProviderError && e.code === 'TIMEOUT') res.status(504).json({ error: 'TIMEOUT' });
      else res.status(502).json({ error: 'FAILED' });
    } finally {
      res.off('close', onClose);
      limiter.finish(key);
    }
  });

  // JSON error responses (e.g. 413 body too large, malformed JSON) without leaking details.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = (err as { status?: number })?.status;
    if (status === 413) res.status(413).json({ error: 'TOO_LARGE' });
    else if (status && status >= 400 && status < 500) res.status(400).json({ error: 'BAD_REQUEST' });
    else res.status(500).json({ error: 'FAILED' });
  });

  return app;
}
