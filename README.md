# Short.ly URL Shortener

Full-stack URL shortener built with React, Vite, Express, Firebase Auth, and Firestore.

## What is included

- Link shortening with redirect tracking
- Firebase email/password and Google login
- Developer API tokens for paid or complimentary users
- Account and billing status UI
- Server-enforced monthly limits
- Custom aliases for Pro or complimentary users
- Free-access email allowlist with `FREE_ACCESS_EMAILS`
- Stripe Payment Link handoff for subscription upgrades
- Google Sheets and CSV bulk shortening workflow

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create environment config:
   ```bash
   cp .env.example .env
   ```

3. Start the app:
   ```bash
   npm run dev
   ```

The app runs on `http://localhost:3000`.

If Firebase Admin credentials are not configured locally, the server uses `urls.json` and `users.json` as a development fallback.

## Production build

```bash
npm run build
npm start
```

The build emits:

- `dist/index.html` and static assets
- `dist/server.js` for the Express server

## Account, subscription, and free access

New accounts start on the `free` plan. Pro access is granted when:

- `subscriptionStatus` is `active`
- `subscriptionStatus` is `complimentary`
- the user's email is listed in `FREE_ACCESS_EMAILS`

Set complimentary emails as a comma-separated environment variable:

```bash
FREE_ACCESS_EMAILS=you@example.com,partner@example.com
```

Pro users can create API tokens and custom aliases. Free users have lower monthly link limits.

## Stripe setup

This app currently uses Stripe Payment Links, which is the quickest production path.

1. Create a recurring product in Stripe.
2. Create a Payment Link for that product.
3. Set the link in hosting env vars:
   ```bash
   STRIPE_PAYMENT_LINK=https://buy.stripe.com/...
   ```

For fully automatic activation after payment, add a Stripe webhook next:

- listen for `checkout.session.completed`
- read `client_reference_id`
- update that Firestore user to `subscriptionStatus: "active"` and `plan: "pro"`

Until that webhook is added, you can grant access manually by adding the email to `FREE_ACCESS_EMAILS`.

## Deployment

Recommended path:

1. Push this project to GitHub.
2. Deploy the Express server to Cloud Run, Render, Railway, or another Node host.
3. Configure env vars from `.env.example`.
4. For Firebase Hosting + Cloud Run, deploy with `firebase.json`; it rewrites traffic to a Cloud Run service named `shortly` in `us-central1`.
5. Attach a Firebase/Google service account so Firestore Admin access works in production.

Useful commands:

```bash
npm run lint
npm run build
firebase deploy --only firestore:rules
firebase deploy --only hosting
```
