# FRESH CUT - hairstyle try-on

A web app for the shop. A customer takes a selfie (or uploads one), picks a style
(Bald, Rasta / Dreads, Skin fade, Buzz cut, Afro, Mohawk, Braids, Pompadour) or types
their own, and the AI shows them with that haircut. They can save favourites to a
lookbook and show the barber. Nothing is saved: no accounts, no database, photos are not stored.

The AI part is free. It uses a Hugging Face "Space" (a free hosted AI model).

## 1. Run it on your computer

You need [Node.js](https://nodejs.org) (version 20 or newer).

1. Open a terminal in this folder.
2. `npm install`
3. Copy `.env.example` to a new file called `.env` (this holds your settings).
4. `npm run dev`
5. Open the address it prints (usually http://localhost:5173).

To run the finished version instead: `npm run build` then `npm start`, and open
http://localhost:8787.

## 2. Settings (`.env`)

| Setting | What it is |
| --- | --- |
| `HF_SPACE` | Which AI Space to use. Default: `black-forest-labs/FLUX.1-Kontext-Dev` |
| `HF_ENDPOINT` | Which function of that Space to call. Default: `/infer` |
| `HF_TOKEN` | Your free Hugging Face token (optional but recommended) |
| `PORT` | Port for the server. Default 8787 |

The token stays on the server. It is never sent to the browser or written to logs.

### Get a free Hugging Face token

1. Create a free account at https://huggingface.co.
2. Go to Settings, then Access Tokens.
3. Click "Create new token", choose type **Read**, give it any name, and create it.
4. Copy the token into `.env` as `HF_TOKEN=hf_...`

Without a token the free allowance runs out after a couple of tries, and customers will
see "The AI is busy right now. Try again in a minute." With a token you get a larger
daily allowance. Even then the free tier can sometimes be busy; waiting a minute usually fixes it.

## 3. Put it online (Render, free)

Customers need a real web address, and the phone camera only works on **HTTPS**
(a plain `http://` address on your Wi-Fi will not open the camera, though uploading a photo still works).
Render gives you HTTPS automatically.

1. Put this project on GitHub.
2. On https://render.com, choose New, then Web Service, and connect the GitHub repo.
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Plan: Free.
6. Under Environment, add `HF_TOKEN` (and `HF_SPACE` / `HF_ENDPOINT` only if you change them).
7. Deploy, then open the address Render gives you on your phone to test the camera.

The free Render plan goes to sleep when unused, so the first visit can take about a minute to load.

## 4. Switching to a different or paid AI

Change `HF_SPACE` (and `HF_ENDPOINT` if that Space uses a different function name) in `.env`
or in Render's Environment settings, then restart. For a paid or private Space, use a token
from the account that owns or pays for it. No code changes are needed as long as the Space
takes an input image and a text prompt.

### About the model choice

`FLUX.1-Kontext-Dev` was only lightly tested: 1 portrait, 2 styles (bald, rasta), and both kept the
face, glasses, clothes and background well. Skin fade and other portraits were not tested.
To test a model or style yourself:

`npx tsx scripts/try-model.ts <space> <endpoint> <photo.jpg> "<style phrase>"`

(`HF_TOKEN` is read from the environment; `IMAGE_PARAM=image` changes the image field name for Spaces that use it.)

## Developer notes

- `npm test` runs the tests, `npm run build` builds the site into `dist/`.
- Server: `server/`, client: `src/`. Image data is never logged.
