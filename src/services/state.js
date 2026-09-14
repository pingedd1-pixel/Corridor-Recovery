// Bridges the database and the engine. The engine works on prototype-shaped objects (see prototype/desk-v0.2.html);
// this module maps rows to that shape, computes, and writes back `computed` (with rule_version_id) and `tasks`.
import { phase, clientStats, tasks as genTasks, dashboard, fmt, today } from "../engine/index.js";
import { loadRules } from "../db/rules.js";
import { num } from "../db/index.js";

export async function audit(db, action, table, rowId, before, after, userId = null) {
  await db.query(`INSERT INTO audit_log(user_id, action, "table", row_id, before, after) VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, action, table, rowId == null ? null : String(rowId), before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)]);
}

const CLIENT_SQL = `SELECT c.id, c.company, c.bucket, c.contact, c.phone, c.email, c.broker_name, c.stage, c.us_sales_window, c.share_non_cusma, c.rate_paid, c.ach_status,
  to_char(c.engagement_signed_at,'YYYY-MM-DD') AS signed, r.company AS ref, c.notes, c.referred_by_client_id FROM clients c LEFT JOIN clients r ON r.id = c.referred_by_client_id ORDER BY c.id`;
const ENTRY_SQL = `SELECT e.id, e.client_id, c.company AS client, e.entry_no, to_char(e.entry_date,'YYYY-MM-DD') AS entry_date, e.port, e.hts, e.hts_base, e.entered_value, e.duty_rate, e.duty_amount,
  to_char(e.liquidation_date,'YYYY-MM-DD') AS liquidation_date, e.liquidation_source, e.consignee_name, e.ior_name, e.status, e.filed_via, e.claimed_amount, e.refunded_amount,
  e.reconciliation_flag, e.reconciliation_on_file, e.surety_paid, e.drawback_flag, e.adcvd_suspended FROM entries e JOIN clients c ON c.id = e.client_id ORDER BY e.id`;

export const toClient = r => ({ id: r.id, company: r.company, bucket: r.bucket, contact: r.contact ?? "", phone: r.phone ?? "", email: r.email ?? "", broker: r.broker_name ?? "", stage: r.stage,
  sales: num(r.us_sales_window) ?? "", share: num(r.share_non_cusma) ?? "", rate: num(r.rate_paid) ?? "", ach: r.ach_status, signed: r.signed ?? "", ref: r.ref ?? "", notes: r.notes ?? "" });
export const toEntry = r => ({ id: r.id, clientId: r.client_id, entry: r.entry_no, client: r.client, entryDate: r.entry_date ?? "", hts: r.hts ?? "", htsBase: r.hts_base ?? "", value: num(r.entered_value) ?? 0, rate: num(r.duty_rate) ?? "",
  duty: num(r.duty_amount), liqDate: r.liquidation_source === "estimated" ? "" : (r.liquidation_date ?? ""), liqSource: r.liquidation_source, consignee: r.consignee_name ?? "", ior: r.ior_name ?? "", port: r.port ?? "", status: r.status, filedVia: r.filed_via ?? "",
  reconciliation_flag: !!r.reconciliation_flag, reconciliation_on_file: !!r.reconciliation_on_file, surety_paid: !!r.surety_paid, drawback_flag: !!r.drawback_flag, adcvd_suspended: !!r.adcvd_suspended });

export async function loadState(db, t = today()) {
  const { rules, texts, all, ruleVersionId, detail } = await loadRules(db, t);
  const clients = (await db.query(CLIENT_SQL)).rows.map(toClient);
  const entries = (await db.query(ENTRY_SQL)).rows.map(toEntry);
  const done = Object.fromEntries((await db.query("SELECT key FROM tasks WHERE done_at IS NOT NULL")).rows.map(r => [r.key, true]));
  return { t, rules, texts, ruleRows: all, ruleVersionId, ruleDetail: detail, clients, entries, done };
}

// Recompute every figure, store it with its rule version, regenerate tasks (done flags persist by key).
export async function recompute(db, t = today()) {
  const s = await loadState(db, t);
  for (const e of s.entries) {
    const p = phase(e, s.rules, t);
    await db.query(`INSERT INTO computed(entry_id, rule_version_id, ieepa_duty, phase, governing_deadline, days_remaining, is_estimated, classification, computed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT (entry_id) DO UPDATE SET rule_version_id=EXCLUDED.rule_version_id, ieepa_duty=EXCLUDED.ieepa_duty, phase=EXCLUDED.phase,
      governing_deadline=EXCLUDED.governing_deadline, days_remaining=EXCLUDED.days_remaining, is_estimated=EXCLUDED.is_estimated, classification=EXCLUDED.classification, computed_at=now()`,
      [e.id, s.ruleVersionId, p.duty, p.phase, p.deadline ? fmt(p.deadline) : null, p.days, !!p.est && !p.na, p.cls.kind]);
  }
  const list = genTasks(s.clients, s.entries, s.done, s.rules, t);
  const byCompany = Object.fromEntries(s.clients.map(c => [c.company, c.id]));
  const byEntry = Object.fromEntries(s.entries.map(e => [e.client + "|" + e.entry, e.id]));
  await db.query("DELETE FROM tasks WHERE done_at IS NULL");
  for (const tk of list) {
    await db.query(`INSERT INTO tasks(client_id, entry_id, key, owner_role, text, hot, generated_at) VALUES ($1,$2,$3,$4,$5,$6,now())
      ON CONFLICT (key) DO UPDATE SET text=EXCLUDED.text, hot=EXCLUDED.hot, generated_at=now()`, [byCompany[tk.c.company] ?? null, tk.entry ? byEntry[tk.c.company + "|" + tk.entry] ?? null : null, tk.id, tk.who, tk.t, !!tk.hot]);
  }
  return s;
}

export async function snapshot(db, t = today()) {
  const s = await recompute(db, t);
  const entries = s.entries.map(e => { const p = phase(e, s.rules, t); return { ...e, computed: { phase: p.phase, cls: p.cls, deadline: fmt(p.deadline), days: p.days, est: p.est, duty: p.duty, na: !!p.na, liqEff: p.liqEff ? fmt(p.liqEff) : "" } }; });
  const clients = s.clients.map(c => { const st = clientStats(c, s.entries, s.rules, t); return { ...c, stats: { count: st.es.length, p1: st.p1, pr: st.pr, gone: st.gone, na: st.na, est: st.est, min: st.min, past: st.past, exposure: st.exposure, fee: st.fee, total: st.total, consignees: st.consignees, next: st.next ? { entry: st.next.e.entry, days: st.next.p.days, deadline: fmt(st.next.p.deadline) } : null } }; });
  const tasks = genTasks(s.clients, s.entries, s.done, s.rules, t).map(tk => ({ id: tk.id, who: tk.who, t: tk.t, hot: !!tk.hot, done: tk.done, company: tk.c.company }));
  const d = dashboard(s.clients, s.entries, s.rules, t);
  const dash = { kpis: d.kpis, clocks: d.clocks.map(({ e, p }) => ({ entry: e.entry, client: e.client, days: p.days, deadline: fmt(p.deadline), duty: p.duty, est: p.est, phase: p.phase })) };
  return { asOf: fmt(t), rules: s.rules, ruleVersionId: s.ruleVersionId, ruleDetail: s.ruleDetail, clients, entries, tasks, dash };
}
