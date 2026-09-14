// Ported verbatim from prototype/desk-v0.2.html — clientStats(c).
// `entries` is the full entry list (prototype: S.entries); `r` the rules object.
import { phase } from "./phase.js";
import { today } from "./dates.js";

export function clientStats(c, entries, r, t = today()) {
  const es = entries.filter(e => e.client === c.company).map(e => ({ e, p: phase(e, r, t) })); const sum = f => es.filter(f).reduce((a, x) => a + x.p.duty, 0);
  const p1 = sum(x => x.p.phase.startsWith("Phase 1")), pr = sum(x => x.p.phase.startsWith("Protest")), gone = sum(x => x.p.phase.startsWith("Deadline")), na = es.filter(x => x.p.na).length, est = es.filter(x => x.p.est && !x.p.na).length;
  const live = es.filter(x => x.p.days != null && x.p.days >= 0 && !x.p.na).sort((a, b) => a.p.days - b.p.days); const min = live.length ? live[0].p.days : null; const past = es.filter(x => x.p.days != null && x.p.days < 0).length;
  const exposure = (+c.sales || 0) * (+c.share || 0) * (+c.rate || 0); const fee = p1 * r.fee1 + pr * r.fee2;
  const consignees = [...new Set(es.map(x => x.e.consignee).filter(Boolean))];
  return { es, p1, pr, gone, na, est, min, past, exposure, fee, total: p1 + pr + gone, next: live[0] || null, consignees };
}
