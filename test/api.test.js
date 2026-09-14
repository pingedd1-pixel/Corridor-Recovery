// Full-stack acceptance: fixture CSV → API import → Postgres (embedded) → engine → /api/state, tasks, findings hard block, audit log.
process.env.TZ = "America/Vancouver";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDb, migrate } from "../src/db/index.js";
import { buildApp } from "../src/app.js";

const expected = JSON.parse(readFileSync(new URL("./fixtures/expected-sim-broker-2026-09-13.json", import.meta.url), "utf8"));
const csv = readFileSync(new URL("../docs/fixtures-sim-broker-entry-report.csv", import.meta.url), "utf8");
const ASOF = "?asOf=2026-09-13";
let db, app, clientId;
before(async () => { db = await openDb({ memory: true }); await migrate(db); app = await buildApp(db, { logger: false, dev: true }); });
after(async () => { await app.close(); await db.close(); });
const j = async (method, url, payload) => { const r = await app.inject({ method, url, payload }); return { status: r.statusCode, body: r.json() }; };

test("create the fixture client (audited)", async () => {
  const r = await j("POST", "/api/clients", { company: expected.client.company, bucket: expected.client.bucket, contact: expected.client.contact, phone: expected.client.phone, broker: expected.client.broker, stage: expected.client.stage, sales: expected.client.sales, share: expected.client.share, rate: expected.client.rate, ach: expected.client.ach });
  assert.equal(r.status, 200); clientId = r.body.id;
  const a = (await db.query(`SELECT action, "table" FROM audit_log ORDER BY id DESC LIMIT 1`)).rows[0];
  assert.deepEqual(a, { action: "insert", table: "clients" });
});

test("preview auto-maps the fixture; import stores 28 entries; re-import is de-duplicated on (client, entry_no)", async () => {
  const pv = await j("POST", "/api/entries/preview", { csv, clientId });
  assert.equal(pv.status, 200); assert.equal(pv.body.rowCount, 28);
  assert.deepEqual(Object.fromEntries(Object.entries(pv.body.map).map(([k, i]) => [k, pv.body.headers[i]])), expected.mapping);
  const im = await j("POST", "/api/entries/import", { csv, clientId });
  assert.deepEqual(im.body, { imported: 28, skipped: 0, duplicates: 0, client: expected.client.company });
  const again = await j("POST", "/api/entries/import", { csv, clientId });
  assert.equal(again.body.imported, 0); assert.equal(again.body.duplicates, 28);
  const src = (await db.query("SELECT liquidation_source, count(*)::int AS n FROM entries GROUP BY 1 ORDER BY 1")).rows;
  assert.deepEqual(src, [{ liquidation_source: "broker", n: 21 }, { liquidation_source: "estimated", n: 7 }]);
  const saved = (await db.query("SELECT mapping FROM broker_mappings WHERE broker_name=$1", [expected.client.broker])).rows;
  assert.equal(saved.length, 1, "mapping remembered per broker");
  const pv2 = await j("POST", "/api/entries/preview", { csv, clientId }); assert.equal(pv2.body.savedMapping, true);
});

test("/api/state reproduces the prototype: phases, deadlines, KPIs, tasks", async () => {
  const { status, body } = await j("GET", "/api/state" + ASOF);
  assert.equal(status, 200); assert.equal(body.asOf, "2026-09-13");
  const got = body.entries.map(e => [e.entry, e.computed.cls.kind, e.computed.phase, e.computed.deadline, e.computed.days, e.computed.est, e.computed.duty]);
  assert.deepEqual(got, expected.entries);
  const k = Object.fromEntries(body.dash.kpis.map(([l, v]) => [l, v]));
  assert.equal(k["IEEPA duty logged"], "$726,900"); assert.equal(k["Phase 1 — filable now"], "$427,350"); assert.equal(k["Protest required"], "$174,550"); assert.equal(k["Phase 3 · contested"], "$125,000");
  assert.equal(k["Estimated liq. dates"], 7); assert.equal(k["Non-IEEPA lines excluded"], 1); assert.equal(k["Urgent entries"], 3); assert.equal(k["Expected net fee"], "$49,205");
  assert.deepEqual(body.tasks.map(t => ({ id: t.id, who: t.who, hot: t.hot, t: t.t })), expected.tasks);
  assert.equal(body.clients[0].stats.total, 726900);
});

test("every computed figure is stored with its rule version", async () => {
  const rows = (await db.query("SELECT c.phase, c.is_estimated, c.rule_version_id, c.ieepa_duty::float AS d FROM computed c JOIN entries e ON e.id=c.entry_id ORDER BY e.entry_no")).rows;
  assert.equal(rows.length, 28);
  assert.ok(rows.every(r => r.rule_version_id === rows[0].rule_version_id));
  assert.equal(rows.filter(r => r.is_estimated).length, 7);
  assert.equal(rows.reduce((a, r) => a + r.d, 0), 726900);
});

test("task done flags persist by key across regeneration", async () => {
  const key = expected.client.company + "|ach";
  const r = await j("POST", "/api/tasks/done", { key, done: true }); assert.equal(r.status, 200);
  const s = await j("GET", "/api/state" + ASOF);
  assert.equal(s.body.tasks.find(t => t.id === key).done, true);
  assert.equal(s.body.tasks.filter(t => t.done).length, 1);
  await j("POST", "/api/tasks/done", { key, done: false });
});

test("HARD BLOCK: client-facing findings return 409 while 7 IEEPA entries are estimated; internal draft says so", async () => {
  const r = await j("POST", `/api/documents${ASOF}`, { clientId, type: "FS" });
  assert.equal(r.status, 409); assert.equal(r.body.code, "FINDINGS_BLOCKED"); assert.equal(r.body.estimated, 7);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM documents")).rows[0].n, 0, "nothing stored");
  const d = await j("GET", `/api/findings/${clientId}/preview${ASOF}`);
  assert.equal(d.body.blocked, true); assert.ok(d.body.html.includes("DRAFT — not for release"));
});

test("block lifts once ACE dates land; findings sheet is generated as a document with ref CM-FS-YYYY-NNN and rule version", async () => {
  await db.query("UPDATE entries SET liquidation_date = entry_date + 314, liquidation_source='ace' WHERE liquidation_source='estimated'");
  const r = await j("POST", `/api/documents${ASOF}`, { clientId, type: "FS", params: {}, pdf: false });
  assert.equal(r.status, 200); assert.equal(r.body.ref, "CM-FS-2026-001"); assert.ok(r.body.html.includes("IEEPA duty identified: <strong>$726,900</strong>"));
  const doc = (await db.query("SELECT ref, type, rule_version_id, to_char(as_of,'YYYY-MM-DD') AS as_of FROM documents")).rows[0];
  assert.equal(doc.ref, "CM-FS-2026-001"); assert.equal(doc.type, "FS"); assert.ok(doc.rule_version_id); assert.equal(doc.as_of, "2026-09-13");
  const s = await j("GET", "/api/state" + ASOF);
  assert.equal(Object.fromEntries(s.body.dash.kpis.map(([l, v]) => [l, v]))["Estimated liq. dates"], 0);
});

test("dev fixture loader is idempotent and export.csv carries phase + rule version", async () => {
  const r = await j("POST", "/api/dev/load-fixture"); assert.equal(r.body.duplicates, 28);
  const x = await app.inject({ method: "GET", url: "/api/entries/export.csv" + ASOF });
  assert.equal(x.statusCode, 200); assert.ok(x.headers["content-type"].includes("text/csv"));
  const lines = x.body.trim().split("\n"); assert.equal(lines.length, 29); assert.ok(lines[0].includes("ruleVersion"));
});
