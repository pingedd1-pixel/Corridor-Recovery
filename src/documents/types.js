// The five client-facing documents (BUILD_SPEC §4). Each renders page-one anatomy + body on the Corridor template.
// Voice rules (brand guide, playbook §10): lead with the number and the ask; "likely", "in the range of",
// "subject to what the entries show"; never "guarantee", never hype words, no exclamation marks.
import { clientStats, renderFindings, fmt, money, esc } from "../engine/index.js";
import { ORG } from "./org.js";
import { mark, docline, foot } from "./shell.js";

const pct = x => Math.round(x * 1000) / 10 + "%";
const longDate = d => new Date(d + "T00:00:00").toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });

export const TYPES = {
  FS: { name: "Findings sheet", carriesFigures: true, needs: [] },
  CN: { name: "Cover note", carriesFigures: true, needs: [] },
  EL: { name: "Engagement letter", carriesFigures: false, needs: [], template: "CM-EL-2026-TEMPLATE" },
  AU: { name: "Authorization", carriesFigures: false, needs: [], template: "CM-AU-2026-TEMPLATE" },
  NDA: { name: "Mutual non-disclosure agreement", carriesFigures: false, needs: [], template: "CM-NDA-2026-TEMPLATE" },
  BI: { name: "Introduction to a US customer", carriesFigures: false, needs: ["consignee"] },
  BSA: { name: "Filing broker services agreement", carriesFigures: false, needs: ["brokerName"], counterparty: "broker", template: "CM-BSA-2026-TEMPLATE" },
};

// Bracketed values in the counsel drafts are placeholder rule rows (migration 004). Until a row is approved by
// counsel/PK (approved_by not starting with "placeholder") it renders in [brackets], exactly as in the draft.
export function ph(ruleRows, key, fmtv = v => v) {
  const r = ruleRows?.[key]; if (!r) return `[${key}]`;
  const raw = r.value != null ? fmtv(r.value) : (r.text ?? "[ ]");
  if (raw === "[ ]") return raw;
  return r.placeholder ? `[${raw}]` : String(raw);
}
const pctOf = v => Math.round(v * 1000) / 10 + "%";
// "[22.5]%" as in the counsel drafts: the bracket wraps the number, not the unit.
const phPct = (ruleRows, key) => { const r = ruleRows?.[key]; if (!r || r.value == null) return "[ ]%"; const n = Math.round(r.value * 1000) / 10; return r.placeholder ? `[${n}]%` : `${n}%`; };
const CLIENT_LEGAL = c => c.legalName || c.company;

// ctx: { c (client, prototype shape; null for broker documents), entries (all), rules, ruleRows, asOf (Date), ref, params }
export function render(type, ctx) {
  const t = TYPES[type]; if (!t) throw new Error("unknown document type " + type);
  for (const k of t.needs) if (!ctx.params?.[k]) throw Object.assign(new Error(`${t.name} needs ${k}`), { statusCode: 400 });
  const body = RENDER[type](ctx);
  return { title: `${t.name} ${ctx.ref}`, body };
}

const RENDER = {
  // Findings sheet: the engine's own markup, verbatim (renderFindings). It already carries mark, doc line and footer.
  FS: ({ c, entries, rules, asOf, ref }) => renderFindings(c, entries, rules, ref, asOf),

  CN: ({ c, entries, rules, asOf, ref, params }) => {
    const st = clientStats(c, entries, rules, asOf); const day = fmt(asOf);
    const fsRef = params?.findingsRef || "the findings sheet enclosed";
    const next = st.next && st.next.p.phase.startsWith("Protest") ? ` The earliest protest deadline is ${fmt(st.next.p.deadline)}, ${st.next.p.days} days out.` : "";
    const action = st.p1 > 0 ? `Our partner broker can file the CAPE declaration for the Phase 1 entries (${money(st.p1)}) as soon as your ACE account and ACH refund enrolment are confirmed.` : `The next step is to confirm your ACE account and ACH refund enrolment.`;
    return `${mark()}${docline({ typeName: "Cover note", ref, to: `${c.contact || "—"}, ${c.company}`, asOf: day })}
<h1>${esc(c.company)}: IEEPA duty in the range of ${money(st.total)} across ${st.es.length - st.na} entries</h1>
<p class="lede">${esc(c.contact ? c.contact.split(" ")[0] : "Hello")},</p>
<p>We reviewed the ${st.es.length} US customs entries in your broker's report. ${st.es.length - st.na} carried IEEPA duty; ${st.na ? `${st.na} carried non-IEEPA lines (232/301) and are excluded because those duties are not refundable. ` : ""}What the entries show, subject to CBP's validation: <strong>${money(st.p1)}</strong> is filable now in CAPE (Phase 1), <strong>${money(st.pr)}</strong> needs a protest per entry${st.gone ? `, and ${money(st.gone)} is past the protest window and would need counsel` : ""}.${next}</p>
<p>${action} CBP pays refunds with interest. Its stated timeline is 60–90 days after acceptance; plan on quarters, not weeks.</p>
<p>Our fee is ${pct(rules.fee1)} of Phase 1 refunds and ${pct(rules.fee2)} of protest recoveries, invoiced only when funds arrive. Indicative fee on full recovery: ${money(st.fee)}. Details are in ${esc(fsRef)}.</p>
<p><strong>One ask:</strong> confirm your ACE portal access and ACH enrolment this week, and return the signed filing authorization. That is what stands between the entries and the refund.</p>
<p>${esc(ORG.deskSignature)}</p>
<p class="small muted">This note reports what the customs entries show and the rules as published. It is not legal advice and not a guarantee of recovery.</p>${foot()}`;
  },

  EL: ({ c, rules, ruleRows, asOf, ref }) => {
    const day = fmt(asOf); const P = k => ph(ruleRows, k); const auRef = ref.replace("-EL-", "-AU-");
    return `${mark()}${docline({ typeName: "Engagement letter", ref, to: `${c.contact || "—"}, ${c.company}`, asOf: day })}
<h1>Engagement for tariff-recovery services</h1>
<p>Between <strong>${esc(CLIENT_LEGAL(c))}</strong> ("Client") and ${esc(ORG.legalLine)} ("Corridor"). Effective on the date of the last signature.</p>
<h2>1. Services</h2>
<p>Corridor will (a) review Client's US and, where applicable, Canadian customs entry data for the period 1 February 2025 to the date of this letter; (b) identify duties that may be recoverable under the US Supreme Court's decision in <em>Learning Resources v. Trump</em> and subsequent orders, and under Canadian remission, relief and drawback provisions; (c) deliver a written findings sheet; (d) prepare and coordinate recovery filings; (e) manage deadlines and report to Client monthly until each matter closes.</p>
<p>Filings with US Customs and Border Protection and the Canada Border Services Agency are made by licensed customs brokers engaged by Corridor ("Filing Brokers"). Corridor is not a law firm or a licensed customs brokerage and does not provide legal advice. Where a matter requires counsel, Corridor will say so and Client decides whether to retain counsel.</p>
<h2>2. Fees — contingent</h2>
<table><tr><th>Recovery</th><th>Fee</th></tr>
<tr><td>Straightforward US refund entries (as designated on the findings sheet)</td><td style="white-space:nowrap">${pctOf(rules.fee1)} of the refund received, including interest</td></tr>
<tr><td>US entries requiring protest, correction, reconciliation handling or resolution of payment failures</td><td style="white-space:nowrap">${phPct(ruleRows, "fee_protest")} of the refund received, including interest</td></tr>
<tr><td>Canadian surtax remission, relief or drawback</td><td style="white-space:nowrap">${phPct(ruleRows, "fee_canadian_recovery")} of the amount recovered</td></tr></table>
<p>No fee is payable unless and until funds are received by Client. Corridor invoices on receipt; payment due within ${P("invoice_due_days")} days. Fees are exclusive of GST/HST.</p>
<p>Corridor bears Filing Broker fees for declarations and protests on Client's matters. Litigation, appeals or counsel fees are not included and will not be incurred without Client's written approval.</p>
<h2>3. Client obligations</h2>
<ul>
<li>Provide the authorization in Schedule A; instruct its customs broker(s) to release entry data; provide duty statements, entry summaries and related records on request.</li>
<li>Maintain, or permit Filing Brokers to establish, an active ACE account and refund (ACH) enrolment; keep its importer record current.</li>
<li>Not file or cause to be filed duplicate claims on the same entries during the term; inform Corridor of any prior filings.</li>
<li>Confirm that information provided is, to Client's knowledge, accurate.</li>
</ul>
<h2>4. Exclusivity and term</h2>
<p>Client engages Corridor exclusively for recovery of the duties described in 1 for ${P("engagement_exclusivity_months")} months from signature, and thereafter until all matters opened during the term are closed. Either party may terminate on ${P("termination_notice_days")} days' written notice; fees remain payable on any recovery arising from work done before termination.</p>
<h2>5. No guarantee</h2>
<p>Recovery depends on government processing, the state of Client's entries and ongoing litigation. Corridor makes no representation as to amount or timing of any recovery. Estimates are estimates.</p>
<h2>6. Confidentiality and data</h2>
<p>Governed by the mutual non-disclosure agreement of even date. Corridor holds customs data only as long as needed for the services, uses it only for the services, and does not sell or share it except with Filing Brokers and counsel engaged on Client's matters.</p>
<h2>7. General</h2>
<p>Governing law: British Columbia. Disputes: ${esc(P("dispute_resolution"))}. Entire agreement; amendments in writing; counterparts and electronic signature accepted.</p>
<div class="sig"><div><span class="n">For Client</span><br><span class="r">${esc(CLIENT_LEGAL(c))}</span><br><br>Name / title / date: <span class="field"></span></div>
<div><span class="n">For Corridor Recovery</span><br><span class="r">${esc(ORG.legalLine)}</span><br><br>Name / title / date: <span class="field"></span></div></div>
<p class="small muted" style="margin-top:18px">Schedule A — Authorization (attached, ${esc(auRef)}). Template CM-EL-2026-TEMPLATE, counsel draft 2026-09-13; bracketed terms are placeholders pending counsel.</p>${foot()}`;
  },

  AU: ({ c, ruleRows, asOf, ref, params }) => {
    const day = fmt(asOf); const P = k => ph(ruleRows, k);
    const ein = params?.usImporterNumber || "[ ]", bn = params?.canadianBusinessNumber || "[ ]", address = params?.address || c.address || "[address]";
    return `${mark()}${docline({ typeName: "Authorization", ref, to: `${c.contact || "—"}, ${c.company}`, asOf: day })}
<h1>Authorization to obtain customs data and coordinate recovery filings</h1>
<p><strong>${esc(CLIENT_LEGAL(c))}</strong>, ${esc(address)}, US importer number / EIN ${esc(ein)}, Canadian business number ${esc(bn)} ("Client"), authorizes ${esc(ORG.legalLine)} ("Corridor") as follows:</p>
<ol>
<li>To request and receive from Client's customs brokers${c.broker ? ` (including ${esc(c.broker)})` : ""}, freight forwarders and Client's own systems all entry summaries, duty statements, invoices, liquidation notices, ACE reports and related records for entries made between 1 February 2025 and the date below.</li>
<li>To review those records and prepare analyses and claim packages on Client's behalf.</li>
<li>To engage licensed customs brokers ("Filing Brokers") to file refund declarations, protests, remission, relief and drawback claims on Client's behalf, and to instruct them on Client's matters. Client will execute any power of attorney a Filing Broker requires.</li>
<li>To communicate with US Customs and Border Protection and the Canada Border Services Agency through Filing Brokers regarding those filings.</li>
</ol>
<p>This authorization does not permit Corridor to receive funds on Client's behalf, to bind Client to any expense beyond the engagement letter, or to make representations to any authority other than through a licensed Filing Broker. It is valid for ${P("authorization_validity_months")} months and may be revoked in writing. A copy is as good as the original.</p>
<div class="sig"><div><span class="n">Authorized signatory for Client</span><br><span class="r">${esc(CLIENT_LEGAL(c))}</span><br><br>Name / title / date: <span class="field"></span></div>
<div><span class="n">Witness</span><br><span class="r">&nbsp;</span><br><br>Name / title / date: <span class="field"></span></div></div>
<p class="small muted" style="margin-top:18px">Template CM-AU-2026-TEMPLATE, counsel draft 2026-09-13; bracketed terms are placeholders pending counsel. Schedule A to the engagement letter.</p>${foot()}`;
  },

  NDA: ({ c, ruleRows, asOf, ref }) => {
    const day = fmt(asOf); const P = k => ph(ruleRows, k);
    return `${mark()}${docline({ typeName: "Mutual non-disclosure agreement", ref, to: `${c.contact || "—"}, ${c.company}`, asOf: day })}
<h1>Mutual non-disclosure agreement</h1>
<p>Between <strong>${esc(CLIENT_LEGAL(c))}</strong> and ${esc(ORG.legalLine)}, each a "Party".</p>
<p><strong>Confidential Information</strong> means any non-public business, financial, customs, shipment, customer, pricing or technical information disclosed by one Party to the other in connection with tariff-recovery services, in any form, whether or not marked.</p>
<p>Each Party will use the other's Confidential Information only for the services, protect it with at least reasonable care, and disclose it only to its personnel, licensed customs brokers and professional advisers who need it and are bound by equivalent obligations.</p>
<p><strong>Exclusions:</strong> information that is public through no fault of the receiving Party, already known to it, independently developed, or lawfully received from a third party. Disclosure required by law or a government authority is permitted with prompt notice where lawful.</p>
<p>Customs entry data is Client Confidential Information. Corridor will store it encrypted, restrict access by role, keep an access log, and delete or return it within ${P("data_deletion_days")} days after the last matter closes, except as retained by law.</p>
<p><strong>Term:</strong> ${P("nda_term_years")} years from signature; customs data and personal information indefinitely.</p>
<p>No licence, no obligation to proceed, no warranty. Governing law British Columbia. Electronic signature accepted.</p>
<div class="sig"><div><span class="n">For Client</span><br><span class="r">${esc(CLIENT_LEGAL(c))}</span><br><br>Name / title / date: <span class="field"></span></div>
<div><span class="n">For Corridor Recovery</span><br><span class="r">${esc(ORG.legalLine)}</span><br><br>Name / title / date: <span class="field"></span></div></div>
<p class="small muted" style="margin-top:18px">Template CM-NDA-2026-TEMPLATE, counsel draft 2026-09-13; bracketed terms are placeholders pending counsel.</p>${foot()}`;
  },

  BSA: ({ ruleRows, asOf, ref, params }) => {
    const day = fmt(asOf); const P = k => ph(ruleRows, k); const broker = params.brokerName; const lic = params.licenceNo || "[ ]";
    const usd = k => { const v = P(k); return v === "[ ]" ? "US$[ ]" : "US$" + v; };
    return `${mark()}${docline({ typeName: "Filing broker services agreement", ref, to: `${broker}`, asOf: day })}
<h1>Services agreement — licensed filing broker</h1>
<p>Between ${esc(ORG.legalLine)} ("Corridor") and <strong>${esc(broker)}</strong>, licensed customs broker, licence no. ${esc(lic)} ("Broker").</p>
<h2>1. Services</h2>
<p>Broker will, on Corridor's instruction and for clients Corridor has engaged ("Corridor Clients"): obtain entry data from ACE or CBSA systems where authorized; file refund declarations, protests, remission, relief and drawback claims; respond to agency validations and requests; report status to Corridor within ${P("broker_status_report_days")} business days of any agency action. Broker exercises independent professional judgement as a licensee and may decline any filing it considers improper; it will say so promptly in writing.</p>
<h2>2. Fees</h2>
<p>Corridor pays Broker a flat fee of ${usd("broker_flat_fee_per_client_usd")} per Corridor Client for declarations covering up to ${P("broker_entries_included")} entries, ${usd("broker_fee_additional_block_usd")} per additional ${P("broker_additional_block_entries")} entries, and ${usd("broker_fee_per_protest_usd")} per protest, invoiced monthly, payable in ${P("broker_invoice_due_days")} days.</p>
<p>In addition, Broker receives ${P("broker_fee_share_pct")}% of Corridor's collected contingency fee on each Corridor Client matter Broker filed, payable within ${P("broker_share_due_days")} days of Corridor's receipt.</p>
<p>No other fees are charged to Corridor Clients by Broker without Corridor's written consent.</p>
<h2>3. Non-circumvention and non-solicitation</h2>
<p>For the term and ${P("broker_noncircumvention_months")} months after, Broker will not, directly or through affiliates, solicit, engage or provide tariff-recovery or duty-refund services to any Corridor Client, or to any prospect Corridor introduced in writing, other than through this agreement, and will not disclose Corridor's methods, documents or client list. Broker may continue ordinary customs brokerage for any client that was its client before introduction, and will disclose such existing relationships when a Corridor Client is assigned.</p>
<h2>4. Data, confidentiality and compliance</h2>
<p>Client data is confidential and used only for the filings. Broker maintains its licence, bond and insurance, complies with all customs laws and regulations, and keeps records as required. Each party carries its own professional liability insurance.</p>
<h2>5. Term</h2>
<p>${P("broker_agreement_term_months")} months, renewing annually unless terminated on ${P("broker_termination_notice_days")} days' notice. Filings in progress are completed. Sections 3 and 4 survive.</p>
<h2>6. General</h2>
<p>Independent contractors. Governing law ${esc(P("bsa_governing_law"))}. Disputes: ${esc(P("dispute_resolution"))}. Electronic signature accepted.</p>
<div class="sig"><div><span class="n">For Corridor Recovery</span><br><span class="r">${esc(ORG.legalLine)}</span><br><br>Name / title / date: <span class="field"></span></div>
<div><span class="n">For Broker</span><br><span class="r">${esc(broker)}</span><br><br>Name / title / date: <span class="field"></span></div></div>
<p class="small muted" style="margin-top:18px">Template CM-BSA-2026-TEMPLATE, counsel draft 2026-09-13; bracketed terms are placeholders pending counsel.</p>${foot()}`;
  },

  BI: ({ c, entries, rules, asOf, ref, params }) => {
    const day = fmt(asOf); const consignee = params.consignee; const st = clientStats(c, entries, rules, asOf);
    const theirs = st.es.filter(x => (x.e.consignee || "").trim() === consignee.trim() && !x.p.na);
    const n = theirs.length; const window = n ? `${fmt(new Date(Math.min(...theirs.map(x => new Date(x.e.entryDate + "T00:00:00")))))} to ${fmt(new Date(Math.max(...theirs.map(x => new Date(x.e.entryDate + "T00:00:00")))))}` : "February 2025 to February 2026";
    return `${mark()}${docline({ typeName: "Introduction to a US customer", ref, to: `${consignee} — sent under the name of ${c.company}`, asOf: day })}
<h1>Draft email from ${esc(c.company)} to ${esc(consignee)}</h1>
<p class="small muted">Subject: US tariffs you paid on our goods are refundable — an introduction</p>
<p>Hello,</p>
<p>Between ${esc(window)}, shipments from ${esc(c.company)} that ${esc(consignee)} cleared into the US likely carried 25–35% IEEPA tariffs${n ? ` (we count ${n} entries on our side)` : ""}. On 20 February 2026 the Supreme Court found those tariffs unlawful, and CBP is now refunding them with interest through its CAPE portal. The refund goes to the importer of record, which on these entries was you.</p>
<p>Deadlines apply: entries that have liquidated have a protest window, and some are already closing. We have been working with Corridor Recovery, a Canadian desk that finds the refundable entries, phases them against CBP's deadlines, and has a licensed US customs broker file. Their fee is contingent: nothing until your refund arrives.</p>
<p>Would you like an introduction? If so, reply and I will connect you with their principal this week. They only need your broker's entry report to tell you what is likely owed.</p>
<p>${esc(c.contact || "")}<br>${esc(c.company)}</p>
<p class="small muted">This draft is written for ${esc(c.company)} to send in its own name. It reports the rules as published and is not a guarantee of any refund.</p>${foot()}`;
  },
};
