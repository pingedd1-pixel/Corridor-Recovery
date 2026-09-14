// Preview screenshots for PRs (CLAUDE.md: "a preview screenshot for UI"). Usage: node scripts/screenshot.mjs [baseUrl]
import { chromium } from "playwright";
const base = process.argv[2] || "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof S !== "undefined" && S.asOf);
const shot = async (tab, name, full = false) => { if (tab) { await page.click(`#nav button[data-t="${tab}"]`); await page.waitForTimeout(250); } await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: full }); console.log("wrote", name); };
await shot(null, "m1-dashboard");
await shot("entries", "m1-entries", true);
await shot("tasks", "m1-tasks");
await page.click('#nav button[data-t="findings"]'); await page.click("#genFs"); await page.waitForSelector(".blocked, .sheet"); await page.waitForTimeout(200);
await page.screenshot({ path: "docs/screenshots/m1-findings-blocked.png" }); console.log("wrote m1-findings-blocked");
await page.click('#nav button[data-t="rules"]'); await page.waitForTimeout(200); await page.screenshot({ path: "docs/screenshots/m1-rules.png" }); console.log("wrote m1-rules");
await browser.close();
