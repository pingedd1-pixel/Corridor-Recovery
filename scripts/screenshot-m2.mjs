// M2 document previews for the PR. Usage: node scripts/screenshot-m2.mjs [baseUrl]
import { chromium } from "playwright";
const base = process.argv[2] || "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof S !== "undefined" && S.asOf && typeof DOC_TYPES !== "undefined" && DOC_TYPES.length);
await page.click('#nav button[data-t="findings"]');
await page.selectOption("#docType", "FS"); await page.click("#genDoc"); await page.waitForSelector(".blocked"); await page.waitForTimeout(200);
await page.screenshot({ path: "docs/screenshots/m2-documents-blocked.png" }); console.log("wrote m2-documents-blocked");
for (const t of ["EL", "AU"]) { await page.selectOption("#docType", t); await page.click("#genDoc"); await page.waitForSelector("#fsOut .sheet"); await page.waitForTimeout(300); }
await page.selectOption("#docType", "BI"); await page.waitForTimeout(100); await page.click("#genDoc"); await page.waitForSelector("#fsOut .sheet"); await page.waitForTimeout(400);
await page.screenshot({ path: "docs/screenshots/m2-documents-list.png", fullPage: false }); console.log("wrote m2-documents-list");
// Print-layout render of the latest generated document (what the PDF shows), Letter width
const docs = await (await page.request.get(base + "/api/documents")).json();
const el = docs.find(d => d.type === "EL");
const doc = await (await page.request.get(`${base}/api/documents/${el.id}`)).json();
const p2 = await browser.newPage({ viewport: { width: 816, height: 1056 } });
await p2.setContent(doc.html, { waitUntil: "load" }); await p2.emulateMedia({ media: "print" }); await p2.waitForTimeout(500);
await p2.screenshot({ path: "docs/screenshots/m2-engagement-letter-print.png", fullPage: true }); console.log("wrote m2-engagement-letter-print");
await browser.close();
