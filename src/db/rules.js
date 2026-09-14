// Assemble the engine's rules object from the `rules` table as of a date, and pin the
// immutable rule_version the figures were computed with (BUILD_SPEC "Audit trail on every figure").
import { RULE_KEYS, assertRules } from "../engine/rules.js";
import { fmt } from "../engine/dates.js";

export async function loadRules(db, asOf) {
  const day = typeof asOf === "string" ? asOf : fmt(asOf);
  const { rows } = await db.query(
    `SELECT DISTINCT ON (key) id, key, value, value_text, effective_from, source FROM rules
      WHERE effective_from <= $1 AND (effective_to IS NULL OR effective_to > $1)
      ORDER BY key, effective_from DESC, id DESC`, [day]);
  const rules = {}; const ids = []; const detail = [];
  const texts = {};
  for (const r of rows) {
    ids.push(Number(r.id));
    const k = RULE_KEYS[r.key];
    if (k && r.value != null) { rules[k] = Number(r.value); detail.push({ id: Number(r.id), key: r.key, engineKey: k, value: Number(r.value), effective_from: r.effective_from, source: r.source }); }
    else { texts[r.key] = r.value_text; detail.push({ id: Number(r.id), key: r.key, engineKey: null, value: r.value_text, effective_from: r.effective_from, source: r.source }); }
  }
  assertRules(rules);
  ids.sort((a, b) => a - b); const fingerprint = ids.join(",");
  let v = (await db.query("SELECT id FROM rule_versions WHERE fingerprint = $1", [fingerprint])).rows[0];
  if (!v) v = (await db.query("INSERT INTO rule_versions(fingerprint, rule_ids, snapshot) VALUES ($1,$2,$3) RETURNING id", [fingerprint, ids, JSON.stringify({ ...rules, texts })])).rows[0];
  return { rules, texts, ruleVersionId: Number(v.id), detail };
}
