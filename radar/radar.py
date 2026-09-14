#!/usr/bin/env python3
"""
Corridor Radar v0.2 — free-source prospect scanner → scored pipeline CSV.
Run by hand (or by Claude Code) on a machine with open internet. No paid data. No client contact.

Sources (all public, all free):
  1. ISED Canadian Importers Database (CID): Canadian companies importing US-origin goods by HS chapter
     → bucket C (Canadian surtax remission/drawback) and the pool our A clients come from. THE source that matters.
  2. SEC EDGAR full-text search: US public companies disclosing IEEPA exposure/refunds → calibration and bucket-B context
     (capped at 35). Enriched from the SEC submissions API: SIC → sector, filer size, state of incorporation.
  3. CourtListener (free API): Court of International Trade dockets (IEEPA / 122 / 301) → plaintiffs are already represented,
     so they are capped at 30 and tagged "preservation-only (122/301)".
  4. Directory CSVs dropped in ./inputs (see inputs/TEMPLATE.csv): BC Food & Beverage, BC Wood, CME BC, chambers.

Canadian-parented or Canada-registered companies (SEC state codes A0–A9/B0/Z4, name heuristics, a small known list)
get +25 after the caps and bucket A. Kruger (Kruger Inc. / Kruger Products Inc.) is flagged in the `lead` column.

Output: ./out/prospects-YYYY-MM-DD.csv — one row per company, deduped by normalised name, scored 0–100, one hook per source.

Scoring (0–100): sector prior (share of exports not CUSMA-qualified) 40 · EDGAR disclosure 20 · CIT suit 25 · more than one
source 5 · Canada 10 · BC/AB 10 · named contact/phone 10 · bucket A 15. Then the caps (CIT 30, EDGAR-only 35), then the
Canadian +25, then clamp to 100.

Needs RADAR_CONTACT_EMAIL in the environment (goes into the User-Agent so SEC/ISED can reach us). Exits 2 without it.
"""
import argparse, csv, html as htmlmod, json, os, re, sys, time, datetime as dt
from urllib.parse import quote, urlparse
try:
    import requests
except ImportError:
    sys.exit("pip install requests")

VERSION = "0.2"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR, IN_DIR, CACHE_DIR = (os.path.join(HERE, d) for d in ("out", "inputs", "cache"))
TODAY = dt.date.today().isoformat()
OUT = os.path.join(OUT_DIR, f"prospects-{TODAY}.csv")
UA = {}  # filled by init_ua(); never a made-up address

def log(msg):
    print(msg, flush=True)

def init_ua():
    email = os.environ.get("RADAR_CONTACT_EMAIL", "").strip()
    if "@" not in email:
        sys.stderr.write(
            "radar: RADAR_CONTACT_EMAIL is not set.\n"
            "  SEC and ISED ask automated clients to identify a real contact in the User-Agent, and\n"
            "  hello@corridorrecovery.com does not exist yet. Set the principal's current address, e.g.\n"
            "    RADAR_CONTACT_EMAIL=you@example.com python3 radar.py\n"
            "  Radar will not send a placeholder address.\n")
        sys.exit(2)
    UA["User-Agent"] = f"CorridorRadar/{VERSION} (contact: {email})"
    return UA

# ---------------------------------------------------------------- polite HTTP -----------------------------------------
_last = {}  # host → time of last request

def get(url, min_interval=1.0, headers=None, **kw):
    """One request per `min_interval` seconds per host. Raises requests exceptions to the caller."""
    host = urlparse(url).netloc
    wait = _last.get(host, 0) + min_interval - time.time()
    if wait > 0:
        time.sleep(wait)
    try:
        return requests.get(url, headers=headers or UA, timeout=30, **kw)
    finally:
        _last[host] = time.time()

_browser = None

def browser_fetch(url):
    """Headless-Chromium fallback for pages that stop rendering server-side. Needs `pip install playwright` +
    `playwright install chromium`. Returns None (with a log line) when Playwright is not available."""
    global _browser
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log("  browser fallback unavailable (pip install playwright; playwright install chromium)")
        return None
    try:
        if _browser is None:
            pw = sync_playwright().start()
            _browser = (pw, pw.chromium.launch(headless=True))
        page = _browser[1].new_page(user_agent=UA["User-Agent"])
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_selector("main", timeout=10000)
        html = page.content()
        page.close()
        time.sleep(1.0)
        return html
    except Exception as e:
        log(f"  browser fallback failed: {e}")
        return None

def browser_close():
    global _browser
    if _browser:
        try:
            _browser[1].close(); _browser[0].stop()
        except Exception:
            pass
        _browser = None

class SourceStop(Exception):
    """A source hit an error it should not retry through; return what it has so far."""

def fetch_html(url, none_on=()):
    """Server-rendered page → HTML text. Uses requests; falls back to a headless browser on a block (403/429) or a page
    with no <main> (a JS gate). Statuses in `none_on` mean "no data here" and return None. Raises SourceStop otherwise."""
    r = None
    if os.environ.get("RADAR_ISED_BROWSER") != "1":
        try:
            r = get(url)
        except requests.RequestException as e:
            log(f"  request failed: {e}")
        if r is not None:
            if r.status_code == 200 and "<main" in r.text:
                return r.text
            if r.status_code in none_on:
                return None
            log(f"  {r.status_code} for {url}; trying headless browser")
    html = browser_fetch(url)
    if html and "<main" in html:
        if "Error&nbsp;500" in html:  # the site's own error page (no data for this selection)
            if 500 in none_on:
                return None
        else:
            return html
    raise SourceStop(f"could not fetch {url}")

def strip_tags(s):
    return htmlmod.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()

def norm(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())[:40]

# ---------------------------------------------------------------- sector priors ---------------------------------------
# Share of Canadian exports NOT CUSMA-qualified in early 2025 (rough; refine from StatCan/US Census by HS).
SECTOR_NONCUSMA = {"furniture": 0.70, "food": 0.55, "beverage": 0.60, "packaging": 0.50, "machinery": 0.45, "plastics": 0.50,
                   "building products": 0.55, "apparel": 0.65, "sporting goods": 0.60, "electrical": 0.45, "paper": 0.40,
                   "chemicals": 0.35, "other": 0.45}

def sic_to_sector(sic):
    """SIC (4 digits, string) → SECTOR_NONCUSMA key. 26xx is paper except 265x (paperboard boxes) → packaging."""
    s = str(sic or "").strip()
    if not re.fullmatch(r"\d{4}", s):
        return "other"
    n = int(s)
    if 2500 <= n < 2600: return "furniture"
    if 2080 <= n < 2090: return "beverage"
    if 2000 <= n < 2100: return "food"
    if 2650 <= n < 2660 or n == 3085: return "packaging"
    if 2600 <= n < 2700: return "paper"
    if 3500 <= n < 3600: return "machinery"
    if 3000 <= n < 3100: return "plastics"
    if 2400 <= n < 2500 or 3200 <= n < 3300: return "building products"
    if 2200 <= n < 2400: return "apparel"
    if 3940 <= n < 3950: return "sporting goods"
    if 3600 <= n < 3700: return "electrical"
    if 2800 <= n < 2900: return "chemicals"
    return "other"

# ---------------------------------------------------------------- Canadian detection ----------------------------------
# SEC EDGAR state/country codes for Canada (from the EDGAR company-search code list).
SEC_CA_CODES = {"A0": "AB", "A1": "BC", "A2": "MB", "A3": "NB", "A4": "NL", "A5": "NS", "A6": "ON", "A7": "PE", "A8": "QC",
                "A9": "SK", "B0": "YT", "Z4": "CA (federal)"}
# Names we know are Canadian-parented. Kruger is the principal's first real lead. Add as we learn; keep it short.
KNOWN_CANADIAN = ["Kruger Products Inc.", "Kruger Inc.", "Kruger Products L.P.", "Canfor", "West Fraser", "Domtar",
                  "Cascades Inc.", "Bombardier", "Magna International", "Linamar", "Martinrea", "Dorel Industries",
                  "Maple Leaf Foods", "Saputo", "CCL Industries", "Resolute Forest Products", "Interfor", "Tolko",
                  "Ganong", "Premier Tech", "Groupe Lacasse", "Palliser Furniture", "Canada Goose", "Gildan Activewear"]
KNOWN_CANADIAN_KEYS = {norm(n) for n in KNOWN_CANADIAN}
CA_NAME_RE = re.compile(r"\bCanada\b|\bCanadian\b|\bLt[ée]e\b|\bLimit[ée]e\b|\bQu[ée]bec\b|\bOntario\b|\bAlberta\b", re.I)
LEAD_RE = re.compile(r"^kruger", re.I)

def canadian_by_name(name):
    """Heuristic for party names (CIT/EDGAR): explicit Canada/Canadian/Ltée, or on the known list. 'Inc.' alone says nothing."""
    k = norm(name)
    if any(k.startswith(kk) or kk.startswith(k) for kk in KNOWN_CANADIAN_KEYS if len(k) > 5 and len(kk) > 5):
        return "known Canadian list"
    if CA_NAME_RE.search(name):
        return "name"
    return ""

def mark_lead(r):
    if LEAD_RE.match(r.get("company", "")):
        r["lead"] = "Kruger — first real lead (per PK)"

# ---------------------------------------------------------------- 1. ISED CID ----------------------------------------
# Server-rendered site, no JS needed, no pagination (one page per HS6 × country). Verified 2026-09-14:
#   searchProduct.html                                    → browse index: one link per HS4 group per chapter
#   searchProductResults.html?hs4startCode=9401&hs4endCode=9406&hs6Code=9401 → HS6 codes in that group
#   exportingCountries.html?hsCode=940161&countryCode=9   → "Major Canadian importers in 2024 from: United States"
#   productReport.html?hsCode=940161                      → same table, all countries
# Company rows have no profile link; the table is name / city / province / postal code. Only importers that together
# make up ~80 % of the HS6's import value are listed (confidentiality rule), so small importers do not appear.
ISED = "https://ised-isde.canada.ca/app/ixb/cid-bdic"
ISED_COUNTRY = {"US": "9"}  # <option value="9">United States</option> on importingCountry.html
ISED_CHAPTERS = ("84", "85", "73", "94", "39", "48", "44", "21", "19", "20")
ISED_SECTOR = {"84": "machinery", "85": "electrical", "73": "building products", "94": "furniture", "39": "plastics",
               "48": "paper", "44": "building products", "21": "food", "19": "food", "20": "food", "22": "beverage",
               "95": "sporting goods", "61": "apparel", "62": "apparel"}
CA_PROVINCES = {"Alberta": "AB", "British Columbia": "BC", "Manitoba": "MB", "New Brunswick": "NB",
                "Newfoundland and Labrador": "NL", "Northwest Territories": "NT", "Nova Scotia": "NS", "Nunavut": "NU",
                "Ontario": "ON", "Prince Edward Island": "PE", "Quebec": "QC", "Saskatchewan": "SK", "Yukon": "YT"}
ISED_STATS = {}

def parse_importers(html):
    """The importers table → [(company, city, province, postal)]."""
    m = re.search(r"<table[^>]*>(?:(?!</table>).)*Company name.*?</table>", html, re.S)
    if not m:
        return []
    out = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(0), re.S):
        cells = [strip_tags(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(cells) >= 3 and cells[0]:
            out.append((cells[0], cells[1], cells[2], cells[3] if len(cells) > 3 else ""))
    return out

def ised_cid(hs_chapters=ISED_CHAPTERS, country="US", max_per=200):
    """ISED Canadian Importers Database: for each HS chapter, walk its HS6 codes and collect the importers of
    `country`-origin goods until `max_per` distinct companies for that chapter. ~1 request/second."""
    rows = []
    cc = ISED_COUNTRY.get(country, country)
    ISED_STATS.clear()
    try:
        index = fetch_html(f"{ISED}/searchProduct.html?lang=eng")
    except SourceStop as e:
        log(f"ised_cid: stopped at the browse index ({e}); returning 0 rows")
        return rows
    groups = re.findall(r"searchProductResults\.html\?hs4startCode=(\d{4})&(?:amp;)?hs4endCode=(\d{4})&(?:amp;)?hs6Code=(\d{4})", index)
    for ch in hs_chapters:
        ch_groups = [g for g in groups if g[0].startswith(ch)]
        if not ch_groups:
            log(f"ised_cid: chapter {ch} is not in the browse index; skipped")
            ISED_STATS[ch] = 0
            continue
        seen = {}  # norm name → row (dedupe within chapter, accumulate product lines)
        sector = ISED_SECTOR.get(ch, "other")
        hs6_pages = 0
        try:
            for s, e, h6 in ch_groups:
                results = fetch_html(f"{ISED}/searchProductResults.html?hs4startCode={s}&hs4endCode={e}&hs6Code={h6}")
                codes = re.findall(r'productReport\.html\?hsCode=(\d{6})"[^>]*>\s*\d{6}\s*-\s*([^<]+)<', results)
                for code, desc in codes:
                    desc = strip_tags(desc)
                    # A 500 here is the site's answer for "no importers listed for this HS6 x country" (the all-country
                    # page for the same code loads fine), so it is skipped rather than retried.
                    page = fetch_html(f"{ISED}/exportingCountries.html?hsCode={code}&countryCode={cc}", none_on=(500,))
                    hs6_pages += 1
                    if page is None:
                        continue
                    for name, city, prov, postal in parse_importers(page):
                        k = norm(name)
                        if not k:
                            continue
                        line = f"{code} {desc}"
                        if k in seen:
                            pl = seen[k]["_lines"]
                            if line not in pl:
                                pl.append(line)
                            continue
                        if len(seen) >= max_per:
                            break
                        ca = prov in CA_PROVINCES
                        seen[k] = {"source": "ISED-CID", "company": name, "city": city,
                                   "province": CA_PROVINCES.get(prov, prov), "postal": postal, "region": "CA" if ca else "other",
                                   "bucket": "C", "sector": sector, "hs_chapters": ch, "_lines": [line],
                                   "url": f"{ISED}/exportingCountries.html?hsCode={code}&countryCode={cc}",
                                   "hook": (f"Listed by ISED as a major importer of US-origin HS {ch} goods ({desc.lower()}) in 2024"
                                            + ("" if ca else " (non-resident importer)")
                                            + "; surtax paid since Mar 2025 is a remission/drawback question — ask what the entries show.")}
                    if len(seen) >= max_per:
                        break
                if len(seen) >= max_per:
                    break
        except SourceStop as e:
            log(f"ised_cid: chapter {ch} stopped early ({e}); keeping {len(seen)} rows")
            ISED_STATS[ch] = len(seen)
            rows += list(seen.values())
            break
        ISED_STATS[ch] = len(seen)
        log(f"  ISED chapter {ch}: {len(seen)} importers from {hs6_pages} HS6 pages")
        rows += list(seen.values())
    for r in rows:
        lines = r.pop("_lines")
        r["product_lines"] = "; ".join(lines[:6]) + (f"; +{len(lines) - 6} more" if len(lines) > 6 else "")
    return rows

# ---------------------------------------------------------------- 2. SEC EDGAR ---------------------------------------
def edgar_fts(query='"IEEPA" "refund"', forms=("10-Q", "10-K", "8-K"), max_pages=5):
    """SEC EDGAR full-text search: filings mentioning IEEPA refunds since 2026-02-20. EDGAR FTS returns 0 hits for a
    parenthesised OR group; plain quoted terms are AND-ed."""
    rows = []
    for page in range(1, max_pages + 1):
        url = (f"https://efts.sec.gov/LATEST/search-index?q={quote(query)}&dateRange=custom&startdt=2026-02-20&enddt={TODAY}"
               f"&forms={','.join(forms)}&page={page}")
        r = get(url, min_interval=0.5)
        if r.status_code != 200:
            log(f"  EDGAR FTS {r.status_code} on page {page}; stopping")
            break
        hits = r.json().get("hits", {}).get("hits", [])
        if not hits:
            break
        for h in hits:
            s = h["_source"]
            cik = (s.get("ciks") or [""])[0]
            acc, doc = (h["_id"].split(":") + [""])[:2]
            rows.append({"source": "EDGAR", "company": (s.get("display_names") or [""])[0].split(" (")[0].strip(), "cik": cik,
                         "form": s.get("form"), "filed": s.get("file_date"),
                         "url": f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{doc}",
                         "bucket": "B/large", "sector": "other", "region": "US",
                         "hook": "Disclosed IEEPA exposure in an SEC filing; check paid vs accepted vs received."})
    return rows

def sec_submissions(cik):
    """SEC submissions API, cached in ./cache (gitignored). Returns the JSON dict or None."""
    cik10 = str(cik).strip().zfill(10)
    path = os.path.join(CACHE_DIR, f"CIK{cik10}.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return None if d.get("_status") else d
    try:
        r = get(f"https://data.sec.gov/submissions/CIK{cik10}.json", min_interval=1.0)
    except requests.RequestException as e:
        log(f"  submissions {cik10}: {e}")
        return None
    if r.status_code != 200:
        log(f"  submissions {cik10}: {r.status_code}")
        if r.status_code == 404:
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"_status": 404}, f)
        return None
    d = r.json()
    d.pop("filings", None)  # the filing index is large and not needed
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f)
    return d

def enrich_edgar(rows):
    """Sector, size and Canadian signals for rows that carry a CIK."""
    n = 0
    for r in rows:
        if not r.get("cik"):
            continue
        d = sec_submissions(r["cik"])
        if not d:
            continue
        n += 1
        r["sic"] = d.get("sic", "")
        r["sic_description"] = d.get("sicDescription", "")
        r["filer_category"] = re.sub(r"\s*<br\s*/?>\s*", "; ", d.get("category", "") or "")
        r["state_of_incorporation"] = d.get("stateOfIncorporation", "")
        biz = (d.get("addresses") or {}).get("business") or {}
        r["business_state"] = biz.get("stateOrCountry", "")
        if r.get("sector", "other") == "other":
            r["sector"] = sic_to_sector(r["sic"])
        for code, where in ((r["state_of_incorporation"], "incorporated"), (r["business_state"], "business address")):
            if code in SEC_CA_CODES:
                r["canadian"] = f"SEC: {where} in {SEC_CA_CODES[code]} ({code})"
                break
    log(f"enrich_edgar: {n} companies enriched from the SEC submissions API")

# ---------------------------------------------------------------- 3. CourtListener -----------------------------------
def courtlistener(queries=("IEEPA tariff refund", "Section 122 tariff", "Section 301 forced labor tariff"), token=None):
    """CourtListener free API — CIT dockets. Token optional (higher limits)."""
    rows = []
    hdr = dict(UA)
    if token:
        hdr["Authorization"] = f"Token {token}"
    for q in queries:
        url = f"https://www.courtlistener.com/api/rest/v4/search/?type=d&q={quote(q)}&court=cit&order_by=dateFiled%20desc"
        try:
            r = get(url, min_interval=1.0, headers=hdr)
        except requests.RequestException as e:
            log(f"  CourtListener {q!r}: {e}")
            continue
        if r.status_code != 200:
            log(f"  CourtListener {q!r}: {r.status_code}")
            continue
        for d in r.json().get("results", [])[:50]:
            party = d.get("caseName", "").split(" v. ")[0].strip()
            if not party or "United States" in party:
                continue
            rows.append({"source": "CIT", "company": party, "form": "docket", "filed": d.get("dateFiled"),
                         "url": "https://www.courtlistener.com" + d.get("docket_absolute_url", ""),
                         "bucket": "B/large", "sector": "other", "region": "US",
                         "hook": f"Sued at CIT ({q}); already represented — preservation of 122/301 rights only."})
    return rows

# ---------------------------------------------------------------- 4. Directories -------------------------------------
def directories():
    """Any CSV in ./inputs (except TEMPLATE.csv) with columns: company, city, province, sector, website, contact, phone, notes."""
    rows = []
    for f in sorted(os.listdir(IN_DIR)):
        if not f.endswith(".csv") or f == "TEMPLATE.csv":
            continue
        with open(os.path.join(IN_DIR, f), encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                if not (r.get("company") or "").strip():
                    continue
                rows.append({"source": f"DIR:{f}", "company": r.get("company", "").strip(), "city": r.get("city", ""),
                             "province": r.get("province", ""), "sector": (r.get("sector", "") or "other").lower(),
                             "website": r.get("website", ""), "contact": r.get("contact", ""), "phone": r.get("phone", ""),
                             "notes": r.get("notes", ""), "bucket": "A", "region": "CA",
                             "hook": "Canadian exporter in a low-CUSMA-compliance sector; ask the five questions."})
    return rows

# ---------------------------------------------------------------- merge + score --------------------------------------
BUCKET_RANK = {"A": 3, "C": 2, "B/large": 1}

def dedupe(rows):
    seen = {}
    for r in rows:
        k = norm(r["company"])
        if not k:
            continue
        if k not in seen:
            r["mentions"] = 1
            seen[k] = r
            continue
        base = seen[k]
        base["mentions"] += 1
        srcs = base["source"].split("|")
        if r["source"] not in srcs:
            base["source"] += "|" + r["source"]
            if r["hook"] not in base["hook"]:
                base["hook"] += " / " + r["hook"]
        if BUCKET_RANK.get(r.get("bucket"), 0) > BUCKET_RANK.get(base.get("bucket"), 0):
            base["bucket"] = r["bucket"]
        if r.get("region") == "CA":
            base["region"] = "CA"
        for key, val in r.items():  # fill blanks (city, province, cik, contact ...)
            if val and not base.get(key):
                base[key] = val
        if r.get("sector", "other") != "other" and base.get("sector", "other") == "other":
            base["sector"] = r["sector"]
    return list(seen.values())

def detect_canadian(r):
    """Set r['canadian'] (why we think so) for EDGAR/CIT companies. ISED and directory rows are Canadian-market rows
    already; they only set the flag on a US-side company that merged with them."""
    if r.get("canadian"):
        return
    srcs = set(r["source"].split("|"))
    us_side = bool(srcs & {"EDGAR", "CIT"})
    if not us_side:
        return
    if "ISED-CID" in srcs and r.get("region") == "CA":
        r["canadian"] = "ISED: Canadian importer address"
        return
    if any(s.startswith("DIR:") for s in srcs):
        r["canadian"] = "directory: Canadian company"
        return
    why = canadian_by_name(r["company"])
    if why:
        r["canadian"] = f"name heuristic ({why})"

def score(r):
    s = 40 * SECTOR_NONCUSMA.get(r.get("sector", "other"), 0.45)  # exposure prior
    srcs = set(r["source"].split("|"))
    edgar, cit = "EDGAR" in srcs, "CIT" in srcs
    if edgar: s += 20                                   # disclosed exposure
    if cit: s += 25                                     # sued = exposed, deadlines matter
    if len(srcs) > 1: s += 5                            # seen in more than one source
    if r.get("region") == "CA": s += 10                 # our home market
    if r.get("province", "") in ("BC", "AB"): s += 10
    if r.get("contact") or r.get("phone"): s += 10
    if r.get("bucket") == "A": s += 15                  # bucket-B referrals come from A clients
    tags = []
    if cit:                                             # already represented at CIT
        s = min(s, 30); tags.append("preservation-only (122/301)")
    elif edgar:                                         # public-company calibration / bucket-B context
        s = min(s, 35); tags.append("public-co calibration")
    if r.get("canadian"):                               # after the caps, so it can exceed them
        s += 25; r["bucket"] = "A"; tags.append("canadian")
    if r.get("lead"):
        tags.append("lead")
    r["tag"] = "; ".join(tags)
    return round(max(0.0, min(s, 100.0)), 1)

COLS = ["score", "company", "bucket", "tag", "lead", "region", "province", "city", "postal", "sector", "sic", "sic_description",
        "filer_category", "state_of_incorporation", "canadian", "source", "mentions", "hook", "product_lines", "cik", "url",
        "website", "contact", "phone", "notes", "stage", "scanned"]

def summary(out, top):
    per_src = {}
    for r in out:
        for s in r["source"].split("|"):
            key = "DIR" if s.startswith("DIR:") else s
            per_src[key] = per_src.get(key, 0) + 1
    log("companies per source (after dedupe): " + ", ".join(f"{k} {v}" for k, v in sorted(per_src.items())))
    if ISED_STATS:
        log("ISED per chapter: " + ", ".join(f"{k} {v}" for k, v in ISED_STATS.items()))
    bands = {}
    for r in out:
        b = min(int(r["score"] // 20) * 20, 80)
        bands[b] = bands.get(b, 0) + 1
    log("score distribution: " + ", ".join(f"{b}–{b + 19 if b < 80 else 100}: {bands.get(b, 0)}" for b in (0, 20, 40, 60, 80)))
    leads = [r for r in out if r.get("lead")]
    log("leads flagged: " + (", ".join(f"{r['company']} ({r['score']})" for r in leads) if leads else "none"))
    if top:
        log(f"top {top}:")
        for r in out[:top]:
            log(f"  {r['score']:5.1f} {r['bucket']:8s} {r['company'][:40]:40s} {r.get('sector',''):18s} "
                f"{r.get('tag','')[:32]:32s} {r['source'][:22]:22s} {r['hook'][:90]}")

def main():
    ap = argparse.ArgumentParser(description="Corridor Radar — free-source prospect scanner")
    ap.add_argument("--chapters", default=",".join(ISED_CHAPTERS), help="ISED HS chapters, comma-separated")
    ap.add_argument("--max-per", type=int, default=200, help="max distinct importers per ISED chapter")
    ap.add_argument("--sources", default="ised,edgar,cit,dir", help="subset of ised,edgar,cit,dir")
    ap.add_argument("--top", type=int, default=25, help="print the top N after the run (0 = none)")
    a = ap.parse_args()
    init_ua()
    for d in (OUT_DIR, IN_DIR, CACHE_DIR):
        os.makedirs(d, exist_ok=True)
    want = set(a.sources.split(","))
    chapters = tuple(c.strip() for c in a.chapters.split(",") if c.strip())
    plan = [("ised", lambda: ised_cid(chapters, "US", a.max_per)), ("edgar", edgar_fts), ("cit", courtlistener), ("dir", directories)]
    rows = []
    for name, fn in plan:
        if name not in want:
            continue
        try:
            got = fn(); log(f"{name}: {len(got)} rows"); rows += got
        except Exception as e:
            log(f"{name} failed: {e}")
    browser_close()
    out = dedupe(rows)
    try:
        enrich_edgar(out)
    except Exception as e:
        log(f"enrich_edgar failed: {e}")
    for r in out:
        detect_canadian(r); mark_lead(r)
        r["score"] = score(r); r["stage"] = "Lead"; r["scanned"] = TODAY
    out.sort(key=lambda r: (-r["score"], r["company"]))
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLS, extrasaction="ignore"); w.writeheader(); w.writerows(out)
    log(f"wrote {OUT}: {len(out)} prospects")
    summary(out, a.top)

if __name__ == "__main__":
    main()
