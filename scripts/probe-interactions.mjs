#!/usr/bin/env node
/**
 * Verifies interactive squircle elements (input focus shadow animation,
 * popover, select) render and animate correctly after the autoEffects=false
 * fix. Writes screenshots to .squircle-probe/interactions/.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:3001";
const outDir = path.resolve(".squircle-probe/interactions");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

async function snap(name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
}

// 1. Focus the search input and capture its computed box-shadow.
const searchInput = page.locator('input[type="search"]').first();
await searchInput.focus();
await page.waitForTimeout(220);
await snap("01-search-focused");
const focusedShadow = await searchInput.evaluate((el) => getComputedStyle(el).boxShadow);

// 2. Open the filter popover.
const filterTrigger = page.locator('button[aria-label="Open filters"]');
await filterTrigger.click();
await page.waitForTimeout(220);
await snap("02-filter-popover");

// 3. Close popover (esc) and open a card → drawer → tour select.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.locator("[data-apartment-card]").first().click();
await page.waitForTimeout(400);
const tourTrigger = page.locator('button[aria-label="Tour status"]');
await tourTrigger.click();
await page.waitForTimeout(200);
await snap("03-tour-select-open");

console.log("focused input boxShadow:", focusedShadow);
await browser.close();
