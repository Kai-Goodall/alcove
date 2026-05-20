#!/usr/bin/env node
/**
 * Diagnostic probe for the squircle migration. Snapshots the home grid +
 * an open drawer + an open select, and dumps computed styles / inline
 * attributes for the key squircle elements so we can see what Lisse is
 * actually doing to the DOM.
 *
 *   node scripts/probe-squircle.mjs [tag]
 *
 * Writes screenshots and a JSON report to .squircle-probe/<tag>/.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:3001";
const tag = process.argv[2] ?? "current";
const outDir = path.resolve(`.squircle-probe/${tag}`);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleLogs = [];
page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => consoleLogs.push(`[pageerror] ${err.message}`));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

async function snapshot(name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
}

async function inspect(selector, label) {
  return page.evaluate(
    ({ selector, label }) => {
      const el = document.querySelector(selector);
      if (!el) return { label, found: false };
      const cs = getComputedStyle(el);
      const inline = el.getAttribute("style") ?? "";
      return {
        label,
        found: true,
        rect: el.getBoundingClientRect().toJSON(),
        // Pull only the properties relevant to squircle, shadow, transition
        clipPath: cs.clipPath,
        webkitClipPath: cs.webkitClipPath,
        boxShadow: cs.boxShadow,
        borderRadius: cs.borderRadius,
        backgroundColor: cs.backgroundColor,
        transition: cs.transition,
        overflow: cs.overflow,
        position: cs.position,
        dataState: el.getAttribute("data-state"),
        dataSlot: el.getAttribute("data-slot"),
        inline: inline.slice(0, 240),
      };
    },
    { selector, label },
  );
}

await snapshot("01-home");
const homeReport = [
  await inspect("[data-apartment-card]", "first apartment card"),
  await inspect("[data-apartment-card] img", "first card image"),
];

// Open the first card to inspect the drawer.
await page.click("[data-apartment-card]");
await page.waitForTimeout(500);
await snapshot("02-drawer-open");
const drawerReport = [
  await inspect('[role="dialog"]', "drawer aside"),
  await inspect('[role="dialog"] img', "drawer hero image"),
  await inspect('[role="dialog"] [data-slot="smooth-corners"]', "drawer inner smooth-corners (if any)"),
];

// Hover the drawer to see if shadow changes (animated cards have hover lift).
const card = await page.$("[data-apartment-card]");
if (card) {
  await card.hover();
  await page.waitForTimeout(250);
  await snapshot("03-card-hover");
}

await browser.close();

await writeFile(
  path.join(outDir, "report.json"),
  JSON.stringify({ tag, baseUrl: BASE, consoleLogs, homeReport, drawerReport }, null, 2),
);
console.log(`Wrote probe artifacts to ${outDir}`);
