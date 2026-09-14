// M2 documents: five types on the Corridor template, CM-TYPE-YYYY-NNN references, As-of date, rule version,
// hard block on figure-bearing documents, PDF rendering, voice rules.
process.env.TZ = "America/Vancouver";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, migrate } from "../src/db/index.js";
import { buildApp } from "../src/app.js";
import { closePdf } from "../src/documents/pdf.js";
import { TYPES } from "../src/documents/types.js";

process.env.DOCUMENTS_DIR = mkdtempSync(join(tmpdir(), "corridor-docs-"));
const csv = readFileSync(new URL("../docs/fixtures-sim-broker-entry-report.csv", import.meta.url), "utf8");
const ASOF = "?asOf=2026-09-13";
const BANNED = [/guarantee(?!.{0,3}(of|to)?)/i, /trusted partner/i, /world-class/i, /leverage/i, /synergy/i, /!/];
let db, app, clientId;
before(async () => {
  db = await openDb({ memory: true }); await migrate(db); app = await buildApp(db, { logger: false, dev: true });
  const c = await app.inject({ method: "POST", url: "/api/clients", payload: { company: "Fraser Valley Cabinetry Ltd", bucket: "A — exporter as IOR", contact: "Dana Fraser", broker: "Sim Broker Ltd", stage: "Data in", sales: 1500000, share: 0.6, rate: 0.35, ach: "No" } });
  clientId = c.json().id;
  await app.inject({ method: "POST", url: "/api/entries/import", payload: { csv, clientId } });
});
after(async () => { await app.close(); await closePdf(); await db.close(); });
const gen = (type, params = {}, extra = {}) => app.inject({ method: "POST", url: "/api/documents" + ASOF, payload: { clientId, type, params, ...extra } }).then(r => ({ status: r.statusCode, body: r.json() }));
const stripTags = h => h.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");

test("types registry: FS and CN carry figures; BI needs a consignee", async () => {
  const r = await app.inject({ method: "GET", url: "/api/documents/types" });
  const t = Object.fromEntries(r.json().map(x => [x.type, x]));
  assert.deepEqual(Object.keys(t).sort(), ["AU", "BI", "CN", "EL", "FS"]);
  assert.equal(t.FS.carriesFigures, true); assert.equal(t.CN.carriesFigures, true); assert.equal(t.EL.carriesFigures, false);
  assert.deepEqual(t.BI.needs, ["consignee"]);
});

test("HARD BLOCK applies to every figure-bearing document while 7 IEEPA entries are estimated; others generate", async () => {
  for (const type of ["FS", "CN"]) { const r = await gen(type, {}, { pdf: false }); assert.equal(r.status, 409, type); assert.equal(r.body.code, "FINDINGS_BLOCKED"); }
  assert.equal((await db.query("SELECT count(*)::int AS n FROM documents")).rows[0].n, 0);
  const el = await gen("EL", {}, { pdf: false }); assert.equal(el.status, 200); assert.equal(el.body.ref, "CM-EL-2026-001");
  const au = await gen("AU", {}, { pdf: false }); assert.equal(au.status, 200); assert.equal(au.body.ref, "CM-AU-2026-001");
  assert.ok(au.body.html.includes("Sim Broker Ltd"), "authorization names the client's broker");
  assert.ok(el.body.html.includes("10% of the refund") && el.body.html.includes("22.5% of the refund"), "fees come from the rules table");
});

test("bucket-B intro needs a consignee and is written under the client's name", async () => {
  const bad = await gen("BI", {}, { pdf: false }); assert.equal(bad.status, 400);
  const r = await gen("BI", { consignee: "Pacific Home Products LLC" }, { pdf: false });
  assert.equal(r.status, 200); assert.equal(r.body.ref, "CM-BI-2026-001");
  const text = stripTags(r.body.html);
  assert.ok(text.includes("Pacific Home Products LLC")); assert.ok(text.includes("we count 13 entries")); assert.ok(text.includes("Dana Fraser"));
  const row = (await db.query("SELECT params FROM documents WHERE ref='CM-BI-2026-001'")).rows[0];
  assert.equal((typeof row.params === "string" ? JSON.parse(row.params) : row.params).consignee, "Pacific Home Products LLC");
});

test("references increment per type per year; As-of and rule version are stored", async () => {
  const a = await gen("AU", {}, { pdf: false }); assert.equal(a.body.ref, "CM-AU-2026-002");
  const rows = (await db.query("SELECT ref, to_char(as_of,'YYYY-MM-DD') AS as_of, rule_version_id FROM documents ORDER BY id")).rows;
  assert.ok(rows.every(r => r.as_of === "2026-09-13" && r.rule_version_id));
  const list = await app.inject({ method: "GET", url: "/api/documents?clientId=" + clientId });
  assert.equal(list.json().length, 4); assert.equal(list.json()[0].ref, "CM-AU-2026-002");
});

test("once ACE dates land, FS and CN generate; every document carries mark, doc line, As of, ref, footer line", async () => {
  await db.query("UPDATE entries SET liquidation_date = entry_date + 314, liquidation_source='ace' WHERE liquidation_source='estimated'");
  const fs = await gen("FS", {}, { pdf: false }); assert.equal(fs.status, 200); assert.equal(fs.body.ref, "CM-FS-2026-001");
  const cn = await gen("CN", { findingsRef: fs.body.ref }, { pdf: false }); assert.equal(cn.status, 200); assert.equal(cn.body.ref, "CM-CN-2026-001");
  const text = stripTags(cn.body.html);
  assert.ok(text.includes("in the range of $726,900")); assert.ok(text.includes("$427,350")); assert.ok(text.includes("$174,550")); assert.ok(text.includes("One ask:")); assert.ok(text.includes("CM-FS-2026-001"));
  for (const d of (await db.query("SELECT ref, type, html FROM documents")).rows) {
    assert.ok(d.html.includes("<b>CORRIDOR</b><span>RECOVERY</span>"), d.ref + " mark");
    assert.ok(d.html.includes("As of 2026-09-13"), d.ref + " as of");
    assert.ok(d.html.includes(d.ref), d.ref + " ref");
    assert.ok(d.html.includes("IBM+Plex+Sans"), d.ref + " font");
    assert.ok(d.html.includes("Corridor Recovery, a trade name of [1234567 B.C. Ltd.]"), d.ref + " footer");
    const t = stripTags(d.html).replace(/not a guarantee of (recovery|any refund)/g, "").replace(/does not guarantee any recovery/g, "");
    for (const re of BANNED) assert.ok(!re.test(t), `${d.ref} (${d.type}) contains banned copy ${re}`);
  }
});

test("PDF: rendered on Letter with the footer, stored by reference, served by the API", async () => {
  const r = await gen("AU"); assert.equal(r.status, 200); assert.equal(r.body.ref, "CM-AU-2026-003");
  assert.ok(existsSync(r.body.pdfPath)); assert.ok(r.body.pdfPath.endsWith("CM-AU-2026-003.pdf"));
  const bytes = readFileSync(r.body.pdfPath); assert.equal(bytes.subarray(0, 4).toString(), "%PDF"); assert.ok(bytes.length > 5000);
  const doc = (await db.query("SELECT pdf_url FROM documents WHERE ref='CM-AU-2026-003'")).rows[0]; assert.equal(doc.pdf_url, r.body.pdfUrl);
  const get = await app.inject({ method: "GET", url: r.body.pdfUrl });
  assert.equal(get.statusCode, 200); assert.equal(get.headers["content-type"], "application/pdf"); assert.ok(get.headers["content-disposition"].includes("CM-AU-2026-003.pdf"));
  assert.equal(get.rawPayload.subarray(0, 4).toString(), "%PDF");
  const none = await app.inject({ method: "GET", url: "/api/documents/999/pdf" }); assert.equal(none.statusCode, 404);
  const a = (await db.query(`SELECT action, after FROM audit_log WHERE "table"='documents' ORDER BY id DESC LIMIT 1`)).rows[0];
  assert.equal(a.action, "generate"); assert.equal((typeof a.after === "string" ? JSON.parse(a.after) : a.after).ref, "CM-AU-2026-003");
});
