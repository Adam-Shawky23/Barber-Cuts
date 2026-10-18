// Manual model check: tsx scripts/try-model.ts <space> <endpoint> <photo.jpg> "<style phrase>"
// Writes out-<space-slug>.jpg next to the photo. Reads HF_TOKEN from env if set.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHfSpaceProvider } from '../server/provider/hfSpace';
import { buildPrompt } from '../server/prompt';

const [space, endpoint, photo, phrase] = process.argv.slice(2);
if (!space || !endpoint || !photo || !phrase) {
  console.error('usage: tsx scripts/try-model.ts <space> <endpoint> <photo.jpg> "<style phrase>"');
  process.exit(1);
}
const dataUrl = `data:image/jpeg;base64,${readFileSync(photo).toString('base64')}`;
const provider = createHfSpaceProvider({ space, endpoint, token: process.env.HF_TOKEN, imageParam: process.env.IMAGE_PARAM, timeoutMs: 150_000 });
const t0 = Date.now();
try {
  const out = await provider.edit(dataUrl, buildPrompt({ description: phrase }).prompt);
  const slug = space.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const file = join(dirname(photo), `out-${slug}.jpg`);
  writeFileSync(file, Buffer.from(out.split(',')[1], 'base64'));
  console.log(`ok ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${file}`);
} catch (e) {
  console.error('failed:', (e as { code?: string }).code, (e as Error).message);
  process.exit(2);
}
