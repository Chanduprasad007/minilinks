# Deploy MiniLinks with Supabase Auth, Google, and Render

This guide uses the existing Render service at `https://minilinks.onrender.com`. Complete the steps in order.

## 1. Upload the latest project to GitHub

Replace the repository files with the current files from this folder. The most important changed files are:

- `server.js`
- `minilinks/home.html`
- `minilinks/home.css`
- `minilinks/index.html`
- `minilinks/styles.css`
- `minilinks/script.js`
- `minilinks/openapi.json`
- `supabase/schema.sql`
- `render.yaml`

Render must deploy the commit containing these files before Google login will appear.

## 2. Prepare Supabase

1. Open the Supabase project.
2. Open **SQL Editor**, paste the complete `supabase/schema.sql`, and click **Run**.
3. Open **Authentication > Providers > Email** and leave Email enabled.
4. Decide whether users must confirm their email. Confirmation is recommended for production.
5. Open **Authentication > URL Configuration**.
6. Set **Site URL** to `https://minilinks.onrender.com`.
7. Add `https://minilinks.onrender.com` to **Redirect URLs**.

When you add a custom domain later, add that HTTPS URL to the redirect list before changing the Site URL.

## 3. Enable Google login

1. Open the Google Cloud Console and select or create a project.
2. Open **Google Auth Platform > Branding** and configure the app name, support email, and contact email.
3. Open **Google Auth Platform > Audience**. During testing, add your own Google account as a test user. Publish the app when it is ready for public users.
4. Open **Google Auth Platform > Clients**.
5. Create an **OAuth client ID** with application type **Web application**.
6. Add this Authorized JavaScript origin:

   `https://minilinks.onrender.com`

7. Add this Authorized redirect URI, replacing the project reference:

   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

8. Copy the Google Client ID and Client Secret.
9. In Supabase, open **Authentication > Providers > Google**.
10. Enable Google, paste the Client ID and Client Secret, and save.

The Google Client Secret belongs in Supabase, not Render and not GitHub.

## 4. Configure Render

Open the Render Web Service, then **Environment**, and set:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase `sb_secret_...` key |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase `sb_publishable_...` key |
| `API_KEY_SECRET` | A long random value generated once and kept stable |
| `PUBLIC_BASE_URL` | `https://minilinks.onrender.com` |

Do not include quotes, spaces, `/rest/v1`, or a trailing slash. Never expose `SUPABASE_SECRET_KEY` in browser code.

Choose **Manual Deploy > Clear build cache & deploy**.

## 5. Verify login and workspace isolation

1. Open `https://minilinks.onrender.com/health`.
2. Confirm the response includes `"storage":"supabase"` and `"auth":"supabase"`.
3. Open the website and choose **Team & billing**.
4. Test email account creation and sign-in.
5. Sign out and test **Continue with Google**.
6. The first successful login automatically creates a private Starter workspace owned by that user.

## 6. Verify the public API

1. Sign in and open **API keys**.
2. Create a key with `links:read` and `links:write`.
3. Copy the `ml_live_...` secret immediately.
4. Test it:

```bash
curl -X POST https://minilinks.onrender.com/v1/links \
  -H "Authorization: Bearer ml_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","alias":"my-example"}'
```

The API returns rate-limit headers. Revoked keys return HTTP 401. The machine-readable API definition is available at `/openapi.json`.

## 7. Add a custom domain

1. Buy a domain from a registrar such as Cloudflare Registrar, Namecheap, or GoDaddy.
2. In Render, open **Settings > Custom Domains > Add Custom Domain**.
3. Enter the domain and create the DNS records Render displays.
4. Return to Render and click **Verify**. Render provisions HTTPS automatically.
5. Change `PUBLIC_BASE_URL` in Render to the custom HTTPS URL.
6. In Supabase URL Configuration, add the custom URL and make it the Site URL.
7. In Google Auth Platform, add the custom domain as another Authorized JavaScript origin.
8. Redeploy Render.

The Google Authorized redirect URI remains the Supabase `/auth/v1/callback` URL.

The public marketing site is served at `/`; the authenticated product is served at `/app`.

## 8. Test and publish the Chrome extension

1. Follow [`extension/README.md`](extension/README.md) to load the unpacked extension.
2. Create a dedicated API key with only `links:write` for extension testing.
3. Confirm the extension can shorten a normal HTTPS page against the deployed Render API.
4. Add production icons, privacy-policy and support URLs, screenshots, and a store description.
5. Zip the contents of `extension/` and submit it through the Chrome Web Store developer dashboard.

Revoke the test key after testing. Each customer creates and stores their own key; no shared MiniLinks credential should be bundled into the extension.

## Before accepting paying customers

- Use a paid Render instance so redirects do not sleep.
- Replace in-memory rate limits with Upstash Redis.
- Add Google Web Risk or another reputation provider to the built-in URL scanner.
- Connect Stripe Checkout and signed webhooks before enabling billing controls.
- Add domain ownership verification before allowing customer-controlled branded domains.
