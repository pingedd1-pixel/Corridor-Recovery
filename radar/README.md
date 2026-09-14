# Corridor Radar — free-source prospect scanner
`pip install requests` then `python3 radar.py`. Outputs `out/prospects-<date>.csv` scored 0–100 with a one-line hook per company, ready to import into the Desk Clients tab or the CRM.
Sources: SEC EDGAR full-text (IEEPA refund disclosures), CourtListener CIT dockets (IEEPA / 122 / 301 plaintiffs), ISED Canadian Importers Database (US-origin imports by HS chapter), and any directory CSVs dropped in `inputs/`.
Weekly cron. Never contacts anyone. Selectors for ISED may need adjusting when the site changes — that's a 10-minute fix, not a redesign.
Next (M3): StatCan Trade Data Online by HS×province to refine sector priors; LinkedIn/website enrichment for a named contact; auto-push to CRM with dedupe against existing clients.
