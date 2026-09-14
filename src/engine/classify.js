// Ported verbatim from prototype/desk-v0.2.html — "classification".
// IEEPA (refundable): 9903.01.xx. Excluded, never refundable: 232 (9903.80/81/85/78),
// 301 (9903.88–91), 232 autos (9903.94). Other Ch.99 lines are flagged for review.
export function classify(hts) {
  const h = String(hts || "").replace(/\./g, ""); if (!h) return { kind: "unknown", label: "no HTS" };
  if (h.startsWith("990301")) return { kind: "ieepa", label: "IEEPA" };
  if (/^9903(80|81|85|78)/.test(h)) return { kind: "s232", label: "232 — not refundable" };
  if (/^9903(88|89|90|91)/.test(h)) return { kind: "s301", label: "301 — not refundable" };
  if (h.startsWith("990394")) return { kind: "autos", label: "232 autos — not refundable" };
  if (h.startsWith("9903")) return { kind: "other99", label: "Ch.99 — check" };
  return { kind: "base", label: "base line" };
}
