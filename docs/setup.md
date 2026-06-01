# Setup

This is the complete, click-by-click setup. For the short version see the
[Quick start](../README.md#quick-start) in the README.

Alcove is modular: the only hard requirements are **Node.js** and **Convex**.
The AI importer, discovery crawler, image storage, and maps are each optional
and only needed for the features that use them. Set up what you need.

## 1. Prerequisites

- **Node.js ≥ 20** (`node -v`).
- **A Convex account** — free tier is fine: <https://convex.dev>.

Optional, per feature:

- **Anthropic API key** (Add-by-URL importer) — <https://console.anthropic.com/>.
  Your account must have the `web_search` and `web_fetch` tools available.
- **Firecrawl API key** (discovery) — <https://www.firecrawl.dev/>.
- **Cloudflare R2** (image storage) — <https://developers.cloudflare.com/r2/>.
- **Google Maps API key** (location previews) —
  <https://console.cloud.google.com/google/maps-apis>.

## 2. Clone, configure, install

```bash
git clone https://github.com/Neesh774/alcove.git
cd alcove
cp .env.example .env.local
```

Open `.env.local` and fill in what you have so far (you can come back for the
rest), then install:

```bash
npm install
```

## 3. Convex (required)

Convex is the database, server functions, scheduler, and (fallback) file
storage.

```bash
npx convex dev
```

The first run logs you in, creates a project, and **writes
`CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` into `.env.local`
automatically**. Leave this process running — it watches `convex/` and
regenerates the typed client in `convex/_generated/`.

In a second terminal:

```bash
npm run dev          # http://localhost:3000
```

You now have a working (empty) dashboard.

## 4. Anthropic — the Add-by-URL importer (optional)

The importer action runs **inside Convex**, so its key goes on the Convex
deployment, not in `.env.local`:

```bash
npx convex env set ANTHROPIC_API_KEY sk-ant-...
# optional model override (defaults to alcove.config.mjs -> anthropicModel)
npx convex env set ANTHROPIC_MODEL claude-sonnet-4-6
```

The importer also uploads images to R2, so set the `R2_*` vars on Convex too
(next section). Once configured, click **Add apartment** in the app header and
paste a listing URL.

## 5. Cloudflare R2 — image storage (optional but recommended)

1. In the Cloudflare dashboard, create an **R2 bucket** (e.g. `alcove`).
2. Create an **R2 API token** with S3 read/write access. Note the
   account-scoped S3 endpoint, access key id, and secret.
3. Fill in `.env.local`:

   ```ini
   R2_S3_API_URL=https://<account_id>.r2.cloudflarestorage.com
   R2_S3_ACCESS_KEY_ID=...
   R2_S3_SECRET_ACCESS_KEY=...
   R2_BUCKET_NAME=alcove
   ```

4. **Serving images** — choose one:
   - **Public custom domain:** map a domain to the bucket in R2, then set
     `R2_PUBLIC_URL` and `NEXT_PUBLIC_R2_PUBLIC_URL`. Images are served directly.
   - **Private proxy (default):** leave those unset. Images are streamed through
     the app's `/api/images/r2` route, which needs the `R2_*` vars at runtime.

5. **For the in-app importer**, mirror the R2 vars onto Convex:

   ```bash
   npx convex env set R2_S3_API_URL https://<account_id>.r2.cloudflarestorage.com
   npx convex env set R2_S3_ACCESS_KEY_ID ...
   npx convex env set R2_S3_SECRET_ACCESS_KEY ...
   npx convex env set R2_BUCKET_NAME alcove
   # if using a public domain:
   npx convex env set R2_PUBLIC_URL https://assets.example.com
   ```

See [`docs/configuration.md`](./configuration.md#cloudflare-r2) for how the
bucket name is resolved.

## 6. Firecrawl — discovery (optional)

```ini
# .env.local
FIRECRAWL_API_KEY=fc-...
```

Then run a discovery sweep:

```bash
npm run discover:apartments
```

It writes ranked candidate URLs to `data/firecrawl-discovery/<date>.json`. Tune
the queries and sources in [`alcove.config.mjs`](../alcove.config.mjs).

## 7. Google Static Maps — location previews (optional)

```ini
# .env.local
NEXT_PUBLIC_GOOGLE_MAPS_KEY=...
```

A bundled fallback key is used if this is unset, so the map works out of the
box. Set your own key — restricted to the **Static Maps API** and your domains —
to avoid sharing quota.

## 8. Make it yours

Edit [`alcove.config.mjs`](../alcove.config.mjs) to set your city, commute
target, neighborhoods, budgets, and the sources/queries to crawl. The defaults
describe a Manhattan rental search. Full field reference:
[`docs/configuration.md`](./configuration.md).

## Deployment

### Frontend (Vercel or any Node host)

1. Import the repo into Vercel.
2. Add the env vars from your `.env.local` to the Vercel project
   (`NEXT_PUBLIC_CONVEX_URL`, the `R2_*` vars used by the image proxy,
   `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, and `NEXT_PUBLIC_SITE_URL`).
3. Deploy.

### Backend (Convex)

```bash
npm run convex:deploy
```

Set production env vars on the Convex deployment (`ANTHROPIC_API_KEY`, the
`R2_*` vars, optional `ANTHROPIC_MODEL`). Point `NEXT_PUBLIC_CONVEX_URL` in your
host at the production Convex URL.

### Checklist

- [ ] `NEXT_PUBLIC_CONVEX_URL` points at the right deployment in every
      environment.
- [ ] `ANTHROPIC_API_KEY` + `R2_*` set on **Convex** (importer runs there).
- [ ] `R2_*` set on the **host** if using the private image proxy.
- [ ] No secrets or personal run data committed.
