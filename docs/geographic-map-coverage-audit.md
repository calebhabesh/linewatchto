# Geographic Map Coverage Audit & Source Provenance

Date of Audit: 2026-09-18  
Implementation Phase: Session 1 / Phase A: prove geographic coverage  
Implementation Plan: [geographic-map-implementation-plan.md](geographic-map-implementation-plan.md)  
Associated Manifest: [geographic-map-coverage-manifest.json](geographic-map-coverage-manifest.json)  
Status: **PASSED — 100% Station and Link Geometry Verified**

---

## 1. Executive Summary

Phase A audits current authoritative GTFS schedule archives against LineWatchTO's rapid transit and regional rail topology. The goal is to prove whether verified published coordinates and shapes exist to build an accurate geographic map without inventing alignments, geocoding by proximity, or discovering missing links during rendering.

### Key Results
- **TTC Subway & LRT**: 5 routes (Lines 1, 2, 4, 5, 6), **109 unique stations (100%)**, and **112 adjacent links (100%)** verified with published parent station coordinates and trip shapes.
- **Regional Rail (GO / UP Express)**: 8 routes (7 GO corridors + UP Express), **72 unique stations (100%)**, and **74 adjacent links (100%)** verified with published stop coordinates and trip shapes.
- **Overall Coverage**: **181 mapped station identities** and **186 adjacent links** account for 100% of the active in-scope network graph.
- **Coverage Gaps**: **0 missing stations, 0 missing links**.

---

## 2. Source Feeds, Validity, and Cryptographic Checksums

All archives were retrieved directly from official open-data endpoints and inspected in an isolated working environment outside of Git and public assets.

| Feed | Source Name | Publisher & Origin | Feed Version | Validity Period | Archive SHA-256 Checksum | Archive Size |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TTC** | Merged GTFS - TTC Routes and Schedules | City of Toronto Open Data / TTC | `S1000538` | 2026-09-06 to 2026-10-31 | `e70efd86a1991b302d97d82554180efc482484bb79440f07a09e95031e310e3c` | 84,241,404 bytes |
| **GO** | GO Transit GTFS Schedule | Metrolinx Open Data Portal | `20260917132342` | 2026-09-17 to 2026-11-27 | `e2c80eeed718af9e58315c4198b1bd7e338a00171c658197f04d116421f14fc6` | 22,206,353 bytes |
| **UP** | UP Express GTFS Schedule | Metrolinx Open Data Portal | `20260903104434` | 2026-09-03 to 2027-03-02 | `a8f2147147143a0068a93cf7c7ec73d050d9a3f95004967535ef7eed0a256320` | 898,079 bytes |

### Endpoint Details & Licensing
1. **TTC Routes and Schedules**:
   - Package URL: `https://ckan0.cf.opendata.inter.prod-toronto.ca/en/dataset/merged-gtfs-ttc-routes-and-schedules`
   - Direct Zip: `https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/b811ead4-6eaf-4adb-8408-d389fb5a069c/resource/c920e221-7a1c-488b-8c5b-6d8cd4e85eaf/download/completegtfs.zip`
   - Licensing: Open Government Licence – Toronto (`https://open.toronto.ca/open-data-license/`).
   - Required Attribution: *"Contains information licensed under the Open Government Licence – Toronto."*
2. **GO Transit GTFS**:
   - Developer Portal: `https://www.gotransit.com/en/partner-with-us/software-developers`
   - Direct Zip: `https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip`
   - Licensing: Metrolinx Open Data Terms and Conditions (`https://www.metrolinx.com/en/about-us/open-data`).
3. **UP Express GTFS**:
   - Developer Portal: `https://www.gotransit.com/en/partner-with-us/software-developers`
   - Direct Zip: `https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/UP-GTFS.zip`
   - Licensing: Metrolinx Open Data Terms and Conditions (`https://www.metrolinx.com/en/about-us/open-data`).

---

## 3. Network Topology Audit

### 3.1 TTC Rapid Transit (109 Stations, 112 Links)

| Line ID | Line Name | Mode | Mapped Stations | Adjacent Links | GTFS Route ID | GTFS Shape Count | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `line-1` | Yonge-University | Subway | 38 | 37 | `1` | 62 shapes | Verified 100% |
| `line-2` | Bloor-Danforth | Subway | 31 | 30 | `2` | 80 shapes | Verified 100% |
| `line-4` | Sheppard | Subway | 5 | 4 | `4` | 5 shapes | Verified 100% |
| `line-5` | Eglinton Crosstown | LRT | 25 | 24 | `5` | 5 shapes | Verified 100% |
| `line-6` | Finch West | LRT | 18 | 17 | `6` | 5 shapes | Verified 100% |

#### Topology & Identity Details
- **Interchange Deduplication**: 8 interchange stations appear on multiple lines (`spadina` [1, 2], `st-george` [1, 2], `bloor-yonge` [1, 2], `sheppard-yonge` [1, 4], `cedarvale` [1, 5], `eglinton` [1, 5], `kennedy` [2, 5], `finch-west` [1, 6], `downsview-park` [1, BR]). The unique station count is 109.
- **Parent Station vs Platform Stops**: All 109 stations map cleanly to GTFS parent stations (`location_type: 1`). Platform coordinates for all 234 subway and LRT platform stops were also verified.
  - At **Spadina**, Line 1 platforms (`13853`, `13854`) are physically separated from the Line 2 complex (`43268`). Both are recorded in the manifest.
  - At **Kennedy**, Line 5 platform (`16081`) and Line 2 platform (`14947`) both resolve to parent station `43295`.
- **Spelling Quirk Preservation**: Persisted application IDs `greenwoood` (Greenwood, GTFS stop `3667`) and `o_connor` (O'Connor, GTFS stop `16784`) are preserved without renaming.

### 3.2 Regional Rail (72 Stations, 74 Links)

| Route Code | Route Name | Mode | Mapped Stations | Adjacent Links | GTFS Route ID | GTFS Shape Count | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `BR` | Barrie | Commuter Rail | 11 | 10 | `09261126-BR` | 9 shapes | Verified 100% |
| `KI` | Kitchener | Commuter Rail | 14 | 13 | `09261126-GT` | 11 shapes | Verified 100% |
| `LE` | Lakeshore East | Commuter Rail | 10 | 9 | `09261126-LE` | 5 shapes | Verified 100% |
| `LW` | Lakeshore West | Commuter Rail | 16 | 15 | `09261126-LW` | 15 shapes | Verified 100% |
| `MI` | Milton | Commuter Rail | 9 | 8 | `09261126-MI` | 2 shapes | Verified 100% |
| `RH` | Richmond Hill | Commuter Rail | 7 | 6 | `09261126-RH` | 2 shapes | Verified 100% |
| `ST` | Stouffville | Commuter Rail | 10 | 9 | `09261126-ST` | 6 shapes | Verified 100% |
| `UP` | UP Express | Express Rail | 5 | 4 | `UP` | 2 shapes | Verified 100% |

#### Regional Alignment & Corridor Details
- **Lakeshore West Branching**: After Aldershot (`AL`), Lakeshore West branches into:
  1. Aldershot (`AL`) to Hamilton GO Centre (`HA`) (terminal branch)
  2. Aldershot (`AL`) to West Harbour (`WR`), Confederation (`CF`), St. Catharines (`SCTH`), and Niagara Falls (`NI`)
  Both branches were checked individually; all 15 adjacent links have verified published GTFS shapes.
- **Kitchener / UP Express Shared Corridor**: The corridor between Union Station and Weston (`UN` <-> `BL` <-> `MD` <-> `WE`) has distinct published shapes in both the GO (`09261126-GT`) and UP feeds.
- **GO Missing Shape Analysis**: In `go-gtfs.zip`, 202 trips reference an empty shape ID string (`""`): 1 trip on LW, 65 on LE, 128 on KI, and 8 on BR. All remaining 22,211 trips reference valid shapes in `shapes.txt`. Every adjacent link in all 7 corridors has multiple valid shapes; zero links are affected by the blank trips.

---

## 4. Scope, Future, and Retired Lines

1. **Line 3 (Scarborough RT)**: Permanently decommissioned in August 2023. Five parent stations (`14592` Ellesmere, `43297` Scarborough Centre, `43296` Lawrence East, `14596` Midland, `14576` McCowan) remain in TTC `stops.txt`, but carry zero trips or shapes. They are excluded from active dashboard topology and geographic maps.
2. **Line 5 (Eglinton Crosstown) and Line 6 (Finch West)**: Both lines are published in the active TTC GTFS feed (`routes.txt`, `stops.txt`, `trips.txt`, `shapes.txt`) with pre-revenue schedules. All 25 Line 5 stations and 18 Line 6 stations have verified coordinates and shape geometry.
3. **GO Bus and Streetcar Connections**: In accordance with agreed product decisions, bus routes and streetcar lines remain in detail panels and surface connection tabs; they are not mapped as geographic layers in this release.

---

## 5. Basemap Provider & Boundaries

- **Basemap Service**: OpenFreeMap (`https://openfreemap.org/`).
- **Endpoint Types**: Standard MapLibre JSON style endpoint (`liberty` / `positron` / `bright`).
- **Billing / Key Constraint**: Zero API keys, zero provider charges, no rate limits, no account credentials.
- **Attribution**: MapLibre attribution control must display OpenFreeMap, OpenMapTiles, and OpenStreetMap contributors in addition to transit data attribution.

---

## 6. Phase A Conclusion & Handoff to Phase B

Phase A has confirmed that:
1. Complete, verified GTFS schedule and shape data is publicly available for both TTC and Metrolinx GO/UP networks.
2. All 181 in-scope stations and 186 adjacent links have valid published coordinates and continuous shapes.
3. No whole network or individual corridor is missing geometry.
4. The generated [geographic-map-coverage-manifest.json](geographic-map-coverage-manifest.json) forms the authoritative catalog specification for Phase B offline asset generation.
