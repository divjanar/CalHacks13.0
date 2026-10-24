# Existing Table 8 deployment

Keep the current menu reader and food page unchanged when updating hosting.

- Frontend: Vercel, `https://table8.vip` and `https://cal-hacks13-0-8miz.vercel.app`.
- Backend: Render, `https://table8-api.onrender.com`.
- Repository: `divjanar/CalHacks13.0`, branch `main`.

## Vercel

Use the repository root, Vite framework, `npm run build`, and output `dist`.
The app uses hash navigation, so no route rewrite is necessary.

Set `VITE_API_URL=https://table8-api.onrender.com` in the deployment environment.
Keep `VITE_CONVEX_URL` and `VITE_CLERK_PUBLISHABLE_KEY` consistent with the
existing account setup. Keep the map-provider browser variables and restrict
their allowed origins to the deployed domain and local development as needed.
Never put Gemini keys or the age-check callback secret in Vercel's VITE variables.
Vite variables are embedded at build time; changing them requires redeployment.

Both existing frontend URLs were verified to serve the same app. The frontend
already points to the Render URL. Keep the domain attached to the existing
Vercel project; do not create another site or replace DNS records unnecessarily.

## Render

Use the existing service and Docker runtime, repository root as build context,
and `Dockerfile.backend` as its Dockerfile. This installs the backend dependencies
and Chromium, and copies the venue and dietary data required by the current app.
Health-check path: `/api/health`. The service uses Render's `PORT` and binds to
`0.0.0.0`. Local development still defaults to port 3001.

Keep `GEMINI_API_KEY`, `GEMINI_MODEL`, and optional `GEMINI_MENU_MODEL` on Render.
Do not change the model IDs as part of hosting setup. Keep `CONVEX_URL`,
`CONVEX_SITE_URL`, and `AGE_CHECK_CALLBACK_SECRET` matched to the existing Convex
deployment. The callback secret must match the value in Convex.

Allowed frontend origins include the existing domain, www domain, Vercel URL,
and localhost ports 5173/5174. Extra origins can be specified with the
comma-separated `ALLOWED_ORIGINS` variable. Arbitrary Vercel previews are not
automatically allowed.

`/api/health` includes Render's Git revision when `RENDER_GIT_COMMIT` is present,
so deployment completion can be checked without starting a Gemini job.
Background menu jobs are held in one backend process. A restart expires active
job IDs; refresh/retry reconnects. Do not scale this implementation to multiple
instances without shared job storage. A sleeping service can take time to wake.

## Authentication and verification

The inspected hosted frontend currently uses Clerk development keys. This
preserves the existing users and account behavior but is not a completed Clerk
production-instance migration. Moving to Clerk production requires configuring
its domain/DNS, production keys, and matching Convex JWT issuer together. Do not
switch just one of those settings or users may lose access to their existing data.

Build and unauthenticated health/CORS checks do not prove a successful sign-in,
document check, reservation, or live Gemini assessment. Check those signed-in
flows with an account after deployment. Do not reuse or upload identity documents
automatically as a deployment test.
