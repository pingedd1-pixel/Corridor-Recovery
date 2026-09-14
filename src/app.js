process.env.TZ ||= "America/Vancouver";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { loadState, snapshot, audit, recompute } from "./services/state.js";
import { parseCsv, ingestRows, headersFingerprint, autoMap } from "./ingest/mapping.js";
import { renderFindings, clientStats, FindingsBlockedError, phase, fmt, today } from "./engine/index.js";
import { generateDocument, listDocuments, getDocument } from "./documents/index.js";
import { TYPES } from "./documents/types.js";
import { closePdf } from "./documents/pdf.js";
import { createReadStream } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

export async function buildApp(db, { logger = { level: process.env.LOG_LEVEL || "info" }, dev = process.env.NODE_ENV !== "production" } = {}) {
const app = Fastify({ logger });
await app.register(fastifyStatic, { root: join(here, "public"), prefix: "/" });
app.setErrorHandler((err, req, reply) => {
  if (err instanceof FindingsBlockedError) return reply.code(409).send({ error: err.message, code: err.code, estimated: err.estimated });
  req.log.error(err); reply.code(err.statusCode || 500).send({ error: err.message });
});
const asOf = req => (req.query && req.query.asOf ? new Date(req.query.asOf + "T00:00:00") : today());

// ---------- read ----------
app.get("/api/state", async req => snapshot(db, asOf(req)));
app.get("/api/health", async () => ({ ok: true, db: db.kind, asOf: fmt(today()) }));

// ---------- clients ----------
const CLIENT_COLS = { company: "company", bucket: "bucket", contact: "contact", phone: "phone", email: "email", broker: "broker_name", stage: "stage", sales: "us_sales_window", share: "share_non_cusma", rate: "rate_paid", ach: "ach_status", signed: "engagement_signed_at", notes: "notes" };
const clientRow = async id => (await db.query("SELECT * FROM clients WHERE id=$1", [id])).rows[0];
const clientValues = async b => {
  const cols = [], vals = [];
  for (const [k, col] of Object.entries(CLIENT_COLS)) if (b[k] !== undefined) { cols.push(col); vals.push(["sales", "share", "rate"].includes(k) ? (b[k] === "" || b[k] == null ? null : Number(b[k])) : k === "signed" ? (b[k] || null) : b[k]); }
  if (b.ref !== undefined) { cols.push("referred_by_client_id"); vals.push(b.ref ? (await db.query("SELECT id FROM clients WHERE company=$1", [b.ref])).rows[0]?.id ?? null : null); }
  return { cols, vals };
};
app.post("/api/clients", async (req, reply) => {
  const b = req.body || {}; if (!b.company) return reply.code(400).send({ error: "company is required" });
  const { cols, vals } = await clientValues(b);
  const row = (await db.query(`INSERT INTO clients(${cols.join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`, vals)).rows[0];
  await audit(db, "insert", "clients", row.id, null, row); await recompute(db);
  return row;
});
app.put("/api/clients/:id", async (req, reply) => {
  const before = await clientRow(req.params.id); if (!before) return reply.code(404).send({ error: "not found" });
  const { cols, vals } = await clientValues(req.body || {}); if (!cols.length) return before;
  const row = (await db.query(`UPDATE clients SET ${cols.map((c, i) => `${c}=$${i + 1}`).join(",")}, updated_at=now() WHERE id=$${cols.length + 1} RETURNING *`, [...vals, req.params.id])).rows[0];
  await audit(db, "update", "clients", row.id, before, row); await recompute(db);
  return row;
});
app.delete("/api/clients/:id", async (req, reply) => {
  const before = await clientRow(req.params.id); if (!before) return reply.code(404).send({ error: "not found" });
  await db.query("DELETE FROM clients WHERE id=$1", [req.params.id]); await audit(db, "delete", "clients", req.params.id, before, null); await recompute(db);
  return { ok: true };
});

// ---------- entries: CSV preview / import ----------
app.post("/api/entries/preview", async (req, reply) => {
  const { csv, clientId } = req.body || {}; if (!csv) return reply.code(400).send({ error: "csv is required" });
  const { headers, rows, map } = parseCsv(csv); if (!headers.length) return reply.code(400).send({ error: "No rows found." });
  let saved = null;
  if (clientId) { const c = await clientRow(clientId); if (c?.broker_name) { const m = (await db.query("SELECT mapping FROM broker_mappings WHERE broker_name=$1 AND headers_fingerprint=$2", [c.broker_name, headersFingerprint(headers)])).rows[0]; if (m) saved = typeof m.mapping === "string" ? JSON.parse(m.mapping) : m.mapping; } }
  return { headers, rowCount: rows.length, map: saved || map, savedMapping: !!saved, sample: rows.slice(0, 3) };
});
app.post("/api/entries/import", async (req, reply) => {
  const { csv, clientId, map: userMap, source = "broker" } = req.body || {};
  const c = await clientRow(clientId); if (!c) return reply.code(400).send({ error: "Add a client first, then import." });
  const { headers, rows } = parseCsv(csv); if (!headers.length) return reply.code(400).send({ error: "No rows found." });
  const map = userMap && Object.keys(userMap).length ? userMap : autoMap(headers);
  const { entries, skipped } = ingestRows(rows, map, c.company);
  let imported = 0, duplicates = 0;
  for (const e of entries) {
    const liq = e.liqDate || null;
    const r = await db.query(`INSERT INTO entries(client_id, entry_no, entry_date, port, hts, hts_base, entered_value, duty_rate, duty_amount, liquidation_date, liquidation_source, consignee_name, ior_name, raw_row)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (client_id, entry_no) DO NOTHING RETURNING id`,
      [c.id, e.entry, e.entryDate || null, e.port || null, e.hts || null, e.htsBase || null, e.value, e.rate === "" ? null : e.rate, e.duty, liq, liq ? (source === "ace" ? "ace" : "broker") : "estimated", e.consignee || null, e.ior || null, JSON.stringify(e.raw)]);
    if (r.rows.length) { imported++; await audit(db, "insert", "entries", r.rows[0].id, null, { entry_no: e.entry, client_id: c.id, source }); } else duplicates++;
  }
  if (c.broker_name) await db.query("INSERT INTO broker_mappings(broker_name, headers_fingerprint, mapping) VALUES ($1,$2,$3) ON CONFLICT (broker_name, headers_fingerprint) DO UPDATE SET mapping=EXCLUDED.mapping", [c.broker_name, headersFingerprint(headers), JSON.stringify(map)]);
  await recompute(db);
  return { imported, skipped, duplicates, client: c.company };
});
app.delete("/api/entries/:id", async (req, reply) => {
  const before = (await db.query("SELECT * FROM entries WHERE id=$1", [req.params.id])).rows[0]; if (!before) return reply.code(404).send({ error: "not found" });
  await db.query("DELETE FROM entries WHERE id=$1", [req.params.id]); await audit(db, "delete", "entries", req.params.id, before, null); await recompute(db);
  return { ok: true };
});
app.get("/api/entries/export.csv", async (req, reply) => {
  const s = await loadState(db, asOf(req));
  const rows = [["entry", "client", "entryDate", "hts", "htsBase", "value", "rate", "liqDate", "liqSource", "consignee", "ieepaDuty", "phase", "deadline", "daysRemaining", "estimated", "ruleVersion"]]
    .concat(s.entries.map(e => { const p = phase(e, s.rules, s.t); return [e.entry, e.client, e.entryDate, e.hts, e.htsBase, e.value, e.rate, e.liqDate, e.liqSource, e.consignee, p.na ? "" : Math.round(p.duty), p.phase, fmt(p.deadline), p.days ?? "", p.est ? "Y" : "N", s.ruleVersionId]; }));
  reply.header("Content-Type", "text/csv").header("Content-Disposition", `attachment; filename="corridor-entries-${fmt(s.t)}.csv"`);
  return Papa.unparse(rows);
});

// ---------- tasks ----------
app.post("/api/tasks/done", async (req, reply) => {
  const { key, done } = req.body || {}; if (!key) return reply.code(400).send({ error: "key is required" });
  const before = (await db.query("SELECT * FROM tasks WHERE key=$1", [key])).rows[0]; if (!before) return reply.code(404).send({ error: "no such task" });
  const row = (await db.query("UPDATE tasks SET done_at=$2 WHERE key=$1 RETURNING *", [key, done ? new Date() : null])).rows[0];
  await audit(db, done ? "task.done" : "task.undone", "tasks", row.id, before, row); await recompute(db);
  return row;
});

// ---------- documents (BUILD_SPEC §4). Hard block for figure-bearing types lives in generateDocument ----------
app.get("/api/documents/types", async () => Object.entries(TYPES).map(([type, t]) => ({ type, name: t.name, carriesFigures: t.carriesFigures, needs: t.needs })));
app.get("/api/documents", async req => listDocuments(db, req.query.clientId ? Number(req.query.clientId) : null));
app.post("/api/documents", async (req, reply) => {
  const { clientId, type, params, pdf } = req.body || {}; if (!clientId || !type) return reply.code(400).send({ error: "clientId and type are required" });
  const d = await generateDocument(db, { clientId, type, params: params || {}, asOf: asOf(req), pdf: pdf !== false }); // throws FindingsBlockedError → 409
  return d;
});
app.get("/api/documents/:id", async (req, reply) => { const d = await getDocument(db, req.params.id); if (!d) return reply.code(404).send({ error: "not found" }); return d; });
app.get("/api/documents/:id/pdf", async (req, reply) => {
  const d = await getDocument(db, req.params.id); if (!d || !d.pdfPath) return reply.code(404).send({ error: "no PDF for this document" });
  reply.header("Content-Type", "application/pdf").header("Content-Disposition", `inline; filename="${d.ref}.pdf"`);
  return reply.send(createReadStream(d.pdfPath));
});
app.addHook("onClose", async () => { await closePdf(); });
// Preview (internal, never client-facing): renders even when blocked, so the desk can see the draft. Marked as such.
app.get("/api/findings/:clientId/preview", async (req, reply) => {
  const s = await loadState(db, asOf(req));
  const c = s.clients.find(x => String(x.id) === String(req.params.clientId)); if (!c) return reply.code(404).send({ error: "not found" });
  const st = clientStats(c, s.entries, s.rules, s.t);
  return { blocked: st.est > 0, estimated: st.est, html: renderFindings(c, s.entries, s.rules, "DRAFT — not for release", s.t) };
});

// ---------- dev: load the simulation fixture (docs/fixtures-sim-broker-entry-report.csv) ----------
if (dev) {
  app.post("/api/dev/load-fixture", async () => {
    const company = "Fraser Valley Cabinetry Ltd";
    let c = (await db.query("SELECT * FROM clients WHERE company=$1", [company])).rows[0];
    if (!c) { c = (await db.query(`INSERT INTO clients(company, bucket, contact, phone, broker_name, stage, us_sales_window, share_non_cusma, rate_paid, ach_status, notes) VALUES ($1,'A — exporter as IOR','Dana Fraser','604-000-0100','Sim Broker Ltd','Data in',1500000,0.6,0.35,'No','Simulation fixture (docs/fixtures-sim-broker-entry-report.csv)') RETURNING *`, [company])).rows[0]; await audit(db, "insert", "clients", c.id, null, c); }
    const csv = readFileSync(join(here, "..", "docs", "fixtures-sim-broker-entry-report.csv"), "utf8");
    const res = await app.inject({ method: "POST", url: "/api/entries/import", payload: { csv, clientId: c.id } });
    return res.json();
  });
  app.post("/api/dev/reset", async () => { await db.exec("DELETE FROM entries; DELETE FROM clients; DELETE FROM tasks; DELETE FROM documents;"); await audit(db, "dev.reset", "*", null, null, null); return { ok: true }; });
}

return app;
}
