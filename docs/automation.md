# Daily search automation

The recommended way to keep Alcove fresh is a **scheduled agent** that runs once
a day: it searches the live market, verifies listings on their actual pages,
writes a structured runs file, and imports it into Convex with images.

Alcove doesn't run the agent for you — you bring an agent runner (an
[OpenAI Codex](https://developers.openai.com/codex/) automation, a Claude
scheduled task, a cron job driving any agent, etc.). What Alcove gives you is a
**tailored prompt** generated from your `alcove.config.mjs`.

## Generate the prompt

```bash
npm run prompt:automation            # print the prompt
npm run prompt:automation > prompt.txt   # save it
```

The prompt is built from your search profile:

| Prompt section | Comes from `alcove.config.mjs` |
| --- | --- |
| Tracks + budgets | `budgets` (label, preferred/hardCap/max/stretch, `note`, `extra`) |
| Neighborhoods | `neighborhoods` |
| Commute priority | `commuteTarget` |
| Must-haves | `mustHaves` |
| Furniture fit | `furnitureFit` |
| Move-in window | `automation.moveIn` |
| Operators to inspect | `automation.operators` |
| Portals to sweep | `automation.portals` |
| Automation name | `automation.name` |

Edit the config and re-run the command to regenerate. The working directory and
the `data/automation-backfill/` import path are filled in automatically.

## What the prompt tells the agent to do

1. Run a **fresh-market discovery sweep** every time (don't anchor on prior
   winners): broad search-engine queries, then direct operator/property-manager
   availability pages, then portals.
2. **Open and verify every candidate** on its live page before shortlisting —
   matching unit, price, bed/bath, and availability. Reject stale/mismatched
   links aggressively; a small accurate list beats a long stale one.
3. Apply the **shortlist strictness** rules (verified live, strong evidence,
   commute clears, no unresolved must-haves; everything conditional → monitor).
4. Write a date-stamped JSON file to `data/automation-backfill/<date>.json` in
   the runs shape documented in [`data-model.md`](./data-model.md).
5. Run `npm run import:apartment-runs -- data/automation-backfill/<date>.json`
   to upsert the listings, enforce the stricter shortlist gate, fetch images,
   and attach them.
6. Also send the user the normal human-readable summary (the DB write doesn't
   replace messaging).

## Scheduling

- **Codex automation:** create a scheduled automation, paste the generated
  prompt as its instructions, and point it at your local clone.
- **Any agent + cron:** wrap your agent CLI in a daily cron/launchd job that
  feeds it `prompt.txt`.

The agent needs network access and whatever credentials its own tooling
requires. The **import step** needs the Convex deployment to have
`ANTHROPIC_API_KEY` (only if you also use the in-app URL importer) and the
`R2_*` image vars — see [`configuration.md`](./configuration.md).

## Bring your own automation

Nothing about Alcove is tied to a specific agent. Any process that produces the
documented runs JSON (or calls the `apartments.upsert` Convex mutation directly)
works. The generated prompt is a strong default, not a requirement — see
[`data-model.md`](./data-model.md) for the contract.
