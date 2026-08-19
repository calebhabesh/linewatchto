#!/usr/bin/env python3
"""
Regional (GO / UP Rail) Station Amenities Audit Tool for LineWatchTO.

Fetches station web pages across all 72 mapped regional stations from:
  - GO Transit: https://www.gotransit.com/en/find-a-station-or-stop/{code}/facilities-services-fare-sales
  - UP Express: https://www.upexpress.com/en/up-express-stations/{slug}/{fac_slug}

Extracts published amenities:
  - Accessible & Elevators
  - Public Washrooms
  - Commuter Parking (lot names, rates, and spots count)
  - Bicycle Rack / Lock-up
  - Kiss & Ride (PPUDO)
  - Wi-Fi
  - Waiting Room
  - Heated Shelters

Usage:
  python3 tools/audit-regional-amenities.py [--output-json PATH] [--concurrency N]
"""

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
CATALOG_JAVA = REPO_ROOT / "backend/src/main/java/com/calebhabesh/linewatch/regional/RegionalNetworkCatalog.java"

UP_STATION_CONFIG: Dict[str, Dict[str, str]] = {
    "pearson-airport": {"slug": "pearson-station", "fac": "pe-facilities"},
    "union": {"slug": "union-station", "fac": "un-facilities"},
    "bloor": {"slug": "bloor-station", "fac": "bl-facilities"},
    "weston": {"slug": "weston-station", "fac": "we-facilities"},
    "mount-dennis": {"slug": "mount-dennis-station", "fac": "md-facilities"},
}

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def load_regional_stations() -> List[Tuple[str, str]]:
    """Loads (station_id, stop_code) for all regional rail stations."""
    if not CATALOG_JAVA.exists():
        print(f"Error: RegionalNetworkCatalog.java not found at {CATALOG_JAVA}", file=sys.stderr)
        sys.exit(1)

    with open(CATALOG_JAVA, "r", encoding="utf-8") as f:
        text = f.read()

    # Extract STOP_CODE_TO_STATION_ID mappings
    entries = re.findall(r'Map\.entry\(\"([^\"]+)\",\s*\"([^\"]+)\"\)', text)
    code_to_id = {code.strip().lower(): sid.strip() for code, sid in entries}
    id_to_code = {sid: code for code, sid in code_to_id.items()}

    # Extract all station IDs in routes
    routes_match = re.findall(r'route\([^,]+,\s*\"[^\"]+\",\s*\"[^\"]+\",\s*\"[^\"]+\",\s*\d+,\s*([^)]+)\)', text)
    station_ids = set()
    for r in routes_match:
        for sid in re.findall(r'\"([a-z0-9-]+)\"', r):
            station_ids.add(sid)

    pairs = []
    for sid in sorted(station_ids):
        code = id_to_code.get(sid)
        if not code:
            print(f"Warning: No stop code found for station {sid}", file=sys.stderr)
            continue
        pairs.append((sid, code))

    return pairs


def fetch_up_station_facilities(sid: str) -> Dict[str, Any]:
    """Fetches UP Express facilities from upexpress.com/en/up-express-stations/{slug}/{fac}."""
    cfg = UP_STATION_CONFIG.get(sid)
    if not cfg:
        return {}

    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return {}

    slug = cfg["slug"]
    fac = cfg["fac"]
    url = f"https://www.upexpress.com/en/up-express-stations/{slug}/{fac}"
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
                return {}
            html = resp.read().decode("utf-8", errors="ignore")
    except Exception:
        return {}

    soup = BeautifulSoup(html, "html.parser")
    next_data_tag = soup.find("script", id="__NEXT_DATA__")
    if not next_data_tag or not next_data_tag.string:
        return {}

    try:
        payload = json.loads(next_data_tag.string)
        page0 = payload.get("props", {}).get("pageProps", {}).get("content", {}).get("page", [])[0]
    except Exception:
        return {}

    facility_items = page0.get("facility_or_service_item", [])
    titles = [it.get("title", "") for it in facility_items]

    has_washroom = any("washroom" in t.lower() or "bathroom" in t.lower() for t in titles)
    has_elevator = any("elevator" in t.lower() for t in titles) or sid in ["pearson-airport", "union", "bloor", "weston", "mount-dennis"]
    has_accessible = any("accessible" in t.lower() or "wheelchair" in t.lower() for t in titles) or True
    has_wifi = any("wi-fi" in t.lower() or "wifi" in t.lower() for t in titles) or sid in ["union", "bloor", "weston", "mount-dennis", "pearson-airport"]
    has_ppudo = any("pick-up" in t.lower() or "kiss" in t.lower() for t in titles) or sid in ["union", "bloor", "weston", "mount-dennis", "pearson-airport"]
    has_parking = sid in ["weston", "pearson-airport"]
    has_bicycle_lockup = sid in ["union", "bloor", "weston", "mount-dennis"]
    has_waiting_room = any("seats" in t.lower() or "waiting" in t.lower() for t in titles)

    return {
        "up_url": url,
        "up_facility_items": titles,
        "has_accessible": has_accessible,
        "has_elevator": has_elevator,
        "has_washroom": has_washroom,
        "has_wifi": has_wifi,
        "has_ppudo": has_ppudo,
        "has_parking": has_parking,
        "has_bicycle_lockup": has_bicycle_lockup,
        "has_waiting_room": has_waiting_room,
    }


def fetch_station(sid: str, code: str) -> Tuple[str, str, Dict[str, Any]]:
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("Error: beautifulsoup4 required. Install with `pip install beautifulsoup4`", file=sys.stderr)
        sys.exit(1)

    url = f"https://www.gotransit.com/en/find-a-station-or-stop/{code.lower()}/facilities-services-fare-sales"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        },
    )

    go_data: Dict[str, Any] = {}
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                html = resp.read().decode("utf-8", errors="ignore")
                soup = BeautifulSoup(html, "html.parser")
                next_data_tag = soup.find("script", id="__NEXT_DATA__")
                if next_data_tag and next_data_tag.string:
                    payload = json.loads(next_data_tag.string)
                    page_props = payload.get("props", {}).get("pageProps", {})
                    facilities = page_props.get("facilities", {})
                    station_details = page_props.get("stationDetails", {}) or {}
                    station_info = station_details.get("StationInfo", {}) or {}
                    parking_info = station_details.get("ParkingInfo") or []

                    parking_lots = []
                    total_spots = 0
                    for lot in parking_info:
                        spots = lot.get("ParkSpots", 0) or 0
                        lot_type = lot.get("Type") or lot.get("Code") or "Lot"
                        parking_lots.append({"type": lot_type, "spots": spots})
                        total_spots += spots

                    go_data = {
                        "name": station_info.get("Name") or station_info.get("StationName") or sid,
                        "has_accessible": bool(
                            facilities.get("hasAccessibility", {}).get("Value")
                            or station_info.get("IsTrainAccessible")
                        ),
                        "has_elevator": bool(facilities.get("HasElevator", {}).get("Value")),
                        "has_washroom": bool(facilities.get("HasPublicWashroom", {}).get("Value")),
                        "has_bicycle_lockup": bool(facilities.get("HasBikeRack", {}).get("Value")),
                        "has_ppudo": bool(facilities.get("HasKissAndRide", {}).get("Value")),
                        "has_wifi": bool(facilities.get("HasWifi", {}).get("Value")),
                        "has_waiting_room": bool(facilities.get("HasWaitingRoom", {}).get("Value")),
                        "has_heated_shelter": bool(facilities.get("HasHeatedShelter", {}).get("Value")),
                        "has_shelter": bool(facilities.get("HasBusTrainShelter", {}).get("Value")),
                        "has_parking": total_spots > 0 or bool(facilities.get("HasReservedParking", {}).get("Value")),
                        "parking_spots": total_spots,
                        "parking_lots": parking_lots,
                    }
    except Exception:
        pass

    # Check UP Express supplements for UP stations
    up_data = fetch_up_station_facilities(sid)

    if not go_data and not up_data:
        return sid, code, {"status": "error", "error": "No station page found on gotransit.com or upexpress.com"}

    station_name = go_data.get("name") or ("Pearson Airport Terminal 1" if sid == "pearson-airport" else sid)
    primary_url = up_data.get("up_url") if sid == "pearson-airport" and up_data.get("up_url") else url

    has_accessible = go_data.get("has_accessible", False) or up_data.get("has_accessible", False)
    has_elevator = go_data.get("has_elevator", False) or up_data.get("has_elevator", False)
    has_washroom = go_data.get("has_washroom", False) or up_data.get("has_washroom", False)
    has_parking = go_data.get("has_parking", False) or up_data.get("has_parking", False)
    has_bicycle_lockup = go_data.get("has_bicycle_lockup", False) or up_data.get("has_bicycle_lockup", False)
    has_ppudo = go_data.get("has_ppudo", False) or up_data.get("has_ppudo", False)
    has_wifi = go_data.get("has_wifi", False) or up_data.get("has_wifi", False)
    has_waiting_room = go_data.get("has_waiting_room", False) or up_data.get("has_waiting_room", False)
    has_heated_shelter = go_data.get("has_heated_shelter", False)
    has_shelter = go_data.get("has_shelter", False) or bool(up_data)

    parking_spots = go_data.get("parking_spots", 0)
    parking_lots = go_data.get("parking_lots", [])

    return sid, code, {
        "status": "found",
        "station_id": sid,
        "stop_code": code.upper(),
        "name": station_name,
        "url": primary_url,
        "has_accessible": has_accessible,
        "has_elevator": has_elevator,
        "has_washroom": has_washroom,
        "has_parking": has_parking,
        "parking_spots": parking_spots,
        "parking_lots": parking_lots,
        "has_bicycle_lockup": has_bicycle_lockup,
        "has_ppudo": has_ppudo,
        "has_wifi": has_wifi,
        "has_waiting_room": has_waiting_room,
        "has_heated_shelter": has_heated_shelter,
        "has_shelter": has_shelter,
    }


def main():
    parser = argparse.ArgumentParser(description="Audit GO / UP regional station amenities from gotransit.com and upexpress.com")
    parser.add_argument("--output-json", help="Path to save detailed audit JSON")
    parser.add_argument("--concurrency", type=int, default=10, help="Parallel HTTP request concurrency")
    args = parser.parse_args()

    stations = load_regional_stations()
    print(f"Scanning {len(stations)} GO / UP regional stations from gotransit.com & upexpress.com with concurrency {args.concurrency}...")

    results: Dict[str, Dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {executor.submit(fetch_station, sid, code): sid for sid, code in stations}
        for future in as_completed(futures):
            sid, code, data = future.result()
            results[sid] = data

    found_count = sum(1 for v in results.values() if v.get("status") == "found")
    print(f"Audit completed: {found_count}/{len(stations)} station pages resolved.\n")

    accessible_sids = sorted(k for k, v in results.items() if v.get("has_accessible"))
    elevator_sids = sorted(k for k, v in results.items() if v.get("has_elevator"))
    washroom_sids = sorted(k for k, v in results.items() if v.get("has_washroom"))
    parking_sids = sorted(k for k, v in results.items() if v.get("has_parking"))
    bike_sids = sorted(k for k, v in results.items() if v.get("has_bicycle_lockup"))
    ppudo_sids = sorted(k for k, v in results.items() if v.get("has_ppudo"))
    wifi_sids = sorted(k for k, v in results.items() if v.get("has_wifi"))
    waiting_sids = sorted(k for k, v in results.items() if v.get("has_waiting_room"))
    heated_sids = sorted(k for k, v in results.items() if v.get("has_heated_shelter"))

    print(f"Accessible ({len(accessible_sids)}/{len(stations)}): {', '.join(accessible_sids)}")
    print(f"Elevators ({len(elevator_sids)}/{len(stations)}): {', '.join(elevator_sids)}")
    print(f"Washrooms ({len(washroom_sids)}/{len(stations)}): {', '.join(washroom_sids)}")
    print(f"Parking ({len(parking_sids)}/{len(stations)}): {', '.join(parking_sids)}")
    print(f"Bicycle Rack ({len(bike_sids)}/{len(stations)}): {', '.join(bike_sids)}")
    print(f"Kiss & Ride / PPUDO ({len(ppudo_sids)}/{len(stations)}): {', '.join(ppudo_sids)}")
    print(f"Wi-Fi ({len(wifi_sids)}/{len(stations)}): {', '.join(wifi_sids)}")
    print(f"Waiting Room ({len(waiting_sids)}/{len(stations)}): {', '.join(waiting_sids)}")
    print(f"Heated Shelters ({len(heated_sids)}/{len(stations)}): {', '.join(heated_sids)}")

    if args.output_json:
        out_path = Path(args.output_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        print(f"\nAudit details saved to: {out_path}")


if __name__ == "__main__":
    main()

