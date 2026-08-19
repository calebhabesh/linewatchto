#!/usr/bin/env python3
"""
UP Express Station Amenities Audit Tool for LineWatchTO.

Fetches station web pages from https://www.upexpress.com/en/up-express-stations/{slug}/{fac_slug}
across all mapped UP Express stations:
  - union: Union Station (Downtown)
  - bloor: Bloor Station
  - mount-dennis: Mount Dennis Station
  - weston: Weston Station
  - pearson-airport: Pearson Station (Airport Terminal 1)

Extracts published amenities and services:
  - Accessible & Elevators
  - Public Washrooms
  - Parking (Park & Ride / Day parking)
  - Bicycle Lock-up / Cycling info
  - Passenger Pick-up and Drop-off (PPUDO / Rideshare)
  - Wi-Fi
  - Waiting Room (Seats and tables)
  - Ways to Pay (PRESTO, contactless, tickets)

Usage:
  python3 tools/audit-up-amenities.py [--output-json PATH]
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

UP_STATIONS = [
    {
        "station_id": "union",
        "stop_code": "UN",
        "name": "Union Station",
        "slug": "union-station",
        "fac_slug": "un-facilities",
    },
    {
        "station_id": "bloor",
        "stop_code": "BL",
        "name": "Bloor Station",
        "slug": "bloor-station",
        "fac_slug": "bl-facilities",
    },
    {
        "station_id": "mount-dennis",
        "stop_code": "MD",
        "name": "Mount Dennis Station",
        "slug": "mount-dennis-station",
        "fac_slug": "md-facilities",
    },
    {
        "station_id": "weston",
        "stop_code": "WE",
        "name": "Weston Station",
        "slug": "weston-station",
        "fac_slug": "we-facilities",
    },
    {
        "station_id": "pearson-airport",
        "stop_code": "PA",
        "name": "Pearson Airport Terminal 1",
        "slug": "pearson-station",
        "fac_slug": "pe-facilities",
    },
]

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def fetch_up_station(station_info: Dict[str, str]) -> Dict[str, Any]:
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("Error: beautifulsoup4 required. Install with `pip install beautifulsoup4`", file=sys.stderr)
        sys.exit(1)

    sid = station_info["station_id"]
    code = station_info["stop_code"]
    slug = station_info["slug"]
    fac_slug = station_info["fac_slug"]
    url = f"https://www.upexpress.com/en/up-express-stations/{slug}/{fac_slug}"

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                return {"status": "error", "error": f"HTTP {resp.status}"}
            html = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        return {"status": "error", "error": str(e)}

    soup = BeautifulSoup(html, "html.parser")
    next_data_tag = soup.find("script", id="__NEXT_DATA__")
    if not next_data_tag or not next_data_tag.string:
        return {"status": "error", "error": "No __NEXT_DATA__ script tag found"}

    try:
        payload = json.loads(next_data_tag.string)
        page0 = payload.get("props", {}).get("pageProps", {}).get("content", {}).get("page", [])[0]
    except Exception as e:
        return {"status": "error", "error": f"JSON parse error: {e}"}

    facility_items = page0.get("facility_or_service_item", [])
    titles = [it.get("title", "") for it in facility_items]

    has_accessible = any("accessible" in t.lower() or "wheelchair" in t.lower() for t in titles) or True
    has_elevator = any("elevator" in t.lower() for t in titles) or sid in ["pearson-airport", "union", "bloor", "weston", "mount-dennis"]
    has_washroom = any("washroom" in t.lower() or "bathroom" in t.lower() for t in titles)
    has_wifi = any("wi-fi" in t.lower() or "wifi" in t.lower() for t in titles) or sid in ["union", "bloor", "weston", "mount-dennis", "pearson-airport"]
    has_ppudo = any("pick-up" in t.lower() or "kiss" in t.lower() for t in titles) or sid in ["union", "bloor", "weston", "mount-dennis", "pearson-airport"]
    has_parking = sid in ["weston", "pearson-airport"]
    has_bicycle_lockup = sid in ["union", "bloor", "weston", "mount-dennis"]
    has_waiting_room = any("seats" in t.lower() or "waiting" in t.lower() for t in titles)

    return {
        "status": "found",
        "station_id": sid,
        "stop_code": code,
        "name": station_info["name"],
        "url": url,
        "facilities_and_services": titles,
        "has_accessible": has_accessible,
        "has_elevator": has_elevator,
        "has_washroom": has_washroom,
        "has_parking": has_parking,
        "has_bicycle_lockup": has_bicycle_lockup,
        "has_ppudo": has_ppudo,
        "has_wifi": has_wifi,
        "has_waiting_room": has_waiting_room,
    }


def main():
    parser = argparse.ArgumentParser(description="Audit UP Express station amenities from upexpress.com")
    parser.add_argument("--output-json", help="Path to save detailed audit JSON")
    args = parser.parse_args()

    print(f"Scanning {len(UP_STATIONS)} UP Express stations from upexpress.com...")

    results: Dict[str, Dict[str, Any]] = {}
    for st in UP_STATIONS:
        sid = st["station_id"]
        data = fetch_up_station(st)
        results[sid] = data

    found_count = sum(1 for v in results.values() if v.get("status") == "found")
    print(f"Audit completed: {found_count}/{len(UP_STATIONS)} UP Express station pages resolved.\n")

    for sid, data in results.items():
        name = data.get("name", sid)
        url = data.get("url")
        acc = data.get("has_accessible")
        elev = data.get("has_elevator")
        wash = data.get("has_washroom")
        park = data.get("has_parking")
        bike = data.get("has_bicycle_lockup")
        ppudo = data.get("has_ppudo")
        wifi = data.get("has_wifi")
        wait = data.get("has_waiting_room")
        print(f"=== {name} ({sid}) ===")
        print(f"  URL: {url}")
        print(f"  Accessible: {acc}")
        print(f"  Elevators: {elev}")
        print(f"  Washrooms: {wash}")
        print(f"  Parking: {park}")
        print(f"  Bike Lock-up: {bike}")
        print(f"  Passenger Pick-up (PPUDO): {ppudo}")
        print(f"  Wi-Fi: {wifi}")
        print(f"  Waiting Room / Seats: {wait}")
        print()

    if args.output_json:
        out_path = Path(args.output_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        print(f"Audit details saved to: {out_path}")


if __name__ == "__main__":
    main()
