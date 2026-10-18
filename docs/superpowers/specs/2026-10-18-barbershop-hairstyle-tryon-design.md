# Barbershop Hairstyle Try-On — Design

Date: 2026-10-18
Status: Ready for owner approval

## Intent

A barbershop owner wants customers **in the shop** to see themselves with a new haircut before committing to it. The customer takes a selfie, picks a ready-made style or types what they want ("low taper with curls on top"), and an AI edits their photo to show that cut. The point is to settle "what cut do you want?" visually instead of by description, and to make the visit a bit more fun.

## Who and where

- Used **in the barbershop**, by the customer themselves.
- Runs on **either** the customer's own phone (e.g. scanning a QR code at the shop) **or** a tablet the shop keeps at the station. Both must work well.
- Low volume for now: the owner said "not much."

## Goals

1. Customer can take a selfie with the device camera, or upload an existing photo.
2. Customer can pick a ready-made style with one tap, **or** type a free-text description.
3. The app shows the customer with that haircut, using an AI image-editing model.
4. Trying another style is one tap away from the result.
5. A "lookbook" collects every cut tried this visit; the customer can star a favourite and show it to the barber full screen.

## Non-goals

- Booking, payments, accounts, logins, customer history across visits.
- Sharing to social media, downloading, emailing results.
- A native iOS/Android app. It is a website; nothing to install.
- Admin panel for editing the style list (styles are defined in code for now).

## Anti-goals (would be a failure even if it "works")

- The result screen showing a before/after comparison. **The owner explicitly wants the result to show only the new photo.** (The lookbook also shows only generated looks, not the original.)
- The person's face/identity changing noticeably. It must still clearly be *them* with a different haircut.
- Customer photos being stored, logged, or kept after the visit.
- A dead/blank screen during the slow AI wait.

## Decided with the owner

- **Platform:** a mobile-first website that works on phones and tablets.
- **AI provider:** **$0 for now**, on Hugging Face. The owner accepts that free can be slow (10–60 s) and will sometimes show "busy, try again." If that gets annoying they'll move to the ~$9/month Hugging Face PRO plan. So the app must be built to switch providers or models later through config or one small provider module, without rewriting the app.
- **Public demo apps (Spaces) are allowed** for the AI step, since that's what keeps it free. In exchange, the selfie screen tells customers plainly that their photo is sent to an outside AI service to generate the look and isn't saved by the shop.
- **No access code or login.** Anyone who opens the link goes straight to the selfie. The owner accepts that outsiders could use some of the free quota.
- **Language:** English only.
- **Ready-made styles:** bald, rasta/dreads, plus others. Accepted starting list: Bald, Rasta / Dreads, Skin fade, Buzz cut, Afro, Mohawk, Braids, Pompadour.
- **Flow and look:** approved mockup (`.superpowers/brainstorm/.../content/design-v3.html`), described below.

## Screens (approved direction)

Visual style: dark barbershop feel. Near-black background, warm gold accent (`#d9a441`-ish), cream text, bold condensed display font (Anton-like) for headings, clean sans for body, small animated barber pole in the header. Mobile-first; on a tablet the layout should use the extra space sensibly (e.g. larger photo, styles beside it) rather than a stretched phone.

1. **Selfie.** Camera preview with a "Take selfie" button and an "Upload photo" fallback. Short hint: face the camera, hair visible. Allow retake. A short, visible privacy line: "Your photo is sent to an outside AI service to create your look. The shop doesn't save it." 
2. **Pick a cut / Result (same screen).** Big photo area on top. Below it: a horizontal row of style tiles (icon + name) and a text box "Or describe it…" with a Go button. Before the first generation, the photo area shows the selfie. After a generation, **it shows only the new photo**, full size, with the style name in large lettering over a dark gradient at the bottom. The new image sweeps in top-to-bottom when it arrives. Tapping another style starts a new generation.
3. **Waiting state.** Over the (dimmed, desaturated) selfie: a gold scan line sweeping down, animated scissors, and a message naming the style ("Cutting your dreads…"), plus a progress bar and "Free AI · usually 10–60 seconds." The customer can't start a second generation while one is running.
4. **Lookbook.** Grid of every generated look this visit, each labelled with its style. Tap a star to mark a favourite. A "Show my barber" button opens the favourite full screen (big image + style name), easy to hand over.

Errors (rate limit, model down, no face found, timeout) show a friendly message on the same screen with "Try again", never a raw error.

## Constraints

- The Hugging Face access token must **never** reach the browser. A small server-side endpoint holds the token and calls Hugging Face; the browser talks only to that endpoint.
- Photos are held in memory only for the request; nothing written to disk, no logging of image data. The lookbook lives only in the browser tab (cleared on close or a "New customer" reset).
- Camera access requires HTTPS (or localhost) — the deployed site must be served over HTTPS.
- Images should be downscaled client-side (e.g. longest side ~1024 px) before upload to keep things fast.

## Builder's call (Claude's defaults, not discussed with owner)

- **Stack:** Vite + React + TypeScript for the front end; a tiny Node server (or serverless function) as the Hugging Face proxy. Chosen because the owner's other project next to this folder already uses Vite.
- **Repo:** this folder becomes its own git repository, separate from the parent Airbnb clone repo. `.superpowers/` is gitignored.
- **Model:** an instruction-based image-editing model available free on Hugging Face (e.g. a FLUX Kontext or Qwen Image Edit style model, via a public Space using the Gradio client or via Inference Providers free credits). The builder should test 2–3 candidates on real selfies and pick the one that best keeps the face while changing hair. Prompts for each ready-made style are written in code and tuned for that model, e.g. "Change only the hairstyle to a clean skin fade. Keep the face, skin tone, expression, clothing and background identical."
- **Free-text input** is wrapped in the same "change only the hairstyle…" instruction so customers can't turn it into a general image editor.
- **Shop name/branding:** placeholder "FRESH CUT" until the owner provides a name.
- **Busy / quota handling:** when Hugging Face is busy or out of free quota, show "The AI is busy right now. Try again in a minute" with a retry button. A simple per-device limit on the server (e.g. one generation at a time, a few per minute) keeps one person from using up the shared quota. No database.
- **Free-text box kept.** The owner said "customers don't type anything" when turning down an access code; Claude read that as being about the code, not the style description box from the original request. **Owner to confirm.**
- **"New customer" button** on the lookbook/header to wipe the session on a shared tablet.
- **Where it's hosted** (e.g. Vercel/Netlify/Render free tier) — any free HTTPS host that supports the small server endpoint.
