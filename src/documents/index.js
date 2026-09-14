// Document generation: allocate the reference, enforce the hard block for figure-bearing documents,
// render on the template, store the HTML with its rule version, render the PDF, log it.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { clientStats, FindingsBlockedError, fmt, today } from "../engine/index.js";
import { loadState, audit } from "../services/state.js";
import { TYPES, render } from "./types.js";
import { page } from "./shell.js";
import { htmlToPdf } from "./pdf.js";

export const documentsDir = () => process.env.DOCUMENTS_DIR || "./data/documents";

export async function nextRef(db, type, year) {
  const prefix = `CM-${type}-${year}-`;
  const { rows } = await db.query("SELECT ref FROM documents WHERE ref LIKE $1 ORDER BY ref DESC LIMIT 1", [prefix + "%"]);
  const n = rows.length ? Number(rows[0].ref.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(3, "0");
}

export async function generateDocument(db, { clientId, type, params = {}, asOf = today(), userId = null, pdf = true }) {
  const t = TYPES[type]; if (!t) throw Object.assign(new Error("unknown document type"), { statusCode: 400 });
  const s = await loadState(db, asOf);
  const c = s.clients.find(x => String(x.id) === String(clientId)); if (!c) throw Object.assign(new Error("client not found"), { statusCode: 404 });
  if (t.carriesFigures) { const st = clientStats(c, s.entries, s.rules, asOf); if (st.est > 0) throw new FindingsBlockedError(c.company, st.est); }
  const ref = await nextRef(db, type, asOf.getFullYear());
  const { title, body } = render(type, { c, entries: s.entries, rules: s.rules, asOf, ref, params });
  const html = page({ title, body });
  const row = (await db.query(`INSERT INTO documents(client_id, ref, type, title, html, rule_version_id, created_by, as_of, params) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, ref, type, title, created_at`,
    [c.id, ref, type, title, html, s.ruleVersionId, userId, fmt(asOf), JSON.stringify(params)])).rows[0];
  let pdfPath = null;
  if (pdf) {
    const dir = documentsDir(); mkdirSync(dir, { recursive: true });
    const bytes = await htmlToPdf(html, { ref });
    pdfPath = join(dir, ref + ".pdf"); writeFileSync(pdfPath, bytes);
    await db.query("UPDATE documents SET pdf_url=$2 WHERE id=$1", [row.id, `/api/documents/${row.id}/pdf`]);
  }
  await audit(db, "generate", "documents", row.id, null, { ref, type, client_id: c.id, rule_version_id: s.ruleVersionId, as_of: fmt(asOf), params }, userId);
  return { id: row.id, ref, type, title, html, pdfUrl: pdf ? `/api/documents/${row.id}/pdf` : null, pdfPath, ruleVersionId: s.ruleVersionId, asOf: fmt(asOf), client: c.company };
}

export async function listDocuments(db, clientId) {
  const { rows } = await db.query("SELECT id, client_id, ref, type, title, pdf_url, rule_version_id, to_char(as_of,'YYYY-MM-DD') AS as_of, params, created_at FROM documents WHERE ($1::int IS NULL OR client_id=$1) ORDER BY created_at DESC, id DESC", [clientId ?? null]);
  return rows.map(r => ({ ...r, typeName: TYPES[r.type]?.name || r.type, params: typeof r.params === "string" ? JSON.parse(r.params) : r.params }));
}
export async function getDocument(db, id) {
  const { rows } = await db.query("SELECT id, client_id, ref, type, title, html, pdf_url, rule_version_id, to_char(as_of,'YYYY-MM-DD') AS as_of FROM documents WHERE id=$1", [id]);
  const r = rows[0]; if (!r) return null;
  const p = join(documentsDir(), r.ref + ".pdf"); return { ...r, pdfPath: existsSync(p) ? p : null };
}
