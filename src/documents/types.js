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
  EL: { name: "Engagement letter", carriesFigures: false, needs: [] },
  AU: { name: "Authorization and confidentiality", carriesFigures: false, needs: [] },
  BI: { name: "Introduction to a US customer", carriesFigures: false, needs: ["consignee"] },
};

// ctx: { c (client, prototype shape), entries (all), rules, asOf (Date), ref, params }
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

  EL: ({ c, rules, asOf, ref }) => {
    const day = fmt(asOf);
    return `${mark()}${docline({ typeName: "Engagement letter", ref, to: `${c.contact || "—"}, ${c.company}`, asOf: day })}
<h1>Engagement letter — US tariff (IEEPA) refund recovery</h1>
<p>This letter sets out the terms on which ${esc(ORG.legalLine)} ("Corridor") will act for <strong>${esc(c.company)}</strong> ("the Client") to identify and recover US import duties collected under the International Emergency Economic Powers Act (IEEPA) and refundable following the US Supreme Court's decision of 20 February 2026.</p>
<h2>1. What Corridor does</h2>
<ol>
<li>Obtains the Client's US customs entry data from the Client's customs broker or the Client's ACE account, under the authorization signed with this letter.</li>
<li>Identifies the entries that carried IEEPA duty, the refund phase each falls in under CBP's CAPE process, the governing deadline, and the amount likely refundable, subject to what the entries show and to CBP's validation.</li>
<li>Prepares the claim file and coordinates its filing through ${esc(ORG.brokerSide)}, who files CAPE declarations and protests in its own name as a licensed filer.</li>
<li>Tracks each filing, reports monthly, and walks the Client through ACE account and ACH refund enrolment, without which CBP does not pay approved refunds.</li>
</ol>
<p>Corridor prepares and coordinates. Licensed customs brokers file. Corridor does not give legal advice; entries past the protest window are assessed with counsel of the Client's choosing.</p>
<h2>2. Fee — contingent, payable only when funds arrive</h2>
<table><tr><th>Recovery</th><th>Fee</th><th>Applies to</th></tr>
<tr><td>Phase 1 refund (entry unliquidated or recently liquidated; CAPE declaration)</td><td style="white-space:nowrap">${pct(rules.fee1)} of the refund</td><td>Finding, checking, filing coordination, and chasing the refund to the bank</td></tr>
<tr><td>Protest or complex refund (entry liquidated past the Phase 1 window; protest per entry; reconciliation; bank set-up)</td><td style="white-space:nowrap">${pct(rules.fee2)} of the refund</td><td>Deadline work per entry</td></tr></table>
<p>No refund, no fee. Corridor invoices when the refund, including any interest, is received by the Client, and the invoice is payable within [15] days. There is no retainer and no fee on entries that are not refunded. Fees are exclusive of applicable taxes.</p>
<h2>3. The Client's part</h2>
<ul><li>Sign the authorization (${esc(ref.replace("-EL-", "-AU-"))}) so the broker can release entry data.</li><li>Confirm the ACE account and ACH enrolment when asked, and provide any document CBP requests for validation.</li><li>Tell Corridor of any refund claim already filed for the same entries, by anyone.</li><li>Pay the fee within the period above once a refund lands.</li></ul>
<h2>4. Confidentiality and data</h2>
<p>Entry data is confidential. Corridor uses it only for this engagement, stores it encrypted, shares it only with the partner broker for filing, and deletes or returns it at the end of the engagement on request, subject to record-keeping required of the broker. British Columbia's Personal Information Protection Act applies to any personal information in it.</p>
<h2>5. Term, termination and what is not promised</h2>
<p>This engagement runs until the last filed entry is refunded, rejected or withdrawn. Either party may end it on [30] days' written notice; the fee remains payable on any refund resulting from a filing made before the notice. Corridor does not guarantee any recovery, amount, or timing. Figures quoted before the entries are reviewed are ranges; figures in the findings sheet are subject to CBP's validation and to the rules as published on the "As of" date. This letter is governed by the laws of British Columbia.</p>
<div class="sig"><div><span class="n">${esc(ORG.signer)}</span><br><span class="r">${esc(ORG.signerRole)}, ${esc(ORG.brand)}</span><br><br>Signature: <span class="field"></span> Date: <span class="field" style="min-width:90px"></span></div>
<div><span class="n">${esc(c.contact || "Authorized signatory")}</span><br><span class="r">${esc(c.company)}</span><br><br>Signature: <span class="field"></span> Date: <span class="field" style="min-width:90px"></span></div></div>
<p class="small muted" style="margin-top:18px">Template CM-EL-001. Square-bracketed terms are set by the principal before sending.</p>${foot()}`;
  },

  AU: ({ c, asOf, ref }) => {
    const day = fmt(asOf); const broker = c.broker || "[the Client's customs broker]";
    return `${mark()}${docline({ typeName: "Authorization and confidentiality", ref, to: `${c.contact || "—"}, ${c.company}`, asOf: day })}
<h1>Authorization to obtain customs entry data, and confidentiality undertaking</h1>
<p><strong>${esc(c.company)}</strong> ("the Client") authorizes ${esc(ORG.legalLine)} ("Corridor") and ${esc(ORG.brokerSide)} acting with Corridor to:</p>
<ol>
<li>Request and receive from <strong>${esc(broker)}</strong>, and from US Customs and Border Protection through the ACE system, the Client's US customs entry records for entries made between 1 February 2025 and 28 February 2026: entry numbers, entry and liquidation dates, ports, tariff classifications including Chapter 99 lines, entered values, duties paid, and consignee and importer-of-record names.</li>
<li>Use those records to determine which entries carried IEEPA duty and are refundable, and to prepare refund claims for the Client's review.</li>
<li>Where the Client separately instructs, have the partner broker file CAPE declarations and protests for the Client's entries.</li>
</ol>
<p>This authorization covers customs entry data only. It does not authorize access to financial statements, contracts, customer prices, or bank accounts. The Client may withdraw it at any time by written notice.</p>
<h2>Corridor's undertaking</h2>
<p>Corridor will treat the records as confidential; use them only for the purpose above; store them encrypted with access logged; disclose them only to the partner broker for filing, or where required by law; and return or delete them at the end of the engagement on request, subject to the broker's record-keeping obligations. This undertaking survives withdrawal of the authorization.</p>
<div class="sig"><div><span class="n">${esc(c.contact || "Authorized signatory")}</span><br><span class="r">for ${esc(c.company)}</span><br><br>Signature: <span class="field"></span> Date: <span class="field" style="min-width:90px"></span></div>
<div><span class="n">${esc(ORG.signer)}</span><br><span class="r">${esc(ORG.signerRole)}, ${esc(ORG.brand)}</span><br><br>Signature: <span class="field"></span> Date: <span class="field" style="min-width:90px"></span></div></div>
<p class="small muted" style="margin-top:18px">Template CM-AU-001. To: ${esc(broker)} — please release the entry report to Corridor on receipt of this signed page.</p>${foot()}`;
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
