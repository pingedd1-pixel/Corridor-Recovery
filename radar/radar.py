#!/usr/bin/env python3
"""
Corridor Radar v0.1 — free-source prospect scanner → scored pipeline CSV.
Run by Claude Code / a cron on a machine with open internet. No paid data. No client contact.
Sources (all public, all free):
  1. SEC EDGAR full-text search: companies disclosing IEEPA tariff exposure/refunds (US public cos → bucket B / calibration).
  2. CourtListener (free API): Court of International Trade dockets mentioning IEEPA / Section 122 / Section 301 → parties who sued = sophisticated, exposed.
  3. ISED Canadian Importers Database (scrape): Canadian companies importing US goods under target HS chapters → bucket C (surtax) and A candidates.
  4. Directory CSVs you drop in ./inputs (BC Food & Beverage, BC Wood, CME BC, chambers): name, city, sector, website.
Output: ./out/prospects-YYYY-MM-DD.csv  (one row per company, deduped, scored, with a one-line hook) → import into Desk Clients tab / CRM.
Scoring (0–100): exposure signal (sector CUSMA rate, disclosed $) 40 · urgency (evidence of unfiled / lagging refunds, deadlines) 25 · reachability (named contact, BC/AB, website) 20 · bucket-B leverage (US customers likely IOR) 15.
"""
import csv, json, os, re, sys, time, datetime as dt
from urllib.parse import quote
try:
    import requests
except ImportError:
    sys.exit("pip install requests --break-system-packages")

TODAY=dt.date.today().isoformat()
OUT=f"out/prospects-{TODAY}.csv"; os.makedirs("out",exist_ok=True); os.makedirs("inputs",exist_ok=True)
UA={"User-Agent":"CorridorRadar/0.1 (contact: hello@corridorrecovery.com)"}

# Sector priors: share of Canadian exports NOT CUSMA-qualified in early 2025 (rough; refine from StatCan/US Census by HS)
SECTOR_NONCUSMA={"furniture":0.70,"food":0.55,"beverage":0.60,"packaging":0.50,"machinery":0.45,"plastics":0.50,"building products":0.55,"apparel":0.65,"sporting goods":0.60,"electrical":0.45,"paper":0.40,"chemicals":0.35,"other":0.45}

def edgar_fts(query='"IEEPA" AND ("refund" OR "tariff refund")', forms=("10-Q","10-K","8-K"), max_pages=5):
    """SEC EDGAR full-text search. Returns filings mentioning IEEPA refunds (last ~12 months)."""
    rows=[]
    for page in range(1,max_pages+1):
        url=f"https://efts.sec.gov/LATEST/search-index?q={quote(query)}&dateRange=custom&startdt=2026-02-20&enddt={TODAY}&forms={','.join(forms)}&page={page}"
        r=requests.get(url,headers=UA,timeout=30)
        if r.status_code!=200: break
        hits=r.json().get("hits",{}).get("hits",[])
        if not hits: break
        for h in hits:
            s=h["_source"]
            rows.append({"source":"EDGAR","company":s.get("display_names",[""])[0].split(" (")[0],"cik":s.get("ciks",[""])[0],"form":s.get("form"),"filed":s.get("file_date"),"url":f"https://www.sec.gov/Archives/edgar/data/{s.get('ciks',[''])[0]}/{h['_id'].split(':')[0].replace('-','')}/{h['_id'].split(':')[1]}","bucket":"B/large","sector":"other","region":"US","hook":"Disclosed IEEPA exposure in SEC filing; check paid vs accepted vs received."})
        time.sleep(0.2)
    return rows

def courtlistener(queries=("IEEPA tariff refund","Section 122 tariff","Section 301 forced labor tariff"), token=None):
    """CourtListener free API — CIT dockets. Token optional (higher limits)."""
    rows=[]; hdr=dict(UA); 
    if token: hdr["Authorization"]=f"Token {token}"
    for q in queries:
        url=f"https://www.courtlistener.com/api/rest/v4/search/?type=d&q={quote(q)}&court=cit&order_by=dateFiled%20desc"
        r=requests.get(url,headers=hdr,timeout=30)
        if r.status_code!=200: continue
        for d in r.json().get("results",[])[:50]:
            name=d.get("caseName","")
            party=name.split(" v. ")[0].strip()
            if not party or "United States" in party: continue
            rows.append({"source":"CIT","company":party,"form":"docket","filed":d.get("dateFiled"),"url":"https://www.courtlistener.com"+d.get("docket_absolute_url",""),"bucket":"B/large","sector":"other","region":"US","hook":f"Sued at CIT ({q}); exposed and sophisticated — ask about unfiled entries and 122/301 preservation."})
        time.sleep(0.5)
    return rows

def ised_cid(hs_chapters=("84","85","73","94","39","48"), country="US", max_per=200):
    """ISED Canadian Importers Database — scrape search results by HS chapter (structure may change; adjust selectors)."""
    rows=[]
    for ch in hs_chapters:
        url=f"https://www.ic.gc.ca/app/scr/ic/sbms/cid/searchProduct.html?lang=eng&hsCode={ch}&country={country}"
        try:
            r=requests.get(url,headers=UA,timeout=30)
        except Exception: continue
        if r.status_code!=200: continue
        for m in re.finditer(r'companyProfile\.html\?[^"]*companyId=(\d+)[^>]*>([^<]+)<',r.text):
            rows.append({"source":"ISED-CID","company":m.group(2).strip(),"url":"https://www.ic.gc.ca/app/scr/ic/sbms/cid/companyProfile.html?companyId="+m.group(1),"bucket":"C","sector":{"84":"machinery","85":"electrical","73":"building products","94":"furniture","39":"plastics","48":"paper"}.get(ch,"other"),"region":"CA","hook":f"Imports US goods (HS {ch}); likely paid Canadian surtax since Mar 2025 — remission/drawback candidate."})
            if len(rows)>=max_per*len(hs_chapters): break
        time.sleep(1)
    return rows

def directories():
    """Any CSV in ./inputs with columns: company, city, province, sector, website, contact, phone, notes"""
    rows=[]
    for f in os.listdir("inputs"):
        if not f.endswith(".csv"): continue
        for r in csv.DictReader(open(os.path.join("inputs",f),encoding="utf-8-sig")):
            rows.append({"source":f"DIR:{f}","company":r.get("company",""),"city":r.get("city",""),"province":r.get("province",""),"sector":(r.get("sector","") or "other").lower(),"website":r.get("website",""),"contact":r.get("contact",""),"phone":r.get("phone",""),"bucket":"A","region":"CA","hook":"Canadian exporter in a low-CUSMA-compliance sector; ask the five questions."})
    return rows

def score(r):
    s=0.0
    sec=SECTOR_NONCUSMA.get(r.get("sector","other"),0.45)
    s+=40*sec                                  # exposure prior
    if r["source"]=="EDGAR": s+=20             # disclosed exposure
    if r["source"]=="CIT": s+=25               # sued = exposed + deadlines matter
    if r.get("region")=="CA": s+=10            # our home market
    if r.get("province","") in ("BC","AB"): s+=10
    if r.get("contact") or r.get("phone"): s+=10
    if r.get("bucket")=="A": s+=15             # bucket-B leverage lives with A clients
    return round(min(s,100),1)

def main():
    rows=[]
    for fn in (edgar_fts,courtlistener,ised_cid,directories):
        try:
            got=fn(); print(f"{fn.__name__}: {len(got)}"); rows+=got
        except Exception as e:
            print(f"{fn.__name__} failed: {e}")
    seen={}; 
    for r in rows:
        k=re.sub(r"[^a-z0-9]","",r["company"].lower())[:40]
        if not k: continue
        if k in seen:
            seen[k]["source"]+="|"+r["source"]; seen[k]["hook"]+=" / "+r["hook"]
        else: seen[k]=r
    out=list(seen.values())
    for r in out: r["score"]=score(r); r["stage"]="Lead"; r["scanned"]=TODAY
    out.sort(key=lambda r:-r["score"])
    cols=["score","company","bucket","region","province","city","sector","source","hook","url","website","contact","phone","stage","scanned"]
    with open(OUT,"w",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f,fieldnames=cols,extrasaction="ignore"); w.writeheader(); w.writerows(out)
    print(f"wrote {OUT}: {len(out)} prospects")
if __name__=="__main__": main()
