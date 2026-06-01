# Configuration

Alcove separates **what you're searching for** (the search profile, in
`alcove.config.mjs`) from **secrets and service endpoints** (environment
variables). This page documents both.

## `alcove.config.mjs`

A single plain-ESM file at the repo root, imported by all three runtimes (the
Convex importer action, the discovery CLI, and the import CLI). Keep it free of
TypeScript and Node-only APIs — just data and pure functions.

| Field | Type | Used by | Description |
| --- | --- | --- | --- |
| `appName` | `string` | importer prompt | Name used in the AI agent's system prompt. |
| `location.city` | `string` | importer, discovery | City name for web-search localization + Firecrawl. |
| `location.region` | `string` | importer | Region/state for web-search localization. |
| `location.country` | `string` | importer, discovery | ISO 3166-1 alpha-2 country code. |
| `location.timezone` | `string` | importer | IANA timezone for the web-search tool. |
| `location.searchLocation` | `string` | discovery | Firecrawl `search` location string, `"City,Region,Country"`. |
| `location.mapLocation` | `object` | discovery | Firecrawl `map` location (`{ country, languages }`). |
| `commuteTarget` | `{ name, address }` or `null` | importer, import CLI | Place you want a short commute to. `null` disables commute notes entirely. |
| `neighborhoods` | `string[]` | importer, discovery | Neighborhoods you care about; drives candidate tagging/scoring and the agent's shortlist standard. |
| `budgets` | `Record<track, BudgetBand>` | importer | Budget bands per bedroom track (`1br`/`2br`/`3br`). Rendered into the agent's shortlist gate. |
| `mustHaves` | `string[]` | importer | Non-negotiable features the agent weighs. |
| `furnitureFit` | `string` or `null` | importer | Furniture you need to fit, in plain language. |
| `anthropicModel` | `string` | importer | Claude model id (overridable via `ANTHROPIC_MODEL`). |
| `querySets` | `Record<name, string[]>` | discovery | Named Firecrawl search query sets. Pick one with `--query-set`. |
| `curatedSources` | `CuratedSource[]` | discovery | Direct-operator/PM sites to site-map each run (`{ provider, url, search }`). |

### `BudgetBand`

```js
{
  label: "1BR",            // human label
  preferred: [4000, 5500], // optional preferred [min, max] monthly rent
  hardCap: 6000,           // optional absolute ceiling
  max: 9000,               // optional upper bound when there's no range
  stretch: 15000,          // optional "only if unusually strong" ceiling
  note: "true 2BR/2BA is expected for shortlist", // optional extra requirement
}
```

`buildExtractionPrompt(config)` renders these fields into the agent's system
prompt, so editing the config automatically updates the agent's behavior. You
generally won't call that function yourself — the Convex importer does.

### Source classification (discovery)

`scripts/discover-apartments-firecrawl-config.mjs` holds the *mechanical*
discovery knobs that sit alongside the profile: how candidates are classified
(`DIRECT_OPERATOR_HOST_PATTERNS`, `PORTAL_HOST_PATTERNS`,
`BROKER_HOST_PATTERNS`), scored, and filtered (`REJECT_PATH_PATTERNS`,
`SOFT_DEPRIORITIZE_PATTERNS`, tracking-param stripping). If your market uses
different portals/brokers/operators, edit those lists.

## Environment variables

Variables live in up to three environments depending on which code reads them:

- **`[local]`** — your `.env.local` (and shell); read by the CLI scripts.
- **`[app]`** — the Next.js runtime; set in `.env.local` for dev and on your
  host (e.g. Vercel) for production.
- **`[convex]`** — the Convex deployment; set with `npx convex env set NAME value`.
  Required because the AI importer action runs inside Convex.

| Variable | Where | Required? | Purpose |
| --- | --- | --- | --- |
| `CONVEX_DEPLOYMENT` | local | auto | Written by `npx convex dev`; selects your deployment. |
| `NEXT_PUBLIC_CONVEX_URL` | app, local | **yes** | Convex client URL. The app throws on startup without it. |
| `ANTHROPIC_API_KEY` | convex | for Add-by-URL | Claude key for the importer. Account needs `web_search`/`web_fetch`. |
| `ANTHROPIC_MODEL` | convex | no | Overrides `alcove.config.mjs` → `anthropicModel`. |
| `FIRECRAWL_API_KEY` | local | for discovery | Firecrawl key for `discover:apartments`. |
| `FIRECRAWL_BASE_URL` | local | no | Alternate/self-hosted Firecrawl base URL. |
| `R2_S3_API_URL` | local, app, convex | for images | R2 S3 endpoint (`https://<account_id>.r2.cloudflarestorage.com`). |
| `R2_S3_ACCESS_KEY_ID` | local, app, convex | for images | R2 S3 access key id. |
| `R2_S3_SECRET_ACCESS_KEY` | local, app, convex | for images | R2 S3 secret. |
| `R2_BUCKET_NAME` / `R2_BUCKET` | local, app, convex | no | Bucket name; see resolution below. |
| `R2_PUBLIC_URL` | local, convex | no | Public custom domain for the bucket (server-side helpers). |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | app | no | Same public domain, exposed to the browser. |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | app | no | Google Static Maps key. A bundled fallback is used if unset; set your own to avoid sharing quota. |
| `NEXT_PUBLIC_SITE_URL` | app | no | Absolute base URL for OG/canonical metadata. |

### Cloudflare R2

The bucket name is resolved in this order:

1. `R2_BUCKET_NAME`
2. `R2_BUCKET`
3. the first path segment of `R2_S3_API_URL` (if you embed the bucket there)
4. the default `"alcove"`

Image URLs are resolved as:

- if `R2_PUBLIC_URL` / `NEXT_PUBLIC_R2_PUBLIC_URL` is set →
  `https://your-domain/<key>` (served directly by R2);
- otherwise → `/api/images/r2?bucket=...&key=...` (streamed through the app,
  which needs the `R2_*` vars at runtime).

### A note on secrets

`.env.local` is gitignored. The repo ships **no** real keys. If you fork from a
deployment that previously had keys committed, rotate them. Never commit
`.env.local`, and keep your `data/` run files private (they're gitignored too).
