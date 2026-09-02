export type AboutSection = {
  title: string;
  body: string;
  bullets?: string[];
};

export type ResourceLink = {
  label: string;
  href: string;
  description: string;
};

export const aboutSections: AboutSection[] = [
  {
    title: "Unofficial Independent Project",
    body: "LineWatchTO is an unofficial transit reliability monitor. It is not affiliated with, endorsed by, or operated by the TTC, the City of Toronto, or Metrolinx.",
    bullets: [
      "LineWatchTO uses public transit service information to help riders track disruptions, line status, and accessibility outages.",
      "For official travel decisions, riders should confirm current service details with official TTC and GO/UP channels.",
    ],
  },
  {
    title: "Data Sources & Ingestion",
    body: "Data is normalized and freshness-checked through distinct backend pipelines:",
    bullets: [
      "TTC Live Alerts: Service disruptions, delays, and elevator/escalator outages.",
      "TTC GTFS-RT: Rapid-transit subway trip updates and surface bus/streetcar notice supplements.",
      "Metrolinx Open API: GO rail and UP Express service disruptions, station arrivals, and trip changes.",
      "Static GTFS: Published timetable schedules and station topology mappings.",
    ],
  },
  {
    title: "Derivative Map Acknowledgements",
    body: "Both the TTC and GO/UP regional maps were independently re-created in Inkscape as derivative replicas optimized for mobile app rendering and data referencing. They are not downloaded official map files. TTC and Metrolinx marks and line names remain the property of their respective owners.",
  },
  {
    title: "Open Data Attribution",
    body: "Contains information licensed under the Open Government Licence – Toronto.",
    bullets: [
      "Applies to official TTC GTFS Realtime datasets and City of Toronto open-data inputs.",
      "The licence permits reuse with attribution and does not imply endorsement by the City of Toronto or TTC.",
    ],
  },
  {
    title: "Privacy & Local Data Storage",
    body: "LineWatchTO respects user privacy and stores data locally on your device:",
    bullets: [
      "Preferences like display theme and network selection are stored locally in AsyncStorage.",
      "Dashboard payloads are briefly cached locally to enable fast startup and offline resilience.",
      "No personal information is collected, sold, or shared with third parties.",
    ],
  },
];

export const externalResourceLinks: ResourceLink[] = [
  {
    label: "TTC Open Data (City of Toronto)",
    href: "https://open.toronto.ca/dataset/ttc-gtfs-realtime-gtfs-rt/",
    description: "City of Toronto dataset page identifying Open Government Licence – Toronto for TTC GTFS-RT.",
  },
  {
    label: "Open Government Licence – Toronto",
    href: "https://open.toronto.ca/open-data-licence/",
    description: "Licence terms covering attribution and non-endorsement requirements.",
  },
  {
    label: "TTC Route Schedules & Maps",
    href: "https://www.ttc.ca/routes-and-schedules/1/0",
    description: "Reference route maps used as visual basis for independently created schematic maps.",
  },
  {
    label: "Metrolinx GO System Map Reference",
    href: "https://assets.metrolinx.com/image/upload/v1695737837/Images/GO/system-map.png",
    description: "Metrolinx system map reference for regional schematic alignments.",
  },
  {
    label: "TTC Website Terms & Conditions",
    href: "https://www.ttc.ca/transparency-and-accountability/policies/web-site-terms-and-conditions-of-use",
    description: "TTC terms covering marks, copyright, and prior written permission.",
  },
];
