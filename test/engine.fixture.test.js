// Acceptance test (CLAUDE.md "Tests"): run docs/fixtures-sim-broker-entry-report.csv through the
// engine and assert phases and deadlines against the prototype's own output for asOf = 2026-09-13.
process.env.TZ = "America/Vancouver";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, ingestRows } from "../src/ingest/mapping.js";
import { phase, clientStats, tasks, dashboard, renderFindings, generateFindings, FindingsBlockedError, classify, fmt, D } from "../src/engine/index.js";

const expected = JSON.parse(readFileSync(new URL("./fixtures/expected-sim-broker-2026-09-13.json", import.meta.url), "utf8"));
const csv = readFileSync(new URL("../docs/fixtures-sim-broker-entry-report.csv", import.meta.url), "utf8");
const RULES = { prot: 180, p1: 80, lag: 314, urg: 30, fee1: 0.10, fee2: 0.225, brok: 0.25, real: 0.8 };
const asOf = D(expected.asOf);
const client = expected.client;

function load() {
  const { headers, rows, map } = parseCsv(csv);
  const { entries, skipped } = ingestRows(rows, map, client.company);
  return { headers, map, entries, skipped };
}

test("auto-mapping picks the Chapter 99 line and duties paid (not the base HTS / duty rate)", () => {
  const { headers, map } = load();
  const mapped = Object.fromEntries(Object.entries(map).map(([k, i]) => [k, headers[i]]));
  assert.deepEqual(mapped, expected.mapping);
});

test("fixture ingests 28 entries, none skipped", () => {
  const { entries, skipped } = load();
  assert.equal(entries.length, 28); assert.equal(skipped, 0);
  assert.equal(entries[0].duty, 22750); assert.equal(entries[0].rate, 0.25); assert.equal(entries[0].hts, "9903.01.10"); assert.equal(entries[0].htsBase, "9403.40.9060");
});

test("phase(): classification, phase, deadline, days, estimated flag and IEEPA duty match the prototype for every entry", () => {
  assert.equal(expected.prototypeVersion, "Desk v0.2.1");
  const { entries } = load();
  const got = entries.map(e => { const p = phase(e, RULES, asOf); return [e.entry, p.cls.kind, p.phase, fmt(p.deadline), p.days, p.est, p.duty]; });
  assert.deepEqual(got, expected.entries);
});

test("estimated liquidation = entry date + lag, and the row is flagged", () => {
  const { entries } = load();
  for (const [no, liqEff] of Object.entries(expected.estimatedLiqEff)) {
    const e = entries.find(x => x.entry === no); const p = phase(e, RULES, asOf);
    assert.equal(p.est, true); assert.equal(fmt(p.liqEff), liqEff);
  }
  const ace = entries.filter(e => e.liqDate); assert.ok(ace.length === 21);
  for (const e of ace) assert.equal(phase(e, RULES, asOf).est, false, e.entry);
});

test("non-IEEPA Chapter 99 line (9903.81.90, s232) is excluded from every total", () => {
  const { entries } = load();
  const e = entries.find(x => x.entry === "KJ7-4408817-8");
  const p = phase(e, RULES, asOf);
  assert.equal(p.na, true); assert.equal(p.duty, 0); assert.equal(p.phase, "Not IEEPA");
  const st = clientStats(client, entries, RULES, asOf);
  assert.equal(st.total, 726900); // 36,750 of 232 duty is not in here
});

test("classify() table", () => {
  assert.equal(classify("9903.01.10").kind, "ieepa");
  assert.equal(classify("9903.01.25").kind, "ieepa");
  for (const h of ["9903.80.01", "9903.81.90", "9903.85.02", "9903.78.01"]) assert.equal(classify(h).kind, "s232", h);
  for (const h of ["9903.88.01", "9903.89.01", "9903.90.01", "9903.91.01"]) assert.equal(classify(h).kind, "s301", h);
  assert.equal(classify("9903.94.01").kind, "autos");
  assert.equal(classify("9903.02.01").kind, "other99");
  assert.equal(classify("9403.40.9060").kind, "base");
  assert.equal(classify("").kind, "unknown");
});

test("clientStats() totals, next clock, consignees", () => {
  const { entries } = load();
  const st = clientStats(client, entries, RULES, asOf);
  const got = { count: st.es.length, p1: st.p1, pr: st.pr, gone: st.gone, na: st.na, est: st.est, min: st.min, past: st.past, exposure: st.exposure, fee: st.fee, total: st.total, next: { entry: st.next.e.entry, days: st.next.p.days, deadline: fmt(st.next.p.deadline) }, consignees: st.consignees };
  assert.deepEqual(got, expected.stats);
});

test("dashboard() KPIs", () => {
  const { entries } = load();
  const d = dashboard([client], entries, RULES, asOf);
  const got = { duty: d.duty, p1: d.p1, pr: d.pr, gone: d.gone, urg: d.urg, past: d.past, est: d.est, na: d.na, gross: d.gross, net: d.net };
  assert.deepEqual(got, expected.dash);
  assert.equal(d.clocks.length, 14);
  assert.equal(d.clocks[0].e.entry, "KJ7-4408825-7");
});

test("tasks() generated from state, verbatim text, hot flags, done persists by key", () => {
  const { entries } = load();
  const got = tasks([client], entries, {}, RULES, asOf).map(t => ({ id: t.id, who: t.who, hot: !!t.hot, t: t.t }));
  assert.deepEqual(got, expected.tasks);
  const done = tasks([client], entries, { "Fraser Valley Cabinetry Ltd|ach": true }, RULES, asOf);
  assert.equal(done.find(t => t.id.endsWith("|ach")).done, true);
  assert.equal(done.filter(t => t.done).length, 1);
});

test("renderFindings() reproduces the prototype's findings sheet", () => {
  const { entries } = load();
  const html = renderFindings(client, entries, RULES, "CM-FS-2026-001", asOf);
  for (const s of expected.findingsIncludes) assert.ok(html.includes(s), "missing: " + s);
  const rows = (html.match(/<tr><td>([^<]+)<\/td><td class="n">\$[\d,]+<\/td>/g) || []).map(x => x.match(/<td>([^<]+)</)[1]);
  assert.deepEqual(rows, expected.findingsRows, "findings sheet category rows (v0.2.1: Phase 3, not Deadline passed)");
  assert.ok(html.includes("As of 2026-09-13"));
  assert.ok(!/guarantee[^ ]* (of|to)/.test(html.replace("not a guarantee of recovery", "")), "no guarantees in copy");
});

test("HARD BLOCK: no client-facing findings while any IEEPA entry is estimated; lifts when ACE dates land", () => {
  const { entries } = load();
  assert.throws(() => generateFindings(client, entries, RULES, "CM-FS-2026-001", asOf), err => err instanceof FindingsBlockedError && err.estimated === 7 && err.code === "FINDINGS_BLOCKED");
  const confirmed = entries.map(e => e.liqDate ? e : { ...e, liqDate: fmt(phase(e, RULES, asOf).liqEff) });
  const { html, stats } = generateFindings(client, confirmed, RULES, "CM-FS-2026-001", asOf);
  assert.equal(stats.est, 0); assert.ok(html.includes("IEEPA duty identified"));
  // a non-IEEPA estimated row must not block (it is excluded from everything)
  const onlyNaEstimated = entries.map(e => e.entry === "KJ7-4408817-8" ? { ...e, liqDate: "" } : (e.liqDate ? e : { ...e, liqDate: fmt(phase(e, RULES, asOf).liqEff) }));
  assert.doesNotThrow(() => generateFindings(client, onlyNaEstimated, RULES, "CM-FS-2026-001", asOf));
});

test("rules are inputs, not constants: changing the Phase 1 window moves entries between phases", () => {
  const { entries } = load();
  const e = entries.find(x => x.entry === "KJ7-4408830-5"); // liquidated 2026-09-09, 4 days ago
  assert.equal(phase(e, RULES, asOf).phase, "Phase 1 — recently liquidated");
  assert.equal(phase(e, { ...RULES, p1: 3 }, asOf).phase, "Protest required");
  assert.equal(phase({ ...e, liqDate: "2026-01-01" }, RULES, asOf).phase, "Phase 3 — finally liquidated (contested on appeal)");
  assert.equal(fmt(phase(e, { ...RULES, p1: 3 }, asOf).deadline), "2027-03-08");
});
