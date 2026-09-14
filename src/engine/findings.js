// Ported verbatim from prototype/desk-v0.2.html — findings(name) — as renderFindings().
// generateFindings() wraps it with the non-negotiable hard block (BUILD_SPEC §3, CLAUDE.md):
// no client-facing document while any of the client's IEEPA entries is on an estimated liquidation date.
import { clientStats } from "./clientStats.js";
import { esc, fmt, money, today } from "./dates.js";

export class FindingsBlockedError extends Error {
  constructor(company, estimated) {
    super(`Findings sheet blocked for ${company}: ${estimated} IEEPA entries are on an estimated liquidation date. Pull ACE dates first.`);
    this.name = "FindingsBlockedError"; this.code = "FINDINGS_BLOCKED"; this.estimated = estimated;
  }
}

export function renderFindings(c, entries, r, ref, t = today()) {
  if (!c) return "";
  const st = clientStats(c, entries, r, t);
  return `<div class="sheet"><div class="mark"><div><b>CORRIDOR</b><span>RECOVERY</span></div></div><div class="docline"><div><strong>Findings sheet</strong> ${ref}</div><div>To: ${esc(c.contact || "—")}, ${esc(c.company)}</div><div>As of ${fmt(t)}</div></div>
  <h1>What the entries show</h1><p>We reviewed ${st.es.length} US customs entries for ${esc(c.company)} from your broker's report${st.na ? ` (${st.na} carried non-IEEPA duty lines and are excluded — those duties are not refundable under the ruling)` : ""}${st.est ? `; ${st.est} entries are on an estimated liquidation date and the figures below will change when ACE dates are confirmed` : ""}. IEEPA duty identified: <strong>${money(st.total)}</strong>.</p>
  <div class="tw"><table><tr><th>Category</th><th class="n">IEEPA duty</th><th>What it means</th><th>Action</th></tr>
  <tr><td>Filable now in CAPE (Phase 1)</td><td class="n">${money(st.p1)}</td><td>Unliquidated, or liquidated within ${r.p1} days</td><td>Partner broker files the declaration. ACE/ACH enrolment: ${esc(c.ach)}</td></tr>
  <tr><td>Protest required</td><td class="n">${money(st.pr)}</td><td>Liquidated more than ${r.p1} days ago; ${r.prot}-day window open</td><td>Protest per entry${st.next && st.next.p.phase.startsWith("Protest") ? ` — next deadline ${fmt(st.next.p.deadline)} (${st.next.p.days} days)` : ""}</td></tr>
  <tr><td>Phase 3 — finally liquidated</td><td class="n">${money(st.gone)}</td><td>Protest window closed; CAPE Phase 3 accepts these but the government has appealed</td><td>File it; do not count it until the appeal resolves</td></tr>
  <tr><td style="border:0"></td><td class="n" style="border-top:2px solid var(--ink);border-bottom:0">${money(st.total)}</td><td style="border:0"></td><td style="border:0"></td></tr></table></div>
  <h2>Our fee if recovered</h2><p>${Math.round(r.fee1 * 100)}% of Phase 1 refunds and ${Math.round(r.fee2 * 1000) / 10}% of protest recoveries, payable only when funds arrive. Indicative fee on full recovery: <strong>${money(st.fee)}</strong>. CBP pays refunds with interest; its stated timeline of 60–90 days after acceptance should be treated as quarters, not weeks.</p>
  <h2>What we need next</h2><p>1. Confirmed ACE portal access and ACH refund enrolment. ${st.est ? `2. ACE liquidation dates for ${st.est} entries. 3. ` : "2. "}Your signature on the partner broker's filing authorization.${c.bucket.startsWith("A") ? ` ${st.est ? "4" : "3"}. Introductions to your US customers who cleared your goods themselves${st.consignees.length ? ` — we count ${st.consignees.length} on your entries` : ""}; they are likely owed refunds too.` : ""}</p>
  <div id="fsNarrative"></div><p class="small muted">This sheet reports what the customs entries show and the rules as published. It is not legal advice and not a guarantee of recovery. Estimated figures are marked and will be revised.</p>
  <div class="foot"><div>Corridor Recovery, a trade name of [1234567 B.C. Ltd.]</div><div>Figures are dated; estimated figures are marked.</div></div></div>`;
}

// Client-facing generator: HARD BLOCK while any IEEPA entry is estimated. Throws FindingsBlockedError.
export function generateFindings(c, entries, r, ref, t = today()) {
  const st = clientStats(c, entries, r, t);
  if (st.est > 0) throw new FindingsBlockedError(c.company, st.est);
  return { html: renderFindings(c, entries, r, ref, t), stats: st };
}
