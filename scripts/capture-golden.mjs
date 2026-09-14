// Regenerate the engine parity fixture FROM THE PROTOTYPE (the functional reference).
// Runs prototype/desk-v0.2.html headlessly, ingests docs/fixtures-sim-broker-entry-report.csv with the
// correct column mapping, and writes test/fixtures/expected-sim-broker-<asOf>.json.
// Usage: TZ=America/Vancouver node scripts/capture-golden.mjs [asOf=2026-09-13]
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const asOf = process.argv[2] || "2026-09-13";
const csv = readFileSync("docs/fixtures-sim-broker-entry-report.csv", "utf8");
const out = `test/fixtures/expected-sim-broker-${asOf}.json`;
const prev = (() => { try { return JSON.parse(readFileSync(out, "utf8")); } catch { return null; } })();
const client = prev?.client || { company: "Fraser Valley Cabinetry Ltd", bucket: "A — exporter as IOR", contact: "Dana Fraser", phone: "604-000-0100", broker: "Sim Broker Ltd", stage: "Data in", sales: 1500000, share: 0.6, rate: 0.35, ach: "No", signed: "", ref: "", notes: "Simulation fixture" };
const map = { entry: 0, entryDate: 1, hts: 4, value: 5, rate: 6, duty: 7, liqDate: 8, consignee: 9 }; // Chapter 99 line, duties paid (see src/ingest/mapping.js)

const browser = await chromium.launch();
const ctx = await browser.newContext({ timezoneId: "America/Vancouver" });
const page = await ctx.newPage();
await page.clock.setFixedTime(new Date(asOf + "T12:00:00-07:00"));
await page.goto("file://" + resolve("prototype/desk-v0.2.html"), { waitUntil: "load" });
await page.waitForFunction(() => typeof Papa !== "undefined" && typeof phase === "function");
const g = await page.evaluate(({ csv, client, map }) => {
  S.clients = [client]; S.entries = []; S.done = {};
  const rows = Papa.parse(csv, { skipEmptyLines: true }).data; ingestRows(rows.slice(1), map, client.company);
  const st = clientStats(client); const r = S.rules;
  let duty = 0, p1 = 0, pr = 0, gone = 0, urg = 0, past = 0, est = 0, na = 0;
  S.entries.forEach(e => { const p = phase(e); if (p.na) { na++; return; } duty += p.duty; if (p.phase.startsWith("Phase 1")) p1 += p.duty; else if (p.phase.startsWith("Protest")) pr += p.duty; else if (p.phase.startsWith("Phase 3") || p.phase.startsWith("Deadline")) gone += p.duty; if (p.days != null) { if (p.days < 0) past++; else if (p.days < r.urg) urg++; } if (p.est) est++; });
  const gross = (p1 * r.fee1 + pr * r.fee2) * r.real;
  const d = document.createElement("div"); d.innerHTML = findings(client.company);
  return {
    asOf: fmt(today()), version: (document.querySelector(".mark small")?.textContent || "").split("·")[0].trim(), rules: r,
    entries: S.entries.map(e => { const p = phase(e); return [e.entry, p.cls.kind, p.phase, fmt(p.deadline), p.days, p.est, p.duty]; }),
    estimatedLiqEff: Object.fromEntries(S.entries.filter(e => phase(e).est && !phase(e).na).map(e => [e.entry, fmt(phase(e).liqEff)])),
    stats: { count: st.es.length, p1: st.p1, pr: st.pr, gone: st.gone, na: st.na, est: st.est, min: st.min, past: st.past, exposure: st.exposure, fee: st.fee, total: st.total, next: st.next ? { entry: st.next.e.entry, days: st.next.p.days, deadline: fmt(st.next.p.deadline) } : null, consignees: st.consignees },
    dash: { duty, p1, pr, gone, urg, past, est, na, gross, net: gross * (1 - r.brok) },
    tasks: tasks().map(t => ({ id: t.id, who: t.who, hot: !!t.hot, t: t.t })),
    findingsHtml: findings(client.company),
  };
}, { csv, client, map });
await browser.close();
if (g.asOf !== asOf) throw new Error(`prototype ran as of ${g.asOf}, wanted ${asOf}`);

const fsRows = (h) => { const m = h.match(/<tr><td>([^<]+)<\/td><td class="n">\$[\d,]+<\/td>/g) || []; return m.map(x => x.match(/<td>([^<]+)</)[1]); };
const findingsIncludes = (prev?.findingsIncludes || []).filter(s => g.findingsHtml.includes(s));
const golden = {
  _note: `Golden output of prototype/desk-v0.2.html (${g.version}) — the functional reference — run headlessly on docs/fixtures-sim-broker-entry-report.csv with asOf=${asOf}, default rules and the fixture client below. Regenerate with: npm run golden. Do not edit by hand.`,
  asOf, prototypeVersion: g.version, client, mapping: prev?.mapping, entries: g.entries, entryColumns: ["entry", "cls", "phase", "deadline", "days", "est", "ieepaDuty"],
  estimatedLiqEff: g.estimatedLiqEff, stats: g.stats, dash: g.dash, tasks: g.tasks, findingsIncludes, findingsRows: fsRows(g.findingsHtml),
};
writeFileSync(out, JSON.stringify(golden, null, 1).replace(/\[\n\s+("KJ7[^\]]*?)\n\s+\]/gs, (m, inner) => "[" + inner.replace(/\n\s+/g, " ") + "]") + "\n");
console.log(`wrote ${out}: ${g.version}, ${g.entries.length} entries, total ${g.stats.total}, tasks ${g.tasks.length}`);
console.log("phases:", Object.entries(g.entries.reduce((a, e) => (a[e[2]] = (a[e[2]] || 0) + 1, a), {})).map(([k, v]) => `${v}× ${k}`).join(" | "));
