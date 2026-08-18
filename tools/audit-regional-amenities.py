#!/usr/bin/env python3
"""
Regional (GO / UP Rail) Station Amenities Audit Tool for LineWatchTO.

Fetches station web pages from https://www.gotransit.com/en/find-a-station-or-stop/{code}/facilities-services-fare-sales
across all 72 mapped regional stations using their stop codes and extracts published amenities:
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
from typing import Any, Dict, List, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
CATALOG_JAVA = REPO_ROOT / "backend/src/main/java/com/calebhabesh/linewatch/regional/RegionalNetworkCatalog.java"


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
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                return sid, code, {"status": "error", "error": f"HTTP {resp.status}"}
            html = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        return sid, code, {"status": "error", "error": str(e)}

    soup = BeautifulSoup(html, "html.parser")
    next_data_tag = soup.find("script", id="__NEXT_DATA__")
    if not next_data_tag or not next_data_tag.string:
        return sid, code, {"status": "error", "error": "No __NEXT_DATA__ script tag found"}

    try:
        payload = json.loads(next_data_tag.string)
        page_props = payload.get("props", {}).get("pageProps", {})
    except Exception as e:
        return sid, code, {"status": "error", "error": f"JSON parse error: {e}"}

    facilities = page_props.get("facilities", {})
    station_details = page_props.get("stationDetails", {}) or {}
    station_info = station_details.get("StationInfo", {}) or {}
    parking_info = station_details.get("ParkingInfo") or []

    # Features
    has_accessible = bool(
        facilities.get("hasAccessibility", {}).get("Value")
        or station_info.get("IsTrainAccessible")
    )
    has_elevator = bool(facilities.get("HasElevator", {}).get("Value"))
    has_washroom = bool(facilities.get("HasPublicWashroom", {}).get("Value"))
    has_bicycle_lockup = bool(facilities.get("HasBikeRack", {}).get("Value"))
    has_ppudo = bool(facilities.get("HasKissAndRide", {}).get("Value"))
    has_wifi = bool(facilities.get("HasWifi", {}).get("Value"))
    has_waiting_room = bool(facilities.get("HasWaitingRoom", {}).get("Value"))
    has_heated_shelter = bool(facilities.get("HasHeatedShelter", {}).get("Value"))
    has_shelter = bool(facilities.get("HasBusTrainShelter", {}).get("Value"))

    # Parking
    parking_lots = []
    total_spots = 0
    for lot in parking_info:
        spots = lot.get("ParkSpots", 0) or 0
        lot_type = lot.get("Type") or lot.get("Code") or "Lot"
        parking_lots.append({"type": lot_type, "spots": spots})
        total_spots += spots

    has_parking = total_spots > 0 or bool(facilities.get("HasReservedParking", {}).get("Value"))

    station_name = station_info.get("Name") or station_info.get("StationName") or sid

    return sid, code, {
        "status": "found",
        "station_id": sid,
        "stop_code": code.upper(),
        "name": station_name,
        "url": url,
        "has_accessible": has_accessible,
        "has_elevator": has_elevator,
        "has_washroom": has_washroom,
        "has_parking": has_parking,
        "parking_spots": total_spots,
        "parking_lots": parking_lots,
        "has_bicycle_lockup": has_bicycle_lockup,
        "has_ppudo": has_ppudo,
        "has_wifi": has_wifi,
        "has_waiting_room": has_waiting_room,
        "has_heated_shelter": has_heated_shelter,
        "has_shelter": has_shelter,
    }


def main():
    parser = argparse.ArgumentParser(description="Audit GO / UP regional station amenities from gotransit.com")
    parser.add_argument("--output-json", help="Path to save detailed audit JSON")
    parser.add_argument("--concurrency", type=int, default=10, help="Parallel HTTP request concurrency")
    args = parser.parse_args()

    stations = load_regional_stations()
    print(f"Scanning {len(stations)} GO / UP regional stations from gotransit.com with concurrency {args.concurrency}...")

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
