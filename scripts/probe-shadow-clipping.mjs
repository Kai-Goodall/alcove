#!/usr/bin/env node
/**
 * Isolated test: renders two identical 200×140 cards side-by-side,
 * one with clip-path applied, one without. Both carry the same
 * box-shadow. If clip-path is hiding the shadow, only the right card
 * shows its drop shadow.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir(".squircle-probe/shadow-clipping", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 320 } });

await page.setContent(`
<!doctype html>
<html><head><style>
  body { margin: 0; background: #f3f2f2; font-family: system-ui; }
  .row { display: flex; gap: 64px; padding: 56px; }
  .card {
    width: 200px; height: 140px; background: #fff; border-radius: 20px;
    box-shadow: 0 8px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.1);
    display: flex; align-items: center; justify-content: center; color: #555;
  }
  .clipped {
    clip-path: path("M 32 0 L 168 0 C 188 0 200 12 200 32 L 200 108 C 200 128 188 140 168 140 L 32 140 C 12 140 0 128 0 108 L 0 32 C 0 12 12 0 32 0 Z");
  }
  .filter-shadow {
    box-shadow: none;
    filter: drop-shadow(0 8px 12px rgba(0,0,0,0.06)) drop-shadow(0 1px 3px rgba(0,0,0,0.1));
  }
</style></head>
<body>
  <div class="row">
    <div class="card">box-shadow only</div>
    <div class="card clipped">clip-path + box-shadow</div>
    <div class="card clipped filter-shadow">clip-path + drop-shadow()</div>
  </div>
</body></html>
`);
await page.waitForTimeout(100);
await page.screenshot({ path: ".squircle-probe/shadow-clipping/cards.png" });
await browser.close();
console.log("Wrote .squircle-probe/shadow-clipping/cards.png");
