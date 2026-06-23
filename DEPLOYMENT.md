# Deployment Guide

## Architecture

Short.ly is a unified Node app:

- React/Vite frontend
- Express API and redirect gateway
- Firebase Auth in the browser
- Firestore accessed only from the trusted server
- Stripe Payment Link handoff for upgrades

Firestore browser rules are intentionally locked down. Do not loosen them for production; the server owns user, URL, and billing writes.

## Required environment variables

Set these on your hosting platform:

```bash
NODE_ENV=production
PORT=8080
APP_BASE_URL=https://your-domain.com
FREE_ACCESS_EMAILS=you@example.com,partner@example.com
STRIPE_PAYMENT_LINK=https://buy.stripe.com/...
STRIPE_CUSTOMER_PORTAL_LINK=
```

For Firestore in production, attach a Google service account to the server runtime. On Cloud Run, Application Default Credentials are available automatically when the service account has Firestore permissions.

## Firebase Hosting + Cloud Run

The included `firebase.json` routes all non-static traffic to:

- service: `shortly`
- region: `us-central1`

Deploy flow:

```bash
npm install
npm run build
firebase deploy --only firestore:rules
gcloud run deploy shortly --source . --region us-central1 --allow-unauthenticated
firebase deploy --only hosting
```

If you use a different Cloud Run service name or region, update `firebase.json`.

## Render/Railway/Fly.io

Use these settings:

- build command: `npm install && npm run build`
- start command: `npm start`
- health check path: `/`
- env vars: copy from `.env.example`

Point your custom domain to the deployed service. Short links rely on the Express redirect route, so the domain must reach the Node server, not only a static frontend.

## Subscription activation

Current implementation:

- users click `Upgrade to Pro`
- server redirects to `STRIPE_PAYMENT_LINK`
- free/complimentary access can be granted through `FREE_ACCESS_EMAILS`

Recommended next production step:

1. Add Stripe SDK dependency.
2. Add `POST /api/billing/webhook`.
3. Verify webhook signature with `STRIPE_WEBHOOK_SECRET`.
4. On `checkout.session.completed`, update the matching Firestore user:
   ```json
   {
     "subscriptionStatus": "active",
     "plan": "pro"
   }
   ```
5. On failed/canceled subscription events, update status to `past_due` or `canceled`.

## Security checklist

- Keep `firestore.rules` locked down.
- Do not commit Firebase service account JSON files.
- Set `FREE_ACCESS_EMAILS` only in hosting env vars.
- Set `APP_BASE_URL` to the deployed domain.
- Use Firebase authorized domains for the production domain.
- Add Stripe webhooks before relying on fully automated paid activation.
