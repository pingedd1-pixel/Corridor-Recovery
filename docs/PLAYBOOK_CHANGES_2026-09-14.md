# Playbook changes to apply — CM-PB-2026-002 (for FOUNDER; approved by PK 2026-09-14)
The counsel-draft templates are now the source of truth for legal wording. `docs/SALES_PLAYBOOK.pdf` is FOUNDER's document; these are the exact edits so the playbook matches the templates and the `rules` table. Source of each value: `src/db/migrations/005_legal_terms_approved.sql`.

| Section | Now says | Change to |
|---|---|---|
| §5 What we need from them | "A signed one-page authorization + our NDA … lets our partner broker pull their entry data" | "A signed authorization (CM-AU-2026) and mutual NDA (CM-NDA-2026). The authorization lets Corridor obtain entry records from the client's brokers, forwarders and ACE, engage and instruct licensed Filing Brokers, and communicate with CBP/CBSA through them; the client signs any broker POA. It never lets Corridor receive funds or bind the client beyond the engagement letter." |
| §6 Fees — "Complex US refund" | "20–25% of refund" | "22.5% of the refund received, including interest (band 20–25%; never below 20%)" |
| §6 Fees — "Canadian surtax remission / drawback" | "20–30% of recovery" | "25% of the amount recovered" |
| §6 Fees — payment | "We invoice when their money arrives." | "We invoice when their money arrives; payment due within 15 days; no retainer; fees exclusive of GST/HST." |
| §6 Fees — new line | — | "Exclusivity: 12 months from signature, then until matters opened in the term close. Either side may end on 30 days' notice; fees stay payable on work done before." |
| §7 Process, step 2 | "Send the engagement letter and authorization (templates CM-EL-001, CM-AU-001)" | "Send the engagement letter, authorization and mutual NDA (CM-EL-2026, CM-AU-2026, CM-NDA-2026). Filing brokers sign CM-BSA-2026 before their first filing." |
| §5 / §9 data answer | "you sign one page, your broker sends the entry report" | keep, and add: "Your data is deleted or returned 30 days after your last matter closes." |
| §10 Never says | — | add: "a fee below 20% on protest work, or any figure not on the findings sheet" |

Still placeholders pending counsel (do not quote): broker flat fees and share, non-circumvention months, BSA term, dispute clause, BSA governing law, authorization validity months.
