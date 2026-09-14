// Ported verbatim from prototype/desk-v0.2.html — phase(e). Only change: rules and "today"
// are parameters instead of globals (S.rules / today()).
import { classify } from "./classify.js";
import { D, addDays, db, today } from "./dates.js";

export function phase(e, r, t = today()) {
  const cls = classify(e.hts);
  if (cls.kind !== "ieepa" && cls.kind !== "unknown" && cls.kind !== "other99") return { phase: "Not IEEPA", cls, deadline: null, days: null, est: false, duty: 0, na: true };
  const ent = D(e.entryDate), liq = D(e.liqDate); const est = !liq; const liqEff = liq || (ent ? addDays(ent, r.lag) : null);
  const duty = e.duty != null && e.duty !== "" ? +e.duty : (+e.value || 0) * (+e.rate || 0);
  if (!liqEff) return { phase: "—", cls, deadline: null, days: null, est, duty };
  const since = db(t, liqEff); let ph, dead;
  if (since < 0) { ph = "Phase 1 — unliquidated"; dead = addDays(liqEff, r.p1); } else if (since <= r.p1) { ph = "Phase 1 — recently liquidated"; dead = addDays(liqEff, r.p1); } else if (since <= r.prot) { ph = "Protest required"; dead = addDays(liqEff, r.prot); } else { ph = "Phase 3 — finally liquidated (contested on appeal)"; dead = addDays(liqEff, r.prot); }
  return { phase: ph, cls, deadline: dead, days: db(dead, t), est, duty, liqEff };
}
