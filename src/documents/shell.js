// Document shell on the Corridor template (brand/brand-guide.html "Document anatomy"):
// mark on page one, document line (type · reference · recipient · As of), body, footer (legal name · figures sentence · page x of y).
import { esc } from "../engine/dates.js";
import { ORG } from "./org.js";

export const DOC_CSS = `
:root{--ink:#172033;--paper:#FBFBF9;--alu:#C9CED3;--alu2:#EEF0F1;--copper:#9C4A1A;--verd:#2F6F62;--amber:#8A6A12;--slate:#5B6672;--red:#9C2A2A}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:var(--ink);font-family:"IBM Plex Sans",Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5}
.sheet{padding:0}
.mark{position:relative;padding:12px 0 12px 26px;border-top:3px solid var(--ink);border-bottom:3px solid var(--ink);font-size:20px;letter-spacing:.06em;line-height:1;display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.mark::before{content:"";position:absolute;left:0;top:50%;width:10px;height:10px;transform:translateY(-50%);background:var(--copper)}
.mark b{font-weight:600}.mark span{font-weight:300;margin-left:.4em}
.docline{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--slate);padding:8px 0 14px}.docline strong{color:var(--ink);font-weight:500}
h1{font-size:19px;font-weight:500;line-height:1.2;margin:14px 0 10px}h2{font-size:14px;font-weight:500;margin:20px 0 8px;padding-top:8px;border-top:1px solid var(--alu)}h3{font-size:13px;font-weight:600;margin:14px 0 6px}
p{max-width:68ch;margin:0 0 10px}.small{font-size:11px}.muted{color:var(--slate)}.lede{font-size:15px;font-weight:300;max-width:60ch}
table{border-collapse:collapse;width:100%;margin:10px 0 16px;font-size:12.5px}
th{text-align:left;font-weight:500;color:var(--slate);border-bottom:2px solid var(--ink);padding:7px 8px 7px 0;white-space:nowrap}
td{border-bottom:1px solid var(--alu);padding:7px 14px 7px 0;vertical-align:top}td:last-child,th:last-child{padding-right:0}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums;padding-right:0}
.tag{display:inline-block;font-size:11px;font-weight:500;padding:2px 6px;border-radius:2px;color:#fff;white-space:nowrap;margin-right:3px}
.t-est{background:var(--slate)}.t-v{background:var(--verd)}.t-r{background:var(--amber)}.t-u{background:var(--slate)}
.foot{margin-top:22px;padding-top:8px;border-top:1px solid var(--alu);display:flex;justify-content:space-between;font-size:11px;color:var(--slate)}
.tw{overflow:visible}
ol,ul{padding-left:20px;max-width:68ch}li{margin:4px 0}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}
.sig div{padding-top:8px;border-top:2px solid var(--ink);font-size:12px}
.sig .n{font-weight:600}.sig .r{color:var(--slate)}
.field{display:inline-block;min-width:160px;border-bottom:1px solid var(--ink);padding:0 4px}
.draft{position:fixed;top:40%;left:10%;right:10%;text-align:center;font-size:48px;color:rgba(156,42,42,.18);transform:rotate(-20deg);pointer-events:none;letter-spacing:.2em}
@page{size:Letter;margin:18mm 16mm 20mm 16mm}
`;

export function docline({ typeName, ref, to, asOf }) {
  return `<div class="docline"><div><strong>${esc(typeName)}</strong> ${esc(ref)}</div><div>To: ${esc(to)}</div><div>As of ${esc(asOf)}</div></div>`;
}
export const mark = () => `<div class="mark"><div><b>${ORG.markA}</b><span>${ORG.markB}</span></div></div>`;
export const foot = () => `<div class="foot"><div>${esc(ORG.legalLine)}</div><div>${esc(ORG.figuresLine)}</div></div>`;

// Full HTML page for storage, preview and PDF. `body` already carries mark + docline + foot (page-one anatomy);
// the PDF footer template (pdf.js) adds legal name · figures sentence · page x of y on every page.
export function page({ title, body, watermark = "" }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>${DOC_CSS}</style></head><body>${watermark ? `<div class="draft">${esc(watermark)}</div>` : ""}<div class="sheet">${body}</div></body></html>`;
}
