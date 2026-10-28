# MiniLinks Launch Plan

MiniLinks now has a public site, authenticated product, workspace-separated data, API keys, analytics, abuse workflows, and a Chrome extension client. The items below distinguish a public beta from a dependable commercial service.

## Product positioning

MiniLinks should compete on secure link operations for small teams: generous limits, simple API access, built-in destination checks, and a lower entry price than established enterprise-first products.

| Plan | Monthly price billed annually | Links / month | Tracked clicks / month | API requests / month | Main buyer |
| --- | ---: | ---: | ---: | ---: | --- |
| Free | $0 | 25 | 1,000 | 500 | Individual evaluation |
| Launch | $9 | 500 | 50,000 | 10,000 | Creator or founder |
| Growth | $29 | 5,000 | 250,000 | 100,000 | Marketing team |
| Scale | $79 | 25,000 | 1,000,000 | 500,000 | High-volume operation |
| Enterprise | Custom | Custom | Custom | Custom | Procurement-led company |

These prices are the commercial target, not active checkout behavior. Do not accept payment until usage metering, Stripe webhooks, invoices, cancellation, refunds, and plan enforcement are implemented and tested.

## Phase 1: Public beta

1. Buy the permanent product domain and connect it to Render.
2. Configure email and Google login in Supabase using the production domain.
3. Move Render to a paid instance so redirect traffic does not sleep.
4. Create support, security, privacy, terms, acceptable-use, and abuse-reporting pages.
5. Set up `support@`, `security@`, and `sales@` inboxes before publishing those addresses.
6. Add Sentry or another error tracker and an external uptime monitor for `/health` and a test redirect.
7. Recruit 10 to 20 beta users and keep paid plans disabled.

Exit criteria: authentication, link creation, redirects, analytics, revocation, export, and abuse reporting work on the production domain; backups and restore are tested.

## Phase 2: Paid launch

1. Integrate Stripe Checkout, Customer Portal, Tax, and signed webhooks.
2. Add immutable monthly usage counters for links, clicks, API requests, seats, and custom domains.
3. Enforce plan limits server-side and provide clear upgrade and over-limit responses.
4. Replace the in-memory limiter with Upstash Redis or another shared rate-limit store.
5. Add a production URL reputation provider such as Google Web Risk or Cloudflare URL Scanner.
6. Add verified custom domains with DNS ownership checks, certificate state, and domain-level routing.
7. Add transactional email for confirmation, invitations, password recovery, limits, invoices, and abuse events.

Exit criteria: a new user can subscribe, upgrade, downgrade, cancel, receive an invoice, and retain correct access after every Stripe webhook retry.

## Phase 3: Distribution and scale

1. Publish the Chrome extension after permission and privacy review.
2. Add Zapier, Make, and native webhook integrations.
3. Move click ingestion away from the request path into a queue or durable event pipeline.
4. Add read replicas or analytics storage when click volume makes transactional queries expensive.
5. Introduce organization invitations, enforced MFA, SSO/SAML, SCIM, and configurable retention for larger accounts.
6. Establish on-call ownership, incident response, status-page communication, abuse-response SLAs, and security disclosure handling.

## Operating metrics

Track redirect availability and latency, link creation success, blocked destinations, report response time, signup conversion, activation, retained workspaces, free-to-paid conversion, monthly recurring revenue, churn, API error rate, and support volume.

## Release rule

Ship the public beta when redirects and account isolation are reliable. Call it a commercial product only after billing, metering, domain verification, reputation scanning, monitoring, legal policies, and support operations are live.
