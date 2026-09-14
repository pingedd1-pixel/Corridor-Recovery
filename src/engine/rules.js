// The engine reads rules as the prototype did: an object keyed prot/p1/lag/urg/fee1/fee2/brok/real.
// In the real app those values come from the `rules` table (see src/db/rules.js); nothing here is a constant.
export const RULE_KEYS = {
  protest_window_days: "prot",
  phase1_window_days: "p1",
  liquidation_lag_days: "lag",
  urgent_threshold_days: "urg",
  fee_phase1: "fee1",
  fee_protest: "fee2",
  broker_share: "brok",
  realization_haircut: "real",
};
export const REQUIRED = Object.values(RULE_KEYS);
export function assertRules(r) {
  const missing = REQUIRED.filter(k => r == null || typeof r[k] !== "number" || Number.isNaN(r[k]));
  if (missing.length) throw new Error("rules incomplete: missing " + missing.join(", "));
  return r;
}
