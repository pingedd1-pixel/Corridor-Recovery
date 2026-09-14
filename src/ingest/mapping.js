// CSV auto-mapping. Aliases as in prototype/desk-v0.2.html, with two deliberate changes
// (documented in the M1 PR; the engine itself is untouched):
//  1. Exact header matches are claimed before substring matches, and a header claimed by one
//     field is not re-used by another. In the prototype "Duty Rate" satisfied both `rate` and
//     `duty` (substring "duty"), so duties-paid columns were silently ignored.
//  2. `hts` prefers a Chapter 99 column ("Chapter 99 HTS") over the base tariff line ("HTS Number").
//     Broker reports carry both; the engine classifies on the Chapter 99 line. The base line is kept as `htsBase`.
import Papa from "papaparse";
import { D, fmt } from "../engine/dates.js";

export const ALIASES = {
  entry: ["entry number", "entry no", "entry #", "entry_no", "entrynumber", "entry"],
  entryDate: ["entry date", "entry_date", "date of entry", "entry summary date", "import date"],
  hts: ["chapter 99 hts", "chapter 99", "ch. 99 hts", "ch 99 hts", "ch.99", "ch99", "9903", "hts", "htsus", "tariff", "hts number", "hts no", "classification"],
  htsBase: ["hts number", "hts no", "base hts", "hts", "htsus", "tariff", "classification"],
  value: ["entered value", "value", "entered_value", "customs value", "total entered value"],
  rate: ["rate", "duty rate", "ad valorem"],
  duty: ["duty", "duties paid", "ieepa duty", "duty amount", "total duty", "duties"],
  liqDate: ["liquidation date", "liq date", "liquidated", "liquidation"],
  consignee: ["consignee", "importer", "importer name", "ultimate consignee", "consignee name", "ior name"],
  ior: ["importer of record", "ior", "ior name"],
  port: ["port of entry", "port"],
  // classification flags (PK 2026-09-14; prototype v0.2.2 pending). Truthy cell = Y/yes/true/1/X.
  reconciliation_flag: ["reconciliation flag", "recon flag", "reconciliation indicator", "recon indicator", "reconciliation"],
  reconciliation_on_file: ["reconciliation on file", "recon on file", "reconciliation entry", "recon entry filed", "reconciliation filed"],
  surety_paid: ["surety paid", "paid by surety", "surety"],
  drawback_flag: ["drawback flag", "drawback claimed", "drawback"],
  adcvd_suspended: ["ad/cvd suspended", "adcvd suspended", "ad/cvd", "adcvd", "antidumping", "countervailing", "suspended liquidation"],
};
export const FLAG_KEYS = ["reconciliation_flag", "reconciliation_on_file", "surety_paid", "drawback_flag", "adcvd_suspended"];
export const truthy = v => /^(y|yes|true|t|1|x|✓)$/i.test(String(v ?? "").trim());
// Fields are resolved in this order so higher-value columns are claimed first.
const ORDER = ["entry", "entryDate", "liqDate", "hts", "htsBase", "value", "rate", "duty", "consignee", "ior", "port", "reconciliation_on_file", "reconciliation_flag", "surety_paid", "drawback_flag", "adcvd_suspended"];

export function autoMap(headers) {
  const norm = headers.map(h => String(h ?? "").toLowerCase().trim());
  const m = {}; const claimed = new Set();
  const claim = (k, i) => { m[k] = i; claimed.add(i); };
  // pass 1 — exact matches, alias priority order
  for (const k of ORDER) for (const a of ALIASES[k]) { if (m[k] != null) break; const i = norm.findIndex((l, j) => !claimed.has(j) && l === a); if (i >= 0) claim(k, i); }
  // pass 2 — substring matches, alias priority order, unclaimed headers only
  for (const k of ORDER) for (const a of ALIASES[k]) { if (m[k] != null) break; const i = norm.findIndex((l, j) => !claimed.has(j) && l.includes(a)); if (i >= 0) claim(k, i); }
  return m;
}

export function headersFingerprint(headers) {
  return headers.map(h => String(h ?? "").toLowerCase().trim()).join("|");
}

// Prototype ingestRows(), returning plain entry objects instead of pushing into S.entries.
export function ingestRows(rows, map, client) {
  const out = []; let skipped = 0;
  rows.forEach(r => {
    const g = k => map[k] != null ? String(r[map[k]] ?? "").trim() : ""; const entry = g("entry"); if (!entry) { skipped++; return; } const num = s => +String(s).replace(/[^0-9.\-]/g, "") || 0;
    let rate = num(g("rate")); if (rate > 1) rate = rate / 100; const val = num(g("value")), duty = g("duty") ? num(g("duty")) : null; if (!rate && duty && val) rate = duty / val;
    const flags = Object.fromEntries(FLAG_KEYS.map(k => [k, map[k] != null && truthy(g(k))]));
    out.push({ entry, client, entryDate: fmt(D(g("entryDate"))) || g("entryDate"), hts: g("hts"), htsBase: g("htsBase"), value: val, rate: rate || "", duty, liqDate: fmt(D(g("liqDate"))), consignee: g("consignee"), ior: g("ior"), port: g("port"), ...flags, raw: r });
  });
  return { entries: out, skipped };
}

export function parseCsv(text) {
  const res = Papa.parse(String(text), { skipEmptyLines: true });
  const rows = res.data; if (rows.length < 2) return { headers: [], rows: [], map: {} };
  const headers = rows[0]; return { headers, rows: rows.slice(1), map: autoMap(headers) };
}
