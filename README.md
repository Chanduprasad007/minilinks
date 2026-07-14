# MiniLinks

MiniLinks is a complete starter URL shortener inspired by the Bitly and TinyURL scrape research in `.firecrawl/`. It includes a product UI, a backend API, managed short links, custom aliases, redirect tracking, analytics summaries, QR previews, and CSV export.

## Run Locally

```bash
npm start
```

Open `http://localhost:3000`.

The local backend stores data in `data/minilinks-db.json`. That is useful for development, but it is not production storage.

## API

```http
POST /api/links
GET /api/links
GET /api/stats
GET /api/export.csv
GET /:slug
GET /health
```

Example:

```bash
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{"longUrl":"https://example.com","alias":"example","campaign":"launch"}'
```

## Deploy As A Real Product

For a real Bitly-style product, do not deploy the JSON-file database as the final architecture. Use this repo as the product shell, then make these production changes:

1. Replace `data/minilinks-db.json` with Postgres.
   - Tables: `users`, `workspaces`, `domains`, `links`, `click_events`, `api_keys`.
   - Index `links.slug`, `links.domain`, `click_events.link_id`, and `click_events.created_at`.

2. Add Redis for redirect speed.
   - Cache `domain + slug -> destination_url`.
   - Keep redirects fast even when analytics writes are queued.

3. Move click tracking to an async queue.
   - Redirect first, then enqueue analytics.
   - Use BullMQ, Cloudflare Queues, SQS, or a managed queue.

4. Add authentication and workspaces.
   - Use Clerk, Auth0, Supabase Auth, or NextAuth.
   - Add roles, billing plans, API keys, and audit logs.

5. Support custom domains.
   - Require DNS verification with TXT/CNAME records.
   - Automate TLS certificates.
   - Route redirects by `Host` header plus slug.

6. Add abuse protection.
   - Rate-limit link creation and redirects.
   - Scan destinations for malware/phishing.
   - Add report/takedown workflows.

7. Host the app.
   - Simple path: Render, Railway, Fly.io, or Heroku with Postgres.
   - Edge path: Cloudflare Workers for redirects, Workers KV/D1/Queues, and a separate admin app.
   - Scale path: API service on Fly.io/Render, Postgres on Neon/Supabase, Redis on Upstash, queue workers for analytics.

## Render Deployment Sketch

1. Push this repo to GitHub.
2. Create a Render Web Service.
3. Set build command to `npm install`.
4. Set start command to `npm start`.
5. Add `PORT` from Render automatically.
6. Add a Postgres database and migrate the JSON storage before accepting real traffic.

## Product Features To Build Next

- Link edit/archive/delete.
- Workspace login and ownership.
- Branded domain verification.
- QR code generation stored as first-party assets.
- UTM builder.
- Bulk import.
- Public API with scoped keys.
