# Credits and third-party notices

LineWatchTO is an independent, unofficial project. It is not affiliated with, endorsed by, or operated by TTC, Metrolinx, or the City of Toronto.

## Schematic maps

The project author drew both schematic maps in Inkscape for LineWatchTO, adapting the following visual references for interactive application rendering:

| LineWatchTO artwork | Reference and credit |
| --- | --- |
| TTC subway/LRT schematic, its SVG geometry, and generated raster planes | [Toronto Transit Commission: Line 1 route map](https://www.ttc.ca/routes-and-schedules/1/0) |
| GO/UP regional rail schematic, its SVG geometry, and generated raster planes | [Metrolinx: GO system map](https://assets.metrolinx.com/image/upload/v1695737837/Images/GO/system-map.png) |

These are authored recreations, not official map publications. They are schematic and not to scale. The README screenshots show those drawings in the running application. Referenced designs, transit names, wordmarks, and logos belong to their respective owners; the project's MIT license does not grant rights to those third-party elements. The author has chosen to include the drawings with these credits.

## Transit data

Contains information licensed under the Open Government Licence – Toronto.

That attribution applies to the [TTC GTFS Realtime dataset](https://open.toronto.ca/dataset/ttc-gtfs-realtime-gtfs-rt/) and identified Toronto open-data schedule/geographic inputs under the [Toronto open-data licence](https://open.toronto.ca/open-data-licence/). It does not apply to TTC Live Alerts or TTC website content.

Contains Metrolinx Open Data.

GO and UP schedule/geographic inputs are identified in the [geographic coverage manifest](docs/geographic-map-coverage-manifest.json). Consult [Metrolinx's open-data page](https://www.metrolinx.com/en/about-us/open-data) and the applicable source terms. A registered API integration has its own terms; a public schedule licence does not establish the terms for every API response.

The committed alert/parser examples are authored synthetic test data. Raw downloaded provider responses and local credentials are excluded from the publication candidate.

## Fonts and software

Bundled fonts retain the notices in [frontend/public/assets/fonts](frontend/public/assets/fonts/README.md): SIL Open Font License notices, the GUST Font License, Fontshare credits, and readable original embedded notices.

Dependencies retain their own licences. The MIT license at the repository root covers project code and original documentation; it does not replace dependency licences, font notices, source-data terms, or third-party artwork and trademark rights.
