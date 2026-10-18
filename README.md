# FRESH CUT - hairstyle try-on

Vite + React client, Express server. The server sends the customer's selfie to a free
Hugging Face Space (via `@gradio/client`) and returns only the generated photo.

## Configuration (`.env`, see `.env.example`)

- `HF_SPACE` - default `black-forest-labs/FLUX.1-Kontext-Dev`
- `HF_ENDPOINT` - default `/infer` (params: `input_image`, `prompt`; others have defaults)
- `HF_TOKEN` - optional, server-side only, never logged or sent to the browser

### Model choice

FLUX.1 Kontext Dev was tried anonymously on a public-domain portrait: bald and rasta
kept the face, glasses, clothes and background. `Qwen/Qwen-Image-Edit` (endpoint `/infer`,
param `image`) failed anonymously ("requested GPU duration larger than maximum").
Status: **unverified - test with a real selfie and HF token** (skin fade and a second
portrait could not run because the anonymous ZeroGPU quota ran out).

Manual check: `npx tsx scripts/try-model.ts <space> <endpoint> <photo.jpg> "<style phrase>"`
(`IMAGE_PARAM=image` overrides the image param name; `HF_TOKEN` is read from the env).
