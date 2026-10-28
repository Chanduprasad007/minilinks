# MiniLinks

MiniLinks is a secure URL management product inspired by the Bitly and TinyURL research in `.firecrawl/`. It includes managed redirects, analytics, QR previews, Supabase authentication, workspaces, roles, billing state, audit logs, scoped API keys, rate limiting, destination scanning, phishing reports, and takedown workflows.

For the complete email login, Google OAuth, API, custom-domain, and Render setup, follow [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Run locally

```bash
npm start
```

Open `http://localhost:3000` for the public website and `http://localhost:3000/app` for the product. Without Supabase environment variables, the app uses local JSON storage and an owner demo account.

The unpacked Chrome extension is in [`extension/`](extension/README.md). It connects to the same scoped public API used by other integrations.

## Deploy with GitHub, Supabase, and Render

### 1. Update GitHub

Upload or push every changed file in this repository. In particular, include `server.js`, the entire `minilinks/` folder, `supabase/schema.sql`, `.env.example`, `render.yaml`, and this README.

### 2. Prepare Supabase

1. Open your Supabase project.
2. Open **SQL Editor** and create a new query.
3. Paste all of `supabase/schema.sql` and click **Run**.
4. Open **Authentication > Providers > Email** and enable Email authentication.
5. For easier testing, turn off **Confirm email** temporarily. Turn it back on before public launch.
6. Open **Project Settings > API** and keep the page available for the next step.

The schema does not run `CREATE EXTENSION`, so it avoids the read-only transaction error you saw earlier.

### 3. Configure Render

Open the Render Web Service, then **Environment**, and add:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Exactly `https://YOUR_PROJECT_REF.supabase.co` with no `/rest/v1` suffix |
| `SUPABASE_SECRET_KEY` | Supabase `sb_secret_...` key; server only |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase `sb_publishable_...` key; used for sign-up and sign-in |
| `API_KEY_SECRET` | A long random value; Render can generate this |
| `PUBLIC_BASE_URL` | Your Render URL, for example `https://minilinks.onrender.com` |

Never place the secret key in `minilinks/script.js`, GitHub, screenshots, or browser code. MiniLinks still accepts the legacy `SUPABASE_SERVICE_ROLE_KEY`, but the new `sb_secret_...` key avoids legacy JWT clock and rotation problems.

Click **Save Changes**, then **Manual Deploy > Deploy latest commit**. When deployment completes, open:

```text
https://YOUR-RENDER-SERVICE.onrender.com/health
```

You should see `{"ok":true,"storage":"supabase","auth":"supabase"}`.

### 4. Create the first account

Open the deployed website, choose **Team & billing**, enter your email and password, and choose **Create account**. Then sign in. The current build assigns the first signed-in user the owner product experience; add workspace-specific membership policies before inviting unrelated customers.

### 5. Create and use an API key

Open **API keys**, name the key, select permissions, and choose **Generate API key**. Copy the `ml_live_...` secret immediately because only its hash is stored.

```bash
curl -X POST https://YOUR-DOMAIN.com/v1/links \
  -H "Authorization: Bearer ml_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","alias":"example"}'
```

Public API routes:

```text
GET  /v1/links       requires links:read
POST /v1/links       requires links:write
```

## Security behavior

- Dashboard link creation is limited to 30 requests per IP per minute.
- Public API access is limited to 120 requests per API key per minute.
- API keys are reveal-once and HMAC-hashed at rest.
- Private/local network destinations, blocked domains, embedded credentials, and obvious phishing URL patterns are rejected.
- Every scan and sensitive action is recorded.
- Phishing reports and takedown requests have persistent review queues.
- Redirects marked blocked will not resolve.

## Required before charging customers

This repository now has the product workflows, but three infrastructure integrations still require vendor accounts and secrets:

1. Replace the in-memory rate limiter with Upstash Redis so limits remain consistent across Render restarts and multiple instances.
2. Add Google Web Risk, Cloudflare URL Scanner, or another reputation provider alongside the built-in heuristic scanner. Heuristics alone are not sufficient for a public shortening service.
3. Connect `billing_accounts` to Stripe Checkout, Stripe Customer Portal, and signed Stripe webhooks. The current billing screen and schema track plan state but do not charge cards.

Also add user-scoped Supabase RLS policies before exposing Supabase directly to browsers. The Render backend uses the service-role key and must remain the only code that can access it.
