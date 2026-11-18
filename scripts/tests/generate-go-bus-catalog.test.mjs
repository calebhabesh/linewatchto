import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const generator = fileURLToPath(new URL("../generate-go-bus-catalog.mjs", import.meta.url));

/** A GO feed spanning two schedule periods, as GO 20261117113605 did. */
function twoPeriodFeed(dir) {
  const week = ["20261123", "20261124", "20261125", "20261126", "20261127"];
  const nextWeek = ["20261130", "20261201", "20261202", "20261203", "20261204"];
  const dates = [...week, ...nextWeek];
  const trips = [];
  const stopTimes = [];
  dates.forEach((date, i) => {
    const period = week.includes(date) ? "09261126" : "11260127";
    const tripId = `${date}-11-${i}`;
    trips.push(`${period}-11,${date},${tripId},11 - Brock,0,S11,11A`);
    stopTimes.push(`${tripId},08:00:00,08:00:00,02001,1`, `${tripId},08:05:00,08:05:00,02002,2`);
  });
  const tables = {
    "feed_info.txt": "feed_publisher_name,feed_start_date,feed_end_date,feed_version\nMetrolinx,20261123,20261204,20261117113605\n",
    "calendar_dates.txt": ["service_id,date,exception_type", ...dates.map(date => `${date},${date},1`)].join("\n") + "\n",
    "routes.txt": [
      "route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color",
      "11260127-11,GO,11,Next Period Name,3,111111,FFFFFF",
      "09261126-11,GO,11,Brock University,3,98002e,FFFFFF",
    ].join("\n") + "\n",
    "trips.txt": ["route_id,service_id,trip_id,trip_headsign,direction_id,shape_id,route_variant", ...trips].join("\n") + "\n",
    "stop_times.txt": ["trip_id,arrival_time,departure_time,stop_id,stop_sequence", ...stopTimes].join("\n") + "\n",
    "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\n02001,First Stop,43.6500,-79.4000\n02002,Second Stop,43.6500,-79.3900\n",
    "shapes.txt": ["shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
      ...Array.from({ length: 11 }, (_, i) => `S11,43.6500,${(-79.4 + i * 0.001).toFixed(4)},${i + 1}`)].join("\n") + "\n",
  };
  const source = join(dir, "feed");
  mkdirSync(source);
  for (const [name, text] of Object.entries(tables)) writeFileSync(join(source, name), text);
  const zip = join(dir, "GO-GTFS.zip");
  execFileSync("zip", ["-q", "-X", zip, ...Object.keys(tables)], { cwd: source });
  return zip;
}

describe("generate-go-bus-catalog", () => {
  it("lists a route once when the feed carries it for two schedule periods", { skip: !existsSync("/usr/bin/zip") }, () => {
    const dir = mkdtempSync(join(tmpdir(), "go-bus-catalog-"));
    const zip = twoPeriodFeed(dir);
    const out = join(dir, "out");
    mkdirSync(out);
    execFileSync(process.execPath, [generator, "--go-gtfs", zip, "--output", join(out, "go-surface-bus.json"),
      "--backend-stops", join(out, "go-bus-stops.csv")], { stdio: "pipe" });

    const catalog = JSON.parse(readFileSync(join(out, "go-surface-bus.json"), "utf8"));
    assert.deepEqual(catalog.source.sampleWeek, ["2026-11-23", "2026-11-27"]);
    assert.equal(catalog.routes.length, 1);
    // The record whose trips run in the sample week names the route.
    assert.deepEqual(
      { route: catalog.routes[0].route, name: catalog.routes[0].name, color: catalog.routes[0].color, weekdayTrips: catalog.routes[0].weekdayTrips },
      { route: "11", name: "Brock University", color: "#98002e", weekdayTrips: 1 },
    );
    // The search index, which refuses a route listed twice, is written.
    assert.ok(existsSync(join(out, "search-index-go.json")));
  });
});
