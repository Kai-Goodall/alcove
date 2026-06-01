# Contributing to Alcove

Thanks for your interest! Alcove is meant to be forked and pointed at your own
apartment hunt, so contributions that make it more reusable are especially
welcome.

## Ground rules

- **Keep search-specific values in `alcove.config.mjs`.** Anything tied to one
  person's hunt — city, commute target, neighborhoods, budgets, sources — must
  live in the config, not hardcoded in `app/`, `convex/`, or `scripts/`.
- **Never commit secrets or personal data.** `.env.local` and the `data/*.json`
  run files are gitignored; keep them that way.
- **Don't break the three runtimes.** `alcove.config.mjs` is imported by the
  Convex action, the Next.js build, and the Node scripts, so keep it plain ESM
  (no TypeScript syntax, no Node-only APIs).

## Local development

```bash
npm install
npx convex dev         # backend + codegen
npm run dev            # frontend
```

Icons live as SVGs in `app/_components/ui/icons/svg/`. After adding or changing
one, run `npm run build:icons` to regenerate the typed `index.tsx`.

## Before opening a PR

```bash
npm run lint           # ESLint
npx tsc --noEmit       # typecheck (includes Convex functions)
node --check alcove.config.mjs   # if you touched the config
```

- Keep changes focused; describe what you changed and why.
- If you add an environment variable, document it in `.env.example` and
  `docs/configuration.md`.
- If you change the import contract or schema, update `docs/data-model.md`.

## Ideas that would help everyone

- Optional authentication for multi-user / public deployments.
- A reference automation that turns discovery candidates into `runs.json`.
