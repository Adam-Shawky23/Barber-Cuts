import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createApp } from './app';
import { createLimiter } from './rateLimit';
import { createHfSpaceProvider } from './provider/hfSpace';

if (existsSync('.env')) process.loadEnvFile('.env');

const provider = createHfSpaceProvider({
  space: process.env.HF_SPACE || 'black-forest-labs/FLUX.1-Kontext-Dev',
  endpoint: process.env.HF_ENDPOINT || '/infer',
  token: process.env.HF_TOKEN || undefined,
});

const app = createApp({ provider, limiter: createLimiter({ perMinute: 10, maxConcurrent: 2 }) });

const dist = path.resolve('dist');
app.use(express.static(dist));
// SPA fallback (Express 5): final middleware for non-API GET requests.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    // e.g. dist/index.html missing because the client wasn't built: plain 404, no stack.
    if (err && !res.headersSent) res.status(404).type('text/plain').send('Not found');
  });
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
