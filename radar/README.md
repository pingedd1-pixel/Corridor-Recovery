# Corridor Radar v0.2 — free-source prospect scanner

Finds companies with tariff exposure from public sources, scores them 0–100, writes `out/prospects-<date>.csv` (one row per company, a one-line hook per source) for the Desk Clients tab or the CRM. Never contacts anyone.

## Run
```
export RADAR_CONTACT_EMAIL=you@example.com     # goes into the User-Agent; see below
pip install requests                            # or: uv run --with requests python3 radar.py
python3 radar.py                                # all sources, ISED chapters 84 85 73 94 39 48 44 21 19 20, 200 importers/chapter
python3 radar.py --chapters 94,44 --max-per 50 --sources ised,dir --top 10
```
`RADAR_CONTACT_EMAIL` is required: the script exits with code 2 without it. hello@corridorrecovery.com does not exist yet (domain not registered), so set the principal's current address until the domain is live. Do not put radar on a cron until then — a scheduled job with a dead contact address is the thing SEC and ISED block.

Playwright is optional. The ISED site renders server-side, so `requests` is enough; the script only falls back to headless Chromium if a page is blocked or stops rendering (`pip install playwright && playwright install chromium`). `RADAR_ISED_BROWSER=1` forces the browser path for testing.

## Sources
1. **ISED Canadian Importers Database (CID)** — the one that finds our clients. Canadian importers of US-origin goods by HS chapter → bucket **C** (surtax remission/drawback), region CA, province from the site. Columns: company, city, province, postal, product lines (HS6 codes and descriptions the company appears under).
2. **SEC EDGAR full-text search** — filings mentioning IEEPA refunds since 2026-02-20 → bucket B/large, calibration only. Each CIK is enriched from the SEC submissions API (`sic`, `sic_description`, `filer_category`, `state_of_incorporation`; SIC mapped to the sector prior). Responses are cached in `cache/` (gitignored).
3. **CourtListener** — CIT dockets for IEEPA / Section 122 / Section 301. Plaintiffs are already represented.
4. **Directory CSVs** dropped in `inputs/` (format: `inputs/TEMPLATE.csv`; the template is skipped and is the only file in `inputs/` that is committed) → bucket **A**.

## Scoring
Sector prior (share of exports not CUSMA-qualified) 40 · EDGAR disclosure 20 · CIT suit 25 · more than one source 5 · Canada 10 · BC/AB 10 · named contact or phone 10 · bucket A 15. Then, in this order:
- CIT plaintiffs: capped at **30**, tag `preservation-only (122/301)`.
- EDGAR-only public companies: capped at **35**, tag `public-co calibration`.
- Canadian-parented or Canada-registered: **+25 after the caps** (so it can exceed them) and bucket **A**, tag `canadian`, with the reason in the `canadian` column. Detected from SEC state codes (A0–A9, B0, Z4 = provinces / federal) on incorporation or business address, an ISED or directory match, or a name heuristic (Canada / Canadian / Ltée / Québec / Ontario / Alberta, plus `KNOWN_CANADIAN` in the script).
- `lead` column: Kruger Inc. / Kruger Products Inc. (the first real lead, per PK) — tag `lead`.
- Clamp to 0–100. Dedupe by normalised name; `mentions` counts how many times a company was seen; `source` lists every source it came from.

## ISED notes (verified 2026-09-14)
The old `ic.gc.ca/app/scr/ic/sbms/cid/` URLs 301 to `https://ised-isde.canada.ca/app/ixb/cid-bdic/`; the `hsCode`/`country` query parameters on the old URL are ignored there. The site has no 2-digit chapter search; the script walks its browse index instead:
- `searchProduct.html` — browse index, one link per HS4 group: `searchProductResults.html?hs4startCode=9401&hs4endCode=9406&hs6Code=9401` (chapters 84/85 have several groups).
- that results page lists HS6 codes as `productReport.html?hsCode=940161` with the description in the link text.
- `exportingCountries.html?hsCode=940161&countryCode=9` — "Major Canadian importers in 2024 from: United States" (`countryCode=9` is the United States option on `importingCountry.html`). One table, no pagination: `Company name / City / Province / Postal code`. Only the importers that together make up ~80 % of that HS6's import value are listed (confidentiality rule), so small importers are absent; some rows are non-resident importers with US addresses (region `other`). A 500 on this URL means no listing for that HS6 × country, not an outage.
- No company profile pages or links; `url` points at the HS6 × US table the company was found in. A per-page `.xls` export exists but is not needed.
- Cost: one request per HS4 group plus one per HS6 code until `--max-per` distinct importers per chapter, at 1 request/second; the default run is roughly 10–15 minutes.
- The cap stops the walk early, so the sample leans toward each chapter's first HS6 codes (chapter 85 reaches 200 within three codes). Raise `--max-per` or pass a narrower `--chapters` list to go deeper.

## Not yet
StatCan Trade Data Online by HS × province to refine sector priors; website/LinkedIn enrichment for a named contact; push to the CRM with dedupe against existing clients.
