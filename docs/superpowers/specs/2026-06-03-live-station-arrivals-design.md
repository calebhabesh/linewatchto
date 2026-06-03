# Live Station Arrivals Design

## Source
Official TTC live arrivals are only public for surface transit (buses and streetcars) via GTFS-Realtime at `https://bustime.ttc.ca/gtfsrt`. There is currently no official, public-facing real-time API for TTC subway train arrival predictions (Lines 1, 2, and 4). 

Due to the lack of an official public subway arrivals feed, our application will implement:
1. A configuration-driven `PublicArrivalClient` targeting a placeholder endpoint.
2. A robust fallback layer: by default, the provider is disabled (or considered unavailable), yielding clearly labeled demo estimates or an "unavailable" status.
3. Full integration tests covering success parses, HTTP errors, stale filtering, and disabled state fallbacks.

## Contract
The station detail endpoint returns a list of arrival predictions. Each prediction contains:
- `lineId`: identifier of the line (e.g., `line-1`).
- `direction`: travel direction (e.g., `Northbound`).
- `minutes`: estimated minutes to arrival.
- `predictedAt`: the timestamp when the prediction was generated.
- `label`: UI display label (e.g., `2 min`).
- `source`: attribution of data (e.g., `TTC Live Predictions`, `Demo estimates`).
- `status`: one of `live`, `unavailable`, or `demo`.

## Failure Behavior
- **Disabled Provider (Default):** Returns demo predictions with status `demo` and source `Demo estimates`.
- **Upstream Outage/Failure:** If the provider is enabled but calls fail (HTTP errors, timeouts, malformed JSON), returns status `unavailable` with source `Arrival source unavailable`.
- **Stale Filtering:** Predictions older than a configured freshness threshold (e.g., 5 minutes) are discarded.

## Station Mapping
A mapping file `ttc-arrival-stop-map.csv` will be created under `backend/src/main/resources/arrival/` to map our database station IDs and lines to external provider stop IDs for future integration.

## Testing
- **Client Tests:** Mock the RestTemplate using `MockRestServiceServer` to verify parsing of success payloads, handling of HTTP errors, and JSON structures.
- **Service Tests:** Verify that `ArrivalService` merges results correctly, enforces freshness, and switches to fallback demo/unavailable states when the client fails or is disabled.
- **Integration Tests:** Verify station details output includes the appropriate source/status fields.
