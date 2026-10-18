# Barbershop Hairstyle Try-On Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mobile-first website where a customer in the shop takes a selfie, picks or describes a haircut, and sees an AI-edited photo of themselves with that cut, plus a lookbook of looks tried this visit.

**Architecture:** One package in this folder. A Vite + React + TypeScript client talks only to a small Express server (`POST /api/tryon`). The server builds a "change only the hairstyle" prompt, applies a per-IP limit, and calls a swappable `HairProvider`. The default provider calls a free Hugging Face Space through `@gradio/client`. Images travel as base64 data URLs in JSON, are held only in memory, and are never logged. In production the same Express server serves the built client.

**Tech Stack:** Node 20+, TypeScript, Vite, React 18, Express 4, `@gradio/client`, Vitest, @testing-library/react, supertest, jsdom.

**Spec:** `docs/superpowers/specs/2026-10-18-barbershop-hairstyle-tryon-design.md`

## Global Constraints

- English only. Shop name placeholder: `FRESH CUT` (rendered as `FRESH` + gold `CUT`).
- $0 AI: Hugging Face Space via `@gradio/client`; provider choice through env vars `HF_SPACE`, `HF_ENDPOINT`, `HF_TOKEN` (token optional, server-side only, never sent to the browser, never logged).
- No access code, no login, no database, nothing written to disk, no logging of image data.
- The result view shows **only the generated photo**: never before/after and never the original. The lookbook shows only generated looks.
- Privacy line on the selfie screen, verbatim: `Your photo is sent to an outside AI service to create your look. The shop doesn't save it.`
- Busy copy, verbatim: `The AI is busy right now. Try again in a minute.`
- Waiting copy: `Cutting your {style name lowercased}…` and `Free AI · usually 10–60 seconds.`
- Ready-made styles, in this order: Bald, Rasta / Dreads, Skin fade, Buzz cut, Afro, Mohawk, Braids, Pompadour.
- Theme tokens: bg `#0e0d0c`, panel `#181614`, line `#2c2925`, ink `#f3ede4`, mute `#9a9188`, gold `#d9a441`, red `#c8372d`, cream `#efe6d6`; display font Anton, body Inter (Google Fonts).
- Client downscales photos to longest side 1024 px JPEG (quality 0.9) before upload. Server JSON body limit `8mb`.
- Free-text description: trimmed, max 200 characters.
- Approved visual reference: `.superpowers/brainstorm/75330-1792343200/content/design-v3.html`. Match it.

## Review Focus

1. Camera denied or unavailable (iOS in-app browsers, desktop without a webcam, http): the Upload button must still work and a clear message must replace the preview. Test in Task 7.
2. Hugging Face out of quota, Space asleep, or queue full: the customer sees the busy copy with "Try again", never a raw error. Tests in Tasks 3 and 4.
3. Tapping a style or Go while a generation is running: ignored, so there's no double spend of quota. Tests in Tasks 6 and 8.
4. Odd uploads (huge phone photos, PNG with transparency, non-image file): resized to ≤1024 px JPEG, and non-images rejected with "Please choose a photo." Tests in Tasks 5 and 7.
5. Empty or overlong typed description: Go is disabled when empty and input is capped at 200 chars. The server also rejects bad input with 400. Tests in Tasks 1, 4 and 8.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html, .env.example, README.md
shared/styles.ts          # style catalog (id, name, icon, prompt phrase) — used by client and server
server/prompt.ts          # buildPrompt()
server/rateLimit.ts       # per-key limiter
server/provider/types.ts  # HairProvider interface + ProviderError
server/provider/hfSpace.ts# Hugging Face Space provider
server/app.ts             # createApp(provider, limiter) — Express routes
server/index.ts           # entry: env, provider, listen, serve dist/
scripts/try-model.ts      # manual smoke test against a real Space
src/main.tsx, src/App.tsx, src/theme.css
src/lib/resizeImage.ts    # file/canvas → 1024px JPEG data URL
src/lib/api.ts            # tryOn() client
src/state/session.ts      # reducer + types
src/components/Header.tsx # brand + barber pole + New customer
src/screens/SelfieScreen.tsx
src/screens/StudioScreen.tsx  # pick / waiting / result (same screen)
src/screens/Lookbook.tsx      # grid + favourite + Show my barber
src/screens/ShowBarber.tsx
tests/** mirrors the above
```

---

### Task 1: Scaffold, style catalog, prompt builder

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.env.example`, `shared/styles.ts`, `server/prompt.ts`
- Test: `tests/shared/styles.test.ts`, `tests/server/prompt.test.ts`

**Interfaces:**
- Produces:
  - `type Style = { id: string; name: string; icon: string; phrase: string }`
  - `const STYLES: readonly Style[]` and `function findStyle(id: string): Style | undefined`
  - `const MAX_DESCRIPTION = 200`
  - `function buildPrompt(input: { styleId?: string; description?: string }): { prompt: string; label: string }`, which throws `Error('INVALID_INPUT')` when neither a known styleId nor a non-empty description is given.
- npm scripts: `dev` (vite + `tsx watch server/index.ts` concurrently, Vite proxies `/api` → `http://localhost:8787`), `build` (`vite build`), `start` (`tsx server/index.ts`), `test` (`vitest run`). Vitest environment: `jsdom` for `tests/src/**`, `node` for others (`environmentMatchGlobs`).

- [ ] **Step 1: Scaffold.** `npm init -y`; install deps `react react-dom express @gradio/client` and dev deps `vite @vitejs/plugin-react typescript tsx concurrently vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom supertest @types/express @types/supertest @types/react @types/react-dom`. Set `"type": "module"`. `.env.example` lists `HF_SPACE=`, `HF_ENDPOINT=`, `HF_TOKEN=`, `PORT=8787`.

- [ ] **Step 2: Write failing tests**

```ts
// tests/shared/styles.test.ts
test('catalog order and names', () => {
  expect(STYLES.map(s => s.name)).toEqual(
    ['Bald','Rasta / Dreads','Skin fade','Buzz cut','Afro','Mohawk','Braids','Pompadour']);
  expect(new Set(STYLES.map(s => s.id)).size).toBe(8);
  expect(findStyle('bald')?.name).toBe('Bald');
  expect(findStyle('nope')).toBeUndefined();
});
// tests/server/prompt.test.ts
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
```

- [ ] **Step 3: Run `npx vitest run tests/shared tests/server/prompt.test.ts`.** Expected: FAIL (modules missing).

- [ ] **Step 4: Implement.** Ids are kebab-case of names (`rasta-dreads`, `skin-fade`, …). Icons: ✂️ fade, 🦁 rasta, 🥚 bald, 🌳 afro, ⚡ buzz, 🦅 mohawk, 🪢 braids, 💈 pompadour. Each `phrase` is a concrete visual description (e.g. bald: "a completely shaved, smooth bald head"; rasta: "shoulder-length rasta dreadlocks"). Prompt template, verbatim:
  `Change only the person's hairstyle to {phrase}. Keep the face, skin tone, expression, clothing and background identical.` Description input uses the trimmed, capped text as `{phrase}` and as `label`; a preset uses `style.name` as label. If both are given, styleId wins.

- [ ] **Step 5: Run tests.** Expected: PASS.

- [ ] **Step 6: Commit** `feat: scaffold project with style catalog and prompt builder`.

---

### Task 2: Rate limiter

**Files:** Create `server/rateLimit.ts`; Test `tests/server/rateLimit.test.ts`

**Interfaces:**
- Produces: `function createLimiter(opts: { perMinute: number; now?: () => number }): { tryStart(key: string): boolean; finish(key: string): void }`. `tryStart` returns false if the key already has a request in flight or has started `perMinute` requests in the trailing 60 s. Production uses `perMinute: 5`.

- [ ] **Step 1: Failing tests:** `one in flight per key` (tryStart true, then false until finish; a different key is unaffected); `caps per minute` (with fake `now`, 5 start/finish cycles succeed, the 6th fails, and after `now` advances 60_001 ms it succeeds); `finish on unknown key is a no-op`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** with a `Map<string, {inFlight: boolean; starts: number[]}>`, pruning starts older than 60 s on each call.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: add per-device rate limiter`.

---

### Task 3: Provider interface + Hugging Face Space provider + model pick

**Files:** Create `server/provider/types.ts`, `server/provider/hfSpace.ts`, `scripts/try-model.ts`; Test `tests/server/hfSpace.test.ts`

**Interfaces:**
- Produces:
  - `interface HairProvider { edit(imageDataUrl: string, prompt: string, signal?: AbortSignal): Promise<string /* image data URL */> }`
  - `class ProviderError extends Error { constructor(public code: 'BUSY' | 'FAILED' | 'TIMEOUT', message?: string) }`
  - `function createHfSpaceProvider(cfg: { space: string; endpoint: string; token?: string; timeoutMs?: number /* default 90_000 */; connect?: typeof Client.connect }): HairProvider`

- [ ] **Step 1: Failing tests** (inject a fake `connect`): `returns data URL from first image output` (fake `predict` resolves `{ data: [{ url: 'https://x/img.webp' }] }`, `fetch` stubbed to return image bytes → result starts with `data:image/`); `maps quota/queue errors to BUSY` (errors whose message matches `/quota|queue|exceeded|too many|busy|sleeping|503|429/i` → `ProviderError` code `BUSY`); `other errors → FAILED`; `times out → TIMEOUT` (timeoutMs 10, predict never resolves).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Convert the data URL to a `Blob`; call `client.predict(endpoint, { image/input_image: blob, prompt })`. Read the param names from the chosen Space's `view_api()` and keep that mapping in one place in `hfSpace.ts`. Take the first output that is a URL or `{url}`, fetch it, and return it as a data URL. Never log the image or prompt.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Pick the model (manual).** `scripts/try-model.ts <space> <endpoint> <photo.jpg> "<style phrase>"` runs the provider and writes `out-<space-slug>.jpg` to the scratch dir. Try at least: `black-forest-labs/FLUX.1-Kontext-Dev` and `Qwen/Qwen-Image-Edit` (plus any newer free instruction-edit Space), with bald, rasta and skin fade on 2 real selfies. Pick the one that best keeps the face. Record the choice, endpoint and param names in `.env.example` defaults and the README. If no candidate responds, stop and report back. Don't guess.
- [ ] **Step 6: Commit** `feat: add Hugging Face Space hair provider`.

---

### Task 4: API route

**Files:** Create `server/app.ts`, `server/index.ts`; Test `tests/server/app.test.ts`

**Interfaces:**
- Consumes: `buildPrompt`, `createLimiter`, `HairProvider`, `ProviderError`.
- Produces: `function createApp(deps: { provider: HairProvider; limiter: ReturnType<typeof createLimiter> }): express.Express`.
  - `POST /api/tryon` body `{ image: string; styleId?: string; description?: string }` →
    `200 { image: string; label: string }` |
    `400 { error: 'BAD_REQUEST' }` (image not `data:image/(jpeg|png|webp);base64,`, or buildPrompt throws) |
    `429 { error: 'BUSY' }` (limiter refuses or ProviderError BUSY) |
    `504 { error: 'TIMEOUT' }` | `502 { error: 'FAILED' }`.
  - `GET /api/health` → `200 { ok: true }`.
  - Limiter key: `req.ip` (with `app.set('trust proxy', 1)`), and `finish` is always called in `finally`.
  - `server/index.ts`: reads env, builds the provider, serves `dist/` statically with SPA fallback to `index.html`, listens on `PORT` (default 8787).

- [ ] **Step 1: Failing supertest tests** with a fake provider: happy path returns image + label `Skin fade`; bad image → 400; no style/description → 400; provider BUSY → 429 `BUSY`; provider TIMEOUT → 504; unknown error → 502 `FAILED` and the response body contains no stack or message; second concurrent request from the same IP while the first is pending → 429; body over 8mb → 413.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `createApp` and `server/index.ts`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: add try-on API route`.

---

### Task 5: Client image resize + API client

**Files:** Create `src/lib/resizeImage.ts`, `src/lib/api.ts`; Test `tests/src/lib/api.test.ts`, `tests/src/lib/resizeImage.test.ts`

**Interfaces:**
- Produces:
  - `function fitSize(w: number, h: number, max = 1024): { width: number; height: number }`, a pure helper.
  - `async function resizeImage(source: Blob | HTMLVideoElement): Promise<string>` returns a JPEG data URL at quality 0.9. Draws on a canvas over a solid `#000` fill, so transparency is flattened. Throws `Error('NOT_IMAGE')` for a Blob whose `type` doesn't start with `image/`. A video source is captured mirrored-back to true orientation.
  - `type TryOnError = 'BUSY' | 'TIMEOUT' | 'FAILED' | 'BAD_REQUEST' | 'NETWORK'`
  - `async function tryOn(req: { image: string; styleId?: string; description?: string }): Promise<{ image: string; label: string }>` throws `TryOnFailure` (`class TryOnFailure extends Error { code: TryOnError }`).

- [ ] **Step 1: Failing tests:** `fitSize(4000,3000)` → `{1024,768}`; `fitSize(800,600)` → unchanged; `fitSize(3000,4000)` → `{768,1024}`; `resizeImage(new Blob(['x'],{type:'text/plain'}))` rejects `NOT_IMAGE`; `tryOn` posts JSON to `/api/tryon` and returns the body on 200; 429 → code `BUSY`; 504 → `TIMEOUT`; 413/400 → `BAD_REQUEST`; fetch rejection → `NETWORK`; other → `FAILED`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: add client image resize and API client`.

---

### Task 6: Session state

**Files:** Create `src/state/session.ts`; Test `tests/src/state/session.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Look = { id: string; label: string; image: string; favorite: boolean };
  type Session = {
    selfie: string | null;
    looks: Look[];               // newest last
    currentLookId: string | null;
    pending: { label: string } | null;
    error: TryOnError | null;
    view: 'selfie' | 'studio' | 'lookbook' | 'barber';
  };
  type Action =
    | { type: 'SET_SELFIE'; image: string }      // → view 'studio', keeps existing looks
    | { type: 'RETAKE' }                           // → view 'selfie', keeps looks
    | { type: 'START'; label: string }            // ignored if pending
    | { type: 'SUCCESS'; look: Omit<Look,'favorite'> }
    | { type: 'FAIL'; error: TryOnError }
    | { type: 'SELECT_LOOK'; id: string }
    | { type: 'TOGGLE_FAVORITE'; id: string }     // at most one favourite: starring one unstars others
    | { type: 'GO'; view: Session['view'] }
    | { type: 'NEW_CUSTOMER' };                   // back to initialSession
  const initialSession: Session;
  function sessionReducer(s: Session, a: Action): Session;
  function favoriteLook(s: Session): Look | undefined;
  ```

- [ ] **Step 1: Failing tests:** `START while pending is ignored` (state returned unchanged by reference); `SUCCESS appends look, sets currentLookId, clears pending/error`; `FAIL clears pending, sets error`; `START clears previous error`; `single favourite`; `NEW_CUSTOMER resets everything`; `RETAKE keeps looks`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** (ids via `crypto.randomUUID()` in the caller, not the reducer).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: add session state reducer`.

---

### Task 7: App shell, theme, header, selfie screen

**Files:** Create `src/main.tsx`, `src/App.tsx`, `src/theme.css`, `src/components/Header.tsx`, `src/screens/SelfieScreen.tsx`; Test `tests/src/screens/SelfieScreen.test.tsx`

**Interfaces:**
- Consumes: `resizeImage`, `sessionReducer`.
- Produces: `SelfieScreen({ onSelfie }: { onSelfie(image: string): void })`; `Header({ onNewCustomer, onLookbook, lookCount })`. `App` holds `useReducer(sessionReducer, initialSession)` and switches on `view`.

- [ ] **Step 1: Failing tests:** privacy line text present verbatim; "Upload photo" input (`accept="image/*"`) calls `onSelfie` with a data URL (mock `resizeImage`); when `navigator.mediaDevices.getUserMedia` rejects or is undefined, the text `Camera isn't available. Upload a photo instead.` shows and Upload still works; a non-image upload shows `Please choose a photo.` and does not call `onSelfie`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Use the front camera (`facingMode: 'user'`), a mirrored preview, "Take selfie" captures via `resizeImage(video)`, and stop tracks on unmount/capture. Hint text: `Face the camera, hair visible.` The theme has tokens from Global Constraints, Anton/Inter from Google Fonts, the animated barber pole, and rounded panels per the mockup. Tablet (≥768 px wide): the studio puts the photo left and the styles/controls right. Header shows `FRESH CUT`, the pole, a lookbook button with count, and `New customer`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: add app shell, theme and selfie screen`.

---

### Task 8: Studio screen (pick, waiting, result)

**Files:** Create `src/screens/StudioScreen.tsx`; Modify `src/App.tsx`, `src/theme.css`; Test `tests/src/screens/StudioScreen.test.tsx`

**Interfaces:**
- Consumes: `STYLES`, `MAX_DESCRIPTION`, `tryOn`, `TryOnFailure`, `Session`, `Action`.
- Produces: `StudioScreen({ session, dispatch }: { session: Session; dispatch: React.Dispatch<Action> })`, which owns the `tryOn` call.

- [ ] **Step 1: Failing tests** (mock `tryOn`):
  - Before any look: shows the selfie image (`alt="Your selfie"`).
  - Tapping `Skin fade` dispatches START, shows `Cutting your skin fade…` and `Free AI · usually 10–60 seconds.`, and on resolve shows **only** the new image (`alt="You with Skin fade"`). The selfie `img` is no longer in the document, and the label `SKIN FADE` is shown.
  - While pending, tapping another style or Go does not call `tryOn` a second time.
  - Description input has `maxLength=200`; Go is disabled when the trimmed value is empty; submitting sends `description`.
  - BUSY rejection shows `The AI is busy right now. Try again in a minute.` and a `Try again` button that re-sends the same request. TIMEOUT/FAILED/NETWORK shows `Something went wrong making your look.` with `Try again`.
  - A `Retake selfie` link dispatches RETAKE.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** The waiting overlay sits over the dimmed, desaturated selfie, with a sweeping gold scan line, snipping ✂️, and a progress bar that animates indeterminately. The result image uses the top-to-bottom `reveal` clip-path animation (0.9 s), re-triggered per new look (`key={look.id}`). Style tiles scroll horizontally on phones. Respect `prefers-reduced-motion` by disabling the scan, snip and reveal animations.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: add studio screen with waiting and result states`.

---

### Task 9: Lookbook, Show my barber, New customer

**Files:** Create `src/screens/Lookbook.tsx`, `src/screens/ShowBarber.tsx`; Modify `src/App.tsx`; Test `tests/src/screens/Lookbook.test.tsx`

**Interfaces:**
- Consumes: `Session`, `Action`, `favoriteLook`.
- Produces: `Lookbook({ session, dispatch })`, `ShowBarber({ look, onClose })`.

- [ ] **Step 1: Failing tests:** the grid renders one card per look with its label and **no** selfie; tapping ☆ dispatches TOGGLE_FAVORITE and shows ★; `Show my barber ★ {label}` is disabled with no favourite and opens ShowBarber when present (big image + label in uppercase + `Close`); tapping a card dispatches SELECT_LOOK and GO studio; empty state text `No looks yet. Pick a style to get started.`; Header `New customer` dispatches NEW_CUSTOMER and returns to the selfie screen with zero looks.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: add lookbook, show-barber view and new customer reset`.

---

### Task 10: End-to-end check, build, README

**Files:** Create `README.md`; Modify as needed from findings.

- [ ] **Step 1:** `npm test`. Expected: all suites pass.
- [ ] **Step 2:** `npx tsc --noEmit` and `npm run build`. Expected: no errors, `dist/` produced.
- [ ] **Step 3:** With the real `.env`, `npm run build && npm start` and open `http://localhost:8787` in a phone-sized and a tablet-sized browser window. Verify: camera or upload → studio → Bald produces a real image showing only the new look → Rasta works → lookbook shows both → favourite → Show my barber → New customer clears all. Then check that no image data appears in the server output.
- [ ] **Step 4:** README covers what it is, `npm install`, `.env` (HF_SPACE/HF_ENDPOINT/HF_TOKEN; how to get a free HF token), `npm run dev`, deploying to Render's free web service (build `npm install && npm run build`, start `npm start`, HTTPS required for camera), how to switch to a paid/other Space by changing env, and a note that the free tier may show busy.
- [ ] **Step 5: Commit** `docs: add README and deployment notes`.
