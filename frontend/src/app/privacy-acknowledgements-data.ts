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
    body: "LineWatchTO is unofficial transit software. It is not affiliated with, endorsed by, or operated by the TTC or the City of Toronto.",
    bullets: [
      "LineWatchTO uses TTC service information only to help riders understand disruptions, saved-commute impacts, accessibility outages, and public notices.",
      "For travel decisions, riders should still confirm current service details with official TTC channels.",
    ],
  },
  {
    title: "TTC Map Acknowledgement",
    body: "The rapid-transit base map used for wayfinding context is adapted from a TTC-published map asset that appears to match the TTC Subway, Light Rail and Streetcar Map. The map artwork, TTC names, TTC marks, route names, station names, and line colors remain the property of the Toronto Transit Commission or their respective owners.",
    bullets: [
      "LineWatchTO adds independent interactive overlays, alert cards, station controls, saved-commute impact checks, and display controls around the map.",
      "Use of the adapted map is being treated as permission-sensitive. If the TTC does not grant written permission for this use, the project will replace the base map with an original LineWatchTO map.",
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
    body: "If you create an account, LineWatchTO uses your email address, display name, login method, and authentication state to sign you in and connect saved commute and notification settings to your account.",
  },
  {
    title: "Saved Commutes",
    body: "Saved commute features store the stations, directions, optional return trip, and route preferences needed to check whether your rapid-transit route is affected by dashboard-visible disruptions.",
  },
  {
    title: "Push Notifications",
    body: "Browser push notifications are opt-in. When enabled, LineWatchTO stores the browser push subscription endpoint, public browser keys, user-agent context, and notification preferences needed to deliver and deduplicate saved-commute and line-wide alerts.",
  },
  {
    title: "Feedback",
    body: "When you send feedback, LineWatchTO sends your message plus basic page context such as app version, data source, page URL, and viewport size. The feedback form does not ask for a reply email address.",
  },
  {
    title: "Browser Storage and PWA Cache",
    body: "LineWatchTO may keep display preferences, app update state, service-worker cache entries, local storage values, and other local app state in your browser so the dashboard opens quickly and keeps your chosen controls.",
  },
  {
    title: "Cloudflare Web Analytics",
    body: "Cloudflare Web Analytics is loaded only when a site analytics token is configured. It is used for aggregate site and performance measurements, not for LineWatchTO account features or saved-commute matching.",
  },
  {
    title: "Public Transit Source Data",
    body: "TTC alerts, schedule-derived estimates, performance metrics, accessibility outages, and public notices are used as public service inputs. Alert text can be vague, source formats can change, and inferred map segments can be imperfect.",
  },
];

export const privacyAcknowledgementLinks: NoticeLink[] = [
  {
    label: "TTC Routes and Schedules",
    href: "https://www.ttc.ca/routes-and-schedules",
    description: "Current TTC page that links to subway, light rail, streetcar, and system map documents.",
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
