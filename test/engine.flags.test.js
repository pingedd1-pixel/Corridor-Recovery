// Entry flags (PK 2026-09-14; interim until prototype v0.2.2). Synthetic entries only — the golden fixture is never hand-edited.
process.env.TZ = "America/Vancouver";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { phase, clientStats, tasks, dashboard, renderFindings, fmt, D } from "../src/engine/index.js";
import { parseCsv, ingestRows } from "../src/ingest/mapping.js";
import { openDb, migrate } from "../src/db/index.js";
import { buildApp } from "../src/app.js";

const RULES = { prot: 180, p1: 80, lag: 314, urg: 30, fee1: 0.10, fee2: 0.225, brok: 0.25, real: 0.8 };
const asOf = D("2026-09-13");
const client = { company: "Flag Co", bucket: "A — exporter as IOR", contact: "F", broker: "B", stage: "Data in", sales: 0, share: 0, rate: 0, ach: "No" };
const mk = (entry, f = {}, liqDate = "2026-07-01") => ({ entry, client: "Flag Co", hts: "9903.01.10", entryDate: "2025-06-01", liqDate, value: 100000, rate: 0.25, duty: 25000, consignee: "X LLC", ...f });

test("routing precedence and windows", () => {
  const p = f => phase(mk("E", f), RULES, asOf);
  assert.equal(p({}).phase, "Phase 1 — recently liquidated");
  assert.equal(p({ reconciliation_flag: true }).phase, "Phase 2 — reconciliation-flagged");
  assert.equal(fmt(p({ reconciliation_flag: true }).deadline), fmt(p({}).deadline), "Phase 2 shares the Phase 1 80-day window");
  const fut = p({ reconciliation_flag: true, reconciliation_on_file: true });
  assert.equal(fut.phase, "Future phase — reconciliation on file"); assert.equal(fut.deadline, null); assert.equal(fut.days, null);
  const man = p({ surety_paid: true }); assert.equal(man.phase, "Manual path — surety/drawback (confirm with broker)"); assert.equal(fmt(man.deadline), "2026-12-28", "protest clock still runs");
  assert.equal(p({ drawback_flag: true }).route, "manual");
  const ad = p({ drawback_flag: true, reconciliation_flag: true, adcvd_suspended: true }); assert.equal(ad.phase, "Manual processing (19 USC 1520)"); assert.equal(ad.deadline, null);
  assert.equal(phase(mk("E", { reconciliation_flag: true }, ""), RULES, asOf).phase, "Phase 2 — reconciliation-flagged", "estimated liquidation still routes");
  assert.equal(phase(mk("E", { surety_paid: true, hts: "9903.81.90" }), RULES, asOf).phase, "Not IEEPA", "non-IEEPA lines stay excluded regardless of flags");
});

test("clientStats keeps the prototype totals and reports flag routes separately", () => {
  const es = [mk("A"), mk("B", { reconciliation_flag: true }), mk("C", { surety_paid: true }), mk("D", { reconciliation_on_file: true }), mk("E", { adcvd_suspended: true }), mk("F", {}, "2026-01-01")];
  const st = clientStats(client, es, RULES, asOf);
  assert.equal(st.p1, 25000); assert.equal(st.pr, 0); assert.equal(st.gone, 25000); assert.equal(st.total, 50000, "total = p1+pr+gone as in the prototype");
  assert.equal(st.p2, 25000); assert.equal(st.manual, 50000); assert.equal(st.future, 25000); assert.equal(st.flagged, 4); assert.equal(st.identified, 150000);
  assert.equal(st.fee, 25000 * 0.10, "fee only on p1/pr");
});

test("tasks: manual-path and AD/CVD tasks are additive; unflagged data yields the prototype's tasks only", () => {
  const plain = tasks([client], [mk("A")], {}, RULES, asOf).map(t => t.id.split("|")[1]);
  assert.deepEqual(plain, ["ach", "fs"]);
  const flagged = tasks([client], [mk("A"), mk("C", { surety_paid: true }), mk("E", { adcvd_suspended: true })], {}, RULES, asOf);
  const ids = flagged.map(t => t.id.split("|")[1]);
  assert.ok(ids.includes("manual") && ids.includes("adcvd"));
  assert.ok(flagged.find(t => t.id.endsWith("|manual")).t.includes("manual path — confirm with broker: 1 surety-paid / drawback entries ($25,000)"));
  assert.ok(flagged.find(t => t.id.endsWith("|adcvd")).t.includes("no CAPE filing"));
});

test("dashboard KPI list is unchanged without flags and gains rows with them; findings sheet adds rows only when non-zero", () => {
  const base = dashboard([client], [mk("A")], RULES, asOf).kpis.map(k => k[0]);
  assert.equal(base.length, 12); assert.ok(!base.some(l => l.startsWith("Phase 2") || l.startsWith("Manual") || l.startsWith("Future")));
  const d = dashboard([client], [mk("A"), mk("B", { reconciliation_flag: true }), mk("D", { reconciliation_on_file: true })], RULES, asOf);
  assert.deepEqual(d.kpis.slice(12).map(k => k[0]), ["Phase 2 — reconciliation", "Future phase — reconciliation on file"]);
  const h0 = renderFindings(client, [mk("A")], RULES, "CM-FS-2026-001", asOf); assert.ok(!h0.includes("Phase 2 — reconciliation-flagged") && !h0.includes("Manual path"));
  const h1 = renderFindings(client, [mk("A"), mk("B", { reconciliation_flag: true }), mk("C", { drawback_flag: true })], RULES, "CM-FS-2026-001", asOf);
  assert.ok(h1.includes("Phase 2 — reconciliation-flagged") && h1.includes("Manual path") && h1.includes("not counted as recoverable now"));
});

test("ingestion: flag columns are auto-mapped and truthy cells parsed; fixture CSV has none and is unchanged", () => {
  const csv = "Entry Number,Entry Date,Chapter 99 HTS,Entered Value,Duties Paid,Liquidation Date,Reconciliation Flag,Recon On File,Surety Paid,Drawback,AD/CVD Suspended\nA-1,2025-06-01,9903.01.10,1000,250,2026-07-01,Y,,,,\nA-2,2025-06-01,9903.01.10,1000,250,2026-07-01,,,X,yes,\nA-3,2025-06-01,9903.01.10,1000,250,2026-07-01,,,,,true";
  const { headers, rows, map } = parseCsv(csv); const { entries } = ingestRows(rows, map, "Flag Co");
  assert.equal(headers[map.reconciliation_flag], "Reconciliation Flag"); assert.equal(headers[map.reconciliation_on_file], "Recon On File"); assert.equal(headers[map.adcvd_suspended], "AD/CVD Suspended");
  assert.deepEqual(entries.map(e => [e.reconciliation_flag, e.surety_paid, e.drawback_flag, e.adcvd_suspended]), [[true, false, false, false], [false, true, true, false], [false, false, false, true]]);
  const fx = parseCsv(readFileSync(new URL("../docs/fixtures-sim-broker-entry-report.csv", import.meta.url), "utf8"));
  assert.ok(["reconciliation_flag", "reconciliation_on_file", "surety_paid", "drawback_flag", "adcvd_suspended"].every(k => fx.map[k] == null), "fixture has no flag columns");
});

let db, app;
before(async () => { db = await openDb({ memory: true }); await migrate(db); app = await buildApp(db, { logger: false, dev: true }); });
after(async () => { await app.close(); await db.close(); });
test("API: flags persist through import and drive /api/state", async () => {
  const c = (await app.inject({ method: "POST", url: "/api/clients", payload: { company: "Flag Co", stage: "Data in", ach: "No" } })).json();
  const csv = "Entry Number,Entry Date,Chapter 99 HTS,Entered Value,Duties Paid,Liquidation Date,Reconciliation Flag,Surety Paid\nA-1,2025-06-01,9903.01.10,100000,25000,2026-07-01,Y,\nA-2,2025-06-01,9903.01.10,100000,25000,2026-07-01,,Y\nA-3,2025-06-01,9903.01.10,100000,25000,2026-07-01,,";
  const im = (await app.inject({ method: "POST", url: "/api/entries/import", payload: { csv, clientId: c.id } })).json(); assert.equal(im.imported, 3);
  const s = (await app.inject({ method: "GET", url: "/api/state?asOf=2026-09-13" })).json();
  assert.deepEqual(s.entries.map(e => e.computed.phase), ["Phase 2 — reconciliation-flagged", "Manual path — surety/drawback (confirm with broker)", "Phase 1 — recently liquidated"]);
  assert.equal(s.entries[1].surety_paid, true);
  const rows = (await db.query("SELECT entry_no, phase FROM computed c JOIN entries e ON e.id=c.entry_id ORDER BY entry_no")).rows;
  assert.equal(rows[0].phase, "Phase 2 — reconciliation-flagged");
  assert.ok(s.tasks.some(t => t.id === "Flag Co|manual"));
});
