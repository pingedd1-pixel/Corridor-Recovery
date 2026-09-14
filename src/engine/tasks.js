// Ported verbatim from prototype/desk-v0.2.html — tasks(). First ruleset per BUILD_SPEC "Task engine".
// `done` is a map of task id -> truthy (prototype: S.done); ids are stable keys ("<company>|<key>").
import { clientStats } from "./clientStats.js";
import { fmt, money, today } from "./dates.js";

export function tasks(clients, entries, done, r, t = today()) {
  const out = [];
  clients.forEach(c => {
    const st = clientStats(c, entries, r, t); const id = s => c.company + "|" + s;
    if (c.stage === "Lead") out.push({ id: id("qualify"), who: "PK", t: `Qualify ${c.company} — five questions, log answers`, c });
    if (c.stage === "Qualified" && !c.signed) out.push({ id: id("engage"), who: "PK", t: `Send engagement letter + authorization to ${c.company}`, c });
    if (["Engaged"].includes(c.stage) && st.es.length === 0) out.push({ id: id("data"), who: "Client", t: `${c.company}: broker entry report not received — chase ${c.broker || "their broker"}`, c });
    if (st.est > 0) out.push({ id: id("ace"), who: "Broker", t: `${c.company}: pull ACE liquidation dates for ${st.est} estimated entries`, c, hot: true });
    if (st.es.length > 0 && c.ach !== "Yes") out.push({ id: id("ach"), who: "Client", t: `${c.company}: ACE portal + ACH refund enrolment not confirmed — walk them through it`, c });
    if (st.es.length > 0 && ["Data in", "Engaged"].includes(c.stage) && st.est === 0) out.push({ id: id("fs"), who: "Desk", t: `${c.company}: entries complete — generate findings sheet (${money(st.total)} IEEPA)`, c });
    if (st.p1 > 0 && ["Findings sent"].includes(c.stage)) out.push({ id: id("cape"), who: "Broker", t: `${c.company}: file CAPE declaration for Phase 1 entries (${money(st.p1)})`, c });
    st.es.filter(x => x.p.phase === "Protest required" && x.p.days >= 0).sort((a, b) => a.p.days - b.p.days).slice(0, 3).forEach(x => out.push({ id: id("prot|" + x.e.entry), who: "Broker", t: `${c.company}: protest entry ${x.e.entry} by ${fmt(x.p.deadline)} (${x.p.days}d, ${money(x.p.duty)})`, c, hot: x.p.days < r.urg, entry: x.e.entry }));
    if (st.past > 0) out.push({ id: id("past"), who: "Desk", t: `${c.company}: ${st.past} entries past protest deadline (${money(st.gone)}) — flag to counsel, do not promise`, c });
    if (c.bucket.startsWith("A") && ["Findings sent", "Filed", "Refunded"].includes(c.stage)) out.push({ id: id("bb"), who: "PK", t: `${c.company}: ask for US customer introductions (${st.consignees.length} consignees already on file)`, c });
    if (c.stage === "Refunded") out.push({ id: id("inv"), who: "Desk", t: `${c.company}: refund landed — invoice fee (${money(st.fee)} indicative)`, c });
  });
  return out.map(t => ({ ...t, done: !!done[t.id] }));
}
