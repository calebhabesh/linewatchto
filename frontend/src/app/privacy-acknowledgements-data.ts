export type NoticeSection = {
  title: string;
  body: string;
  bullets?: string[];
};

export type NoticeLink = {
  label: string;
  href: string;
  description: string;
};

export const acknowledgementSections: NoticeSection[] = [
  {
    title: "Unofficial Independent Project",
    body: "LineWatchTO is unofficial transit software. It is not affiliated with, endorsed by, or operated by the TTC, the City of Toronto, or Metrolinx.",
    bullets: [
      "LineWatchTO uses TTC service information only to help riders understand disruptions, saved-commute impacts, accessibility outages, and public notices.",
      "For travel decisions, riders should still confirm current service details with official TTC channels.",
    ],
  },
  {
    title: "TTC Map Acknowledgement",
    body: "The LineWatchTO developer independently re-created the rapid-transit map in Inkscape, using the TTC route map as a direct visual reference. The SVG is a derivative replica created for optimized app rendering and data referencing/formatting; it is not a downloaded TTC map file. TTC names, marks, route and station names, line colors, and the referenced map design remain the property of the Toronto Transit Commission or their respective owners.",
    bullets: [
      "The TTC route map is credited as the visual reference; this authored recreation does not imply TTC affiliation or endorsement.",
    ],
  },
  {
    title: "Metrolinx Map Acknowledgement",
    body: "The LineWatchTO developer independently re-created the GO/UP regional map in Inkscape, using the Metrolinx GO system map as a direct visual reference. The SVG is a derivative replica created for optimized app rendering and data referencing/formatting; it is not a downloaded Metrolinx map image. GO, UP Express, Metrolinx, route and station names, service colors, marks, and the referenced map design remain the property of Metrolinx or their respective owners.",
    bullets: [
      "The Metrolinx GO system map is credited as the visual reference; this authored recreation does not imply Metrolinx affiliation or endorsement.",
    ],
  },
  {
    title: "Toronto Open Data Attribution",
    body: "Contains information licensed under the Open Government Licence – Toronto.",
    bullets: [
      "This attribution applies to the official TTC GTFS Realtime dataset and other City of Toronto open-data inputs identified by LineWatchTO; it does not apply to TTC Live Alerts or Metrolinx source records.",
      "The Open Government Licence permits reuse with attribution and does not imply that the City of Toronto or TTC endorses LineWatchTO.",
    ],
  },
  {
    title: "Permission-Sensitive Sources and Regional Names",
    body: "LineWatchTO does not treat TTC Live Alerts or Metrolinx API records as Toronto open data. Public launch of those integrations requires written source-owner confirmation appropriate to the intended use.",
    bullets: [
      "GO, GO Transit, UP Express, TTC, and related names and marks belong to their respective owners. Their use identifies transit services and does not imply affiliation or endorsement.",
      "The schematic drawings were authored in Inkscape with TTC and Metrolinx map references credited. Project licensing does not grant rights to third-party names, marks, or referenced designs.",
    ],
  },
  {
    title: "Infrastructure Appreciation",
    body: "LineWatchTO exists because Toronto has a large public rapid-transit network, public service information, and the daily operating work of TTC staff. This project appreciates that infrastructure while remaining independent from the TTC.",
  },
];

export const dataPracticeSections: NoticeSection[] = [
  {
    title: "Accounts",
    body: "If you create an account, LineWatchTO uses your email address, display name, login method, and authentication state to sign you in and connect My Stations, My Commutes, and notification settings to your account.",
  },
  {
    title: "My Stations",
    body: "My Stations stores the stable station IDs you choose and the time each station was saved. Removing a station deletes that account preference. Station conditions shown beside it follow the same source and freshness limits as the station dashboard.",
  },
  {
    title: "My Commutes",
    body: "My Commutes stores the stations, network, directions, optional return trip, and route preferences needed to check whether the TTC or GO/UP rail route you intend to take is affected by dashboard-visible disruptions. It does not calculate a fastest cross-network journey or include buses, walking transfers, or alternate routes.",
  },
  {
    title: "Push Notifications",
    body: "Browser push notifications are opt-in. When enabled, LineWatchTO stores the browser push subscription endpoint, public browser keys, a random browser-installation identifier, user-agent context, and notification preferences needed to deliver, rotate, and deduplicate My Commutes and line-wide alerts.",
  },
  {
    title: "Feedback",
    body: "When you send feedback, LineWatchTO sends your message plus basic page context such as app version, data source, page URL, and viewport size. The feedback form does not ask for a reply email address.",
  },
  {
    title: "Browser Storage and PWA Cache",
    body: "LineWatchTO may keep display preferences, app update state, a random push-installation identifier, service-worker cache entries, local storage values, and other local app state in your browser so the dashboard opens quickly and keeps your chosen controls.",
  },
  {
    title: "Cloudflare Web Analytics",
    body: "Cloudflare Web Analytics is loaded only when a site analytics token is configured. It is used for aggregate site and performance measurements, not for LineWatchTO account features or saved-commute matching.",
  },
  {
    title: "Public Transit Source Data",
    body: "TTC alerts, schedule-derived estimates, performance metrics, accessibility outages, and public notices are used as transit-information inputs subject to their distinct source terms. Alert text can be vague, source formats can change, and inferred map segments can be imperfect.",
  },
];

export const privacyAcknowledgementLinks: NoticeLink[] = [
  {
    label: "TTC GTFS Realtime Dataset",
    href: "https://open.toronto.ca/dataset/ttc-gtfs-realtime-gtfs-rt/",
    description: "City of Toronto dataset page identifying the Open Government Licence – Toronto for TTC GTFS Realtime data.",
  },
  {
    label: "Open Government Licence – Toronto",
    href: "https://open.toronto.ca/open-data-licence/",
    description: "Licence terms for identified City of Toronto open-data inputs, including attribution and non-endorsement requirements.",
  },
  {
    label: "TTC Line 1 Route Map Reference",
    href: "https://www.ttc.ca/routes-and-schedules/1/0",
    description: "TTC route page containing the map used as the direct visual reference for LineWatchTO's independently re-created TTC map.",
  },
  {
    label: "Metrolinx GO System Map Reference",
    href: "https://assets.metrolinx.com/image/upload/v1695737837/Images/GO/system-map.png",
    description: "Metrolinx system-map image used as the direct visual reference for LineWatchTO's independently re-created GO/UP map.",
  },
  {
    label: "TTC Website Terms",
    href: "https://www.ttc.ca/transparency-and-accountability/policies/web-site-terms-and-conditions-of-use",
    description: "TTC terms covering website content, copyright, trademarks, acknowledgement, and prior written permission.",
  },
  {
    label: "TTC Contact",
    href: "https://www.ttc.ca/customer-service/contact-us",
    description: "TTC contact page for switchboard, legal, media, mailing, and customer service channels.",
  },
  {
    label: "PIPEDA Privacy Principles",
    href: "https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/",
    description: "Office of the Privacy Commissioner of Canada overview of the ten fair information principles.",
  },
  {
    label: "Cloudflare Analytics Data Collection",
    href: "https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/",
    description: "Cloudflare documentation describing Web Analytics data origin and collection.",
  },
];
