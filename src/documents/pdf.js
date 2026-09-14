// HTML → PDF with Playwright's Chromium (BUILD_SPEC §4 "HTML → PDF"). One browser per process, opened lazily.
import { ORG } from "./org.js";
let browserP = null;
async function browser() {
  if (!browserP) { const { chromium } = await import("playwright"); browserP = chromium.launch(); }
  return browserP;
}
export async function htmlToPdf(html, { ref } = {}) {
  const b = await browser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    const footer = `<div style="width:100%;font-family:'IBM Plex Sans',Arial,sans-serif;font-size:8px;color:#5B6672;padding:0 16mm;display:flex;justify-content:space-between">
      <span>${ORG.legalLine}</span><span>${ORG.figuresLine}</span><span>${ref ? ref + " · " : ""}Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
    return await page.pdf({ format: "Letter", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: footer, margin: { top: "18mm", right: "16mm", bottom: "20mm", left: "16mm" } });
  } finally { await page.close(); }
}
export async function closePdf() { if (browserP) { const b = await browserP; browserP = null; await b.close(); } }
