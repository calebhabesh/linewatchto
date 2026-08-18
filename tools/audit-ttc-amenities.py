#!/usr/bin/env python3
"""
TTC Station Amenities Audit Tool for LineWatchTO.

Fetches station web pages from https://www.ttc.ca/subway-stations/* across all mapped
rapid transit stations (subway & LRT) and extracts published amenities:
  - Accessible & Elevators
  - Washrooms (including concourse / station overview table locations)
  - Parking (lot names, rates, and hours)
  - Bicycle Lock-up
  - Bicycle Repair Stand
  - Bike Share Toronto
  - Passenger Pick-up / Drop-off (PPUDO)

Usage:
  python3 tools/audit-ttc-amenities.py [--output-json PATH] [--generate-sql PATH]
"""

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
ALIASES_CSV = REPO_ROOT / "backend/src/main/resources/arrival/rapid-transit-station-aliases.csv"

SLUG_OVERRIDES = {
    "o_connor": "oconnor",
    "greenwoood": "greenwood",
    "tmu": "toronto-metropolitan-university",
    "aga-khan-park-and-museum": "aga-khan-park-museum",
    "st-andrew": "st-andrew",
    "st-clair": "st-clair",
    "st-clair-west": "st-clair-west",
    "st-george": "st-george",
    "st-patrick": "st-patrick",
}


def load_station_ids() -> List[str]:
    station_ids: Set[str] = set()
    if not ALIASES_CSV.exists():
        print(f"Error: Aliases CSV not found at {ALIASES_CSV}", file=sys.stderr)
        sys.exit(1)

    with open(ALIASES_CSV, "r", encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                sid = stripped.split(",")[0].strip()
                if sid and sid != "station_id":
                    station_ids.add(sid)
    return sorted(station_ids)


def fetch_station(sid: str) -> Tuple[str, Dict[str, Any]]:
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("Error: beautifulsoup4 required. Install with `pip install beautifulsoup4`", file=sys.stderr)
        sys.exit(1)

    slug = SLUG_OVERRIDES.get(sid, sid)
    candidate_urls = [
        f"https://www.ttc.ca/subway-stations/{slug}-station",
        f"https://www.ttc.ca/subway-stations/{slug}",
        f"https://www.ttc.ca/subway-stations/{sid}-station",
        f"https://www.ttc.ca/subway-stations/{sid}",
    ]

    found_url = None
    html = None

    for url in candidate_urls:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    found_url = url
                    html = resp.read().decode("utf-8", errors="ignore")
                    break
        except Exception:
            pass

    if not found_url or not html:
        return sid, {"status": "not_found"}

    soup = BeautifulSoup(html, "html.parser")

    # 1. Feature badges
    features: Set[str] = set()
    for feat in soup.find_all(class_=re.compile(r"feature", re.I)):
        for item in feat.find_all(["span", "p", "div", "li", "a"]):
            t = item.get_text(strip=True)
            if t and len(t) < 40 and not any(skip in t.lower() for skip in ["station feature", "skip to", "subway"]):
                features.add(t)
        t = feat.get_text(strip=True)
        if t and len(t) < 40 and not any(skip in t.lower() for skip in ["station feature", "skip to", "subway"]):
            features.add(t)

    clean_features: Set[str] = set()
    for f in features:
        if f in [
            "Accessible",
            "Parking",
            "Washrooms",
            "Bike Share",
            "Bicycle lock-up",
            "Bicycle repair stand",
            "Passenger pick-up/drop-off area",
            "Passenger pick-up/drop-off area (PPUDO)",
            "WiFi",
            "Wi-Fi",
        ]:
            clean_features.add(f)
        elif len(f) < 35 and not any(f.startswith(x) and len(f) > len(x) for x in ["Accessible", "Parking", "Washrooms"]):
            clean_features.add(f)

    # 2. Check Parking
    has_parking_feature = any("parking" in f.lower() and "bicycle" not in f.lower() for f in clean_features)
    parking_details: List[str] = []
    for h in soup.find_all(["h2", "h3", "h4"]):
        htext = h.get_text(strip=True)
        if "parking" in htext.lower() and "bicycle" not in htext.lower() and "bike" not in htext.lower():
            nxt = h.find_next_sibling()
            if nxt:
                parking_details.append(nxt.get_text(strip=True))

    has_parking = has_parking_feature or (
        len(parking_details) > 0 and not any("no commuter parking" in d.lower() for d in parking_details)
    )

    # 3. Check Washroom
    has_washroom_feature = any("washroom" in f.lower() for f in clean_features)
    washroom_details: List[str] = []
    for tr in soup.find_all("tr"):
        text = tr.get_text(strip=True)
        if "washroom" in text.lower() and "none" not in text.lower() and "no public" not in text.lower():
            washroom_details.append(text)
    for li in soup.find_all(["li", "p", "dd"]):
        text = li.get_text(strip=True)
        if text.lower().startswith("washrooms") or ("located at" in text.lower() and "washroom" in text.lower()):
            washroom_details.append(text)

    has_washroom = has_washroom_feature or len(washroom_details) > 0

    # 4. Bicycle amenities
    has_bike_share = any("bike share" in f.lower() for f in clean_features)
    has_bicycle_lockup = any("bicycle lock" in f.lower() for f in clean_features)
    has_bicycle_repair = any("bicycle repair" in f.lower() or "repair stand" in f.lower() for f in clean_features)

    # 5. PPUDO
    has_ppudo = any("pick-up" in f.lower() or "drop-off" in f.lower() or "ppudo" in f.lower() for f in clean_features)

    # 6. Wheelchair Accessible
    has_accessible = any("accessible" in f.lower() for f in clean_features)

    return sid, {
        "status": "found",
        "url": found_url,
        "features": sorted(clean_features),
        "has_accessible": has_accessible,
        "has_washroom": has_washroom,
        "has_parking": has_parking,
        "has_bicycle_lockup": has_bicycle_lockup,
        "has_bicycle_repair": has_bicycle_repair,
        "has_bike_share": has_bike_share,
        "has_ppudo": has_ppudo,
        "washroom_details": washroom_details[:2],
        "parking_details": parking_details[:2],
    }


def main():
    parser = argparse.ArgumentParser(description="Audit TTC station amenities from ttc.ca")
    parser.add_argument("--output-json", help="Path to save detailed audit JSON")
    parser.add_argument("--generate-sql", help="Path to write Flyway migration SQL script")
    parser.add_argument("--concurrency", type=int, default=10, help="Parallel HTTP request concurrency")
    args = parser.parse_args()

    station_ids = load_station_ids()
    print(f"Scanning {len(station_ids)} TTC stations from ttc.ca with concurrency {args.concurrency}...")

    results: Dict[str, Dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {executor.submit(fetch_station, sid): sid for sid in station_ids}
        for future in as_completed(futures):
            sid, data = future.result()
            results[sid] = data

    found_count = sum(1 for v in results.values() if v.get("status") == "found")
    print(f"Audit completed: {found_count}/{len(station_ids)} station pages resolved.\n")

    # Categories
    washroom_sids = sorted(k for k, v in results.items() if v.get("has_washroom"))
    parking_sids = sorted(k for k, v in results.items() if v.get("has_parking"))
    lockup_sids = sorted(k for k, v in results.items() if v.get("has_bicycle_lockup"))
    repair_sids = sorted(k for k, v in results.items() if v.get("has_bicycle_repair"))
    share_sids = sorted(k for k, v in results.items() if v.get("has_bike_share"))
    ppudo_sids = sorted(k for k, v in results.items() if v.get("has_ppudo"))

    print(f"Washrooms ({len(washroom_sids)}): {', '.join(washroom_sids)}")
    print(f"Parking ({len(parking_sids)}): {', '.join(parking_sids)}")
    print(f"Bicycle Lock-up ({len(lockup_sids)}): {len(lockup_sids)} stations")
    print(f"Bicycle Repair Stand ({len(repair_sids)}): {len(repair_sids)} stations")
    print(f"Bike Share Toronto ({len(share_sids)}): {len(share_sids)} stations")
    print(f"PPUDO ({len(ppudo_sids)}): {', '.join(ppudo_sids)}")

    if args.output_json:
        out_path = Path(args.output_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        print(f"\nAudit details saved to: {out_path}")

    if args.generate_sql:
        sql_path = Path(args.generate_sql)
        sql_path.parent.mkdir(parents=True, exist_ok=True)
        sql_content = [
            "-- Generated by tools/audit-ttc-amenities.py",
            "alter table stations",
            "    add column if not exists has_bicycle_lockup boolean not null default false,",
            "    add column if not exists has_bicycle_repair boolean not null default false,",
            "    add column if not exists has_bike_share boolean not null default false,",
            "    add column if not exists has_ppudo boolean not null default false;",
            "",
            "update stations set has_washroom = true where id in (",
            ",\n".join(f"    '{s}'" for s in washroom_sids),
            ");",
            "",
            "update stations set has_parking = true where id in (",
            ",\n".join(f"    '{s}'" for s in parking_sids),
            ");",
            "",
            "update stations set has_bicycle_lockup = true where id in (",
            ",\n".join(f"    '{s}'" for s in lockup_sids),
            ");",
            "",
            "update stations set has_bicycle_repair = true where id in (",
            ",\n".join(f"    '{s}'" for s in repair_sids),
            ");",
            "",
            "update stations set has_bike_share = true where id in (",
            ",\n".join(f"    '{s}'" for s in share_sids),
            ");",
            "",
            "update stations set has_ppudo = true where id in (",
            ",\n".join(f"    '{s}'" for s in ppudo_sids),
            ");",
            "",
        ]
        with open(sql_path, "w", encoding="utf-8") as f:
            f.write("\n".join(sql_content))
        print(f"Flyway SQL migration generated at: {sql_path}")


if __name__ == "__main__":
    main()
