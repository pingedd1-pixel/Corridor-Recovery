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
const BANNED = [/guarantee/i, /trusted partner/i, /world-class/i, /leverage/i, /synergy/i, /!/];
const ALLOWED = [/not a guarantee of (recovery|any refund)/g, /does not guarantee any recovery/g, /No guarantee/g];
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
  assert.deepEqual(Object.keys(t).sort(), ["AU", "BI", "BSA", "CN", "EL", "FS", "NDA"]);
  assert.equal(t.BSA.counterparty, "broker"); assert.deepEqual(t.BSA.needs, ["brokerName"]);
  assert.equal(t.FS.carriesFigures, true); assert.equal(t.CN.carriesFigures, true); assert.equal(t.EL.carriesFigures, false);
  assert.deepEqual(t.BI.needs, ["consignee"]);
});

test("HARD BLOCK applies to every figure-bearing document while 7 IEEPA entries are estimated; others generate", async () => {
  for (const type of ["FS", "CN"]) { const r = await gen(type, {}, { pdf: false }); assert.equal(r.status, 409, type); assert.equal(r.body.code, "FINDINGS_BLOCKED"); }
  assert.equal((await db.query("SELECT count(*)::int AS n FROM documents")).rows[0].n, 0);
  const el = await gen("EL", {}, { pdf: false }); assert.equal(el.status, 200); assert.equal(el.body.ref, "CM-EL-2026-001");
  const au = await gen("AU", {}, { pdf: false }); assert.equal(au.status, 200); assert.equal(au.body.ref, "CM-AU-2026-001");
  assert.ok(au.body.html.includes("Sim Broker Ltd"), "authorization names the client's broker");
  assert.ok(au.body.html.includes("valid for [12] months"), "AU validity is a bracketed placeholder");
  const elText = stripTags(el.body.html);
  assert.ok(elText.includes("10% of the refund received, including interest"), "Phase 1 fee is approved → plain");
  assert.ok(elText.includes("[22.5]% of the refund received"), "protest fee renders bracketed until counsel approves");
  assert.ok(elText.includes("[25]% of the amount recovered"), "Canadian recovery fee placeholder");
  assert.ok(elText.includes("for [12] months from signature") && elText.includes("on [30] days' written notice") && elText.includes("within [15] days"));
  assert.ok(elText.includes("[mediation, then arbitration in Vancouver]"));
  assert.ok(elText.includes("Learning Resources v. Trump") && elText.includes("5. No guarantee") && elText.includes("Schedule A"));
  const nda = await gen("NDA", {}, { pdf: false }); assert.equal(nda.status, 200); assert.equal(nda.body.ref, "CM-NDA-2026-001");
  const ndaText = stripTags(nda.body.html); assert.ok(ndaText.includes("within [30] days after the last matter closes") && ndaText.includes("[3] years from signature"));
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
  assert.equal(list.json().length, 5); assert.equal(list.json()[0].ref, "CM-AU-2026-002");
});

test("broker services agreement is a broker document: no client, broker name required, every fee a bracketed placeholder", async () => {
  const bad = await app.inject({ method: "POST", url: "/api/documents" + ASOF, payload: { type: "BSA", params: {}, pdf: false } });
  assert.equal(bad.statusCode, 400);
  const r = await app.inject({ method: "POST", url: "/api/documents" + ASOF, payload: { type: "BSA", params: { brokerName: "Northline Customs Brokers Inc", licenceNo: "12345" }, pdf: false } });
  assert.equal(r.statusCode, 200); const b = r.json(); assert.equal(b.ref, "CM-BSA-2026-001"); assert.equal(b.client, null); assert.equal(b.counterparty, "Northline Customs Brokers Inc");
  const t = stripTags(b.html);
  assert.ok(t.includes("flat fee of US$[ ] per Corridor Client for declarations covering up to [ ] entries"));
  assert.ok(t.includes("[ ]% of Corridor's collected contingency fee") && t.includes("[24] months after") && t.includes("[12] months, renewing annually"));
  assert.ok(t.includes("licence no. 12345") && t.includes("[British Columbia / the Broker's state — counsel to advise]"));
  const row = (await db.query("SELECT client_id, counterparty FROM documents WHERE ref='CM-BSA-2026-001'")).rows[0];
  assert.equal(row.client_id, null); assert.equal(row.counterparty, "Northline Customs Brokers Inc");
});

test("PK-approved terms (2026-09-14) render plain; still-pending terms stay bracketed", async () => {
  const el = await app.inject({ method: "POST", url: "/api/documents?asOf=2026-09-14", payload: { clientId, type: "EL", params: {}, pdf: false } });
  const t = stripTags(el.json().html);
  assert.ok(t.includes("22.5% of the refund received") && !t.includes("[22.5]%"), "protest fee approved");
  assert.ok(t.includes("25% of the amount recovered") && t.includes("for 12 months from signature") && t.includes("within 15 days") && t.includes("on [30] days' written notice"), "termination notice still pending counsel");
  assert.ok(t.includes("[mediation, then arbitration in Vancouver]"), "dispute clause still pending counsel");
  const nda = await app.inject({ method: "POST", url: "/api/documents?asOf=2026-09-14", payload: { clientId, type: "NDA", params: {}, pdf: false } });
  assert.ok(stripTags(nda.json().html).includes("within 30 days after the last matter closes"));
  const au = await app.inject({ method: "POST", url: "/api/documents?asOf=2026-09-14", payload: { clientId, type: "AU", params: {}, pdf: false } });
  assert.ok(au.json().html.includes("valid for [12] months"), "authorization validity still pending counsel");
});

test("approving a placeholder rule (new row, effective date) removes the brackets without touching the template", async () => {
  await db.query("UPDATE rules SET effective_to='2026-10-01' WHERE key='authorization_validity_months' AND effective_to IS NULL");
  await db.query("INSERT INTO rules(key, value, effective_from, source, approved_by) VALUES ('authorization_validity_months', 18, '2026-10-01', 'counsel letter 2026-09-30', 'counsel: J. Doe 2026-09-30')");
  const r = await app.inject({ method: "POST", url: "/api/documents?asOf=2026-10-02", payload: { clientId, type: "AU", params: {}, pdf: false } });
  assert.ok(r.json().html.includes("valid for 18 months"), "approved → plain value");
  const before = await app.inject({ method: "POST", url: "/api/documents" + ASOF, payload: { clientId, type: "AU", params: {}, pdf: false } });
  assert.ok(before.json().html.includes("valid for [12] months"), "as of an earlier date the placeholder still applies");
});

test("once ACE dates land, FS and CN generate; every document carries mark, doc line, As of, ref, footer line", async () => {
  await db.query("UPDATE entries SET liquidation_date = entry_date + 314, liquidation_source='ace' WHERE liquidation_source='estimated'");
  const fs = await gen("FS", {}, { pdf: false }); assert.equal(fs.status, 200); assert.equal(fs.body.ref, "CM-FS-2026-001");
  const cn = await gen("CN", { findingsRef: fs.body.ref }, { pdf: false }); assert.equal(cn.status, 200); assert.equal(cn.body.ref, "CM-CN-2026-001");
  const text = stripTags(cn.body.html);
  assert.ok(text.includes("in the range of $726,900")); assert.ok(text.includes("$427,350")); assert.ok(text.includes("$174,550")); assert.ok(text.includes("One ask:")); assert.ok(text.includes("CM-FS-2026-001"));
  for (const d of (await db.query("SELECT ref, type, html, to_char(as_of,'YYYY-MM-DD') AS as_of FROM documents")).rows) {
    assert.ok(d.html.includes("<b>CORRIDOR</b><span>RECOVERY</span>"), d.ref + " mark");
    assert.ok(d.html.includes("As of " + d.as_of), d.ref + " as of");
    assert.ok(d.html.includes(d.ref), d.ref + " ref");
    assert.ok(d.html.includes("IBM+Plex+Sans"), d.ref + " font");
    assert.ok(d.html.includes("Corridor Recovery, a trade name of [1234567 B.C. Ltd.]"), d.ref + " footer");
    let t = stripTags(d.html); for (const a of ALLOWED) t = t.replace(a, "");
    for (const re of BANNED) assert.ok(!re.test(t), `${d.ref} (${d.type}) contains banned copy ${re}`);
  }
});

test("PDF: rendered on Letter with the footer, stored by reference, served by the API", async () => {
  const r = await gen("AU"); assert.equal(r.status, 200); assert.equal(r.body.ref, "CM-AU-2026-006");
  assert.ok(existsSync(r.body.pdfPath)); assert.ok(r.body.pdfPath.endsWith("CM-AU-2026-006.pdf"));
  const bytes = readFileSync(r.body.pdfPath); assert.equal(bytes.subarray(0, 4).toString(), "%PDF"); assert.ok(bytes.length > 5000);
  const doc = (await db.query("SELECT pdf_url FROM documents WHERE ref='CM-AU-2026-006'")).rows[0]; assert.equal(doc.pdf_url, r.body.pdfUrl);
  const get = await app.inject({ method: "GET", url: r.body.pdfUrl });
  assert.equal(get.statusCode, 200); assert.equal(get.headers["content-type"], "application/pdf"); assert.ok(get.headers["content-disposition"].includes("CM-AU-2026-006.pdf"));
  assert.equal(get.rawPayload.subarray(0, 4).toString(), "%PDF");
  const bsa = await app.inject({ method: "POST", url: "/api/documents" + ASOF, payload: { type: "BSA", params: { brokerName: "Northline Customs Brokers Inc" } } });
  assert.equal(bsa.statusCode, 200); assert.ok(existsSync(bsa.json().pdfPath), "broker PDF written");
  const none = await app.inject({ method: "GET", url: "/api/documents/999/pdf" }); assert.equal(none.statusCode, 404);
  const a = (await db.query(`SELECT action, after FROM audit_log WHERE "table"='documents' ORDER BY id DESC LIMIT 1`)).rows[0];
  assert.equal(a.action, "generate"); assert.equal((typeof a.after === "string" ? JSON.parse(a.after) : a.after).ref, "CM-BSA-2026-002");
});
