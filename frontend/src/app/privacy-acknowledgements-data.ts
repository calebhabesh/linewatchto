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

export const lineWatchSourceRepositoryUrl = "https://github.com/calebhabesh/linewatchto";

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
    title: "Open Source Code",
    body: "LineWatchTO is open source. Its code is public on GitHub under the MIT license, so anyone can read how the app handles alerts, accounts, saved commutes, and notifications, report issues, or contribute.",
    bullets: [
      "The MIT license covers project code and original documentation only. Transit data, TTC station plans, the re-created maps, and TTC, GO, UP Express, and Metrolinx names and marks keep their own terms.",
      "Provider credentials, account data, and downloaded source responses are kept out of the public repository.",
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
    title: "TTC Station Plans",
    body: "Station floor plans on the Map View (footprints, entrances, elevators, stairs and escalators) are drawn from the TTC's public station layout map service, the data behind the TTC Live Map. They are the Toronto Transit Commission's work and are credited to the TTC.",
    bullets: [
      "The service publishes no licence, and it is not an Open Data Toronto dataset; LineWatchTO uses it with attribution and will remove the plans if the TTC objects.",
      "An elevator, escalator or entrance shown on a plan does not mean it is working. Check Accessibility Outages and official TTC channels.",
      "Bus bay numbers on the plans come from TTC GTFS (Open Government Licence – Toronto).",
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
    title: "Sign in with Google",
    body: "If you choose Sign in with Google, LineWatchTO asks Google only for the basic sign-in scopes (openid, email, and profile). From Google it receives your Google account identifier, email address, whether Google has verified that address, and your name, and uses them only to create or sign in to your LineWatchTO account and show your display name.",
    bullets: [
      "LineWatchTO does not request access to your Gmail, contacts, calendar, Drive, or any other Google data, and does not keep Google access or refresh tokens after sign-in.",
      "Google user data is not sold, shared with third parties, used for advertising, or used to train AI models.",
      "LineWatchTO's use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
    ],
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
    title: "Location for Stops Near Me",
    body: "Stops Near Me asks your browser for your location only when you tap it, never when the page loads. Your position is used on your device to find nearby stops from the stop list LineWatchTO has already downloaded; it is never sent to LineWatchTO or anyone else, stored, or logged. To show next departures, LineWatchTO then requests them by stop number for up to three of the nearest stops, and for any stop you open. Those requests do not include your position, but the stops they name are near it.",
  },
  {
    title: "Browser Storage and PWA Cache",
    body: "LineWatchTO may keep display preferences, app update state, a random push-installation identifier, service-worker cache entries, local storage values (including the last few stops you opened, shown as Recent Stops), and other local app state in your browser so the dashboard opens quickly and keeps your chosen controls.",
  },
  {
    title: "Cloudflare Web Analytics",
    body: "Cloudflare Web Analytics is loaded only when a site analytics token is configured. It is used for aggregate site and performance measurements, not for LineWatchTO account features or saved-commute matching.",
  },
  {
    title: "Public Transit Source Data",
    body: "TTC alerts, schedule-derived estimates, performance metrics, accessibility outages, and public notices are used as transit-information inputs subject to their distinct source terms. Alert text can be vague, source formats can change, and inferred map segments can be imperfect.",
  },
  {
    title: "Service Providers",
    body: "LineWatchTO does not sell personal information or use it for advertising. It relies on a few providers to run the service:",
    bullets: [
      "Cloudflare delivers the site and its traffic, and provides the optional Web Analytics described above.",
      "Resend sends account emails such as address verification and password resets.",
      "Your browser's push service (for example Google, Mozilla, or Apple) delivers push notifications you turn on.",
      "Google handles Sign in with Google when you choose it.",
    ],
  },
  {
    title: "Retention and Deletion",
    body: "Account data, My Stations, My Commutes, and notification settings are kept while your account exists. You can remove saved stations, commutes, and push subscriptions in the app at any time. To delete your account and the data connected to it, including any Google sign-in link, email feedback@linewatchto.ca from the address on your account; the account is deleted within 30 days.",
  },
  {
    title: "Contact",
    body: "Questions or requests about this notice or your data can be sent to feedback@linewatchto.ca. LineWatchTO aims to handle personal information consistently with Canada's PIPEDA fair information principles.",
  },
];

export const termsSections: NoticeSection[] = [
  {
    title: "Unofficial Information Service",
    body: "LineWatchTO is an independent, unofficial dashboard. It is not affiliated with, endorsed by, or operated by the TTC, the City of Toronto, or Metrolinx. Service information is provided for general reference and can be delayed, incomplete, estimated, or wrong.",
    bullets: [
      "Confirm time-sensitive travel information with official TTC and GO Transit channels.",
      "Train markers and some map placements are schematic estimates, not vehicle tracking.",
    ],
  },
  {
    title: "No Warranty",
    body: "LineWatchTO is provided free of charge, as is and as available, without warranties of any kind. Features, data sources, and availability can change or stop at any time.",
  },
  {
    title: "Limitation of Liability",
    body: "To the extent permitted by law, LineWatchTO and its developer are not liable for missed trips, delays, or any other loss arising from use of, or reliance on, the service or its notifications.",
  },
  {
    title: "Accounts",
    body: "You are responsible for keeping your sign-in details secure and for activity on your account. Accounts that abuse the service may be suspended or removed. You can ask for your account to be deleted at any time, as described in the Privacy Policy.",
  },
  {
    title: "Acceptable Use",
    body: "Do not attempt to disrupt the service, bypass its security or rate limits, access other people's accounts, or collect its data in ways that place an unreasonable load on it.",
  },
  {
    title: "Third-Party Data and Marks",
    body: "Transit data, station plans, map references, and the TTC, GO Transit, UP Express, and Metrolinx names and marks belong to their respective owners and keep their own terms. LineWatchTO's open-source license covers only its own code and original documentation.",
  },
  {
    title: "Changes and Governing Law",
    body: "These terms may be updated; the date at the top shows the latest version, and continued use means you accept it. These terms are governed by the laws of Ontario and the federal laws of Canada that apply there.",
  },
  {
    title: "Contact",
    body: "Questions about these terms can be sent to feedback@linewatchto.ca.",
  },
];

export const legalNoticesUpdated = "November 16, 2026";

export const privacyAcknowledgementLinks: NoticeLink[] = [
  {
    label: "LineWatchTO on GitHub",
    href: lineWatchSourceRepositoryUrl,
    description: "LineWatchTO's public source code, MIT license, third-party notices, and issue tracker.",
  },
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
    label: "TTC Live Map",
    href: "https://livemap.ttc.ca/",
    description: "The TTC's live map, whose station layout service is the source of LineWatchTO's station floor plans.",
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
