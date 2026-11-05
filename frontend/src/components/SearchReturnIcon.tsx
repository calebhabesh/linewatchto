import { Activity, AlertTriangle, BarChart3, Bell, Bus, Construction, FileText, History, MapPin, Megaphone, MessageSquareText, Navigation, Settings, Sparkles, TrainFront } from "lucide-react";
import Image from "next/image";
import type { ComponentType } from "react";
import { desktopRailDestinationForView } from "../app/desktop-sidebar-state";
import type { NetworkId } from "../app/regional-data";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";

/** Each page's own header icon. Pages the rail groups under Settings have their own. */
const RETURN_PAGE_ICONS: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  status: AlertTriangle,
  alerts: AlertTriangle,
  delays: DelayIcon,
  "reduced-speed-zones": Construction,
  closures: PlannedClosureIcon,
  "trip-changes": TrainFront,
  "surface-notices": Bus,
  announcements: Megaphone,
  stations: MapPin,
  commutes: Navigation,
  "alert-history": History,
  more: Settings,
  "source-status": Activity,
  analytics: BarChart3,
  feedback: MessageSquareText,
  notifications: Bell,
  "release-notes": Sparkles,
  "privacy-acknowledgements": FileText,
};

const OWN_ICON_PAGES = new Set(["notifications", "release-notes", "privacy-acknowledgements"]);

/** The page search returns to, as its own header draws it: its icon and its colour. */
export function SearchReturnIcon({ destination, network }: { destination: string; network: NetworkId }) {
  const page = OWN_ICON_PAGES.has(destination) ? destination : desktopRailDestinationForView(destination);
  const className = `station-search-return-icon station-search-return-icon--${page}`;
  if (page === "accessibility-outages") {
    return <Image src="/assets/linewatch/accessibility-alert.svg" alt="" width={16} height={16} className={className} />;
  }
  const Icon = page === "surface-notices" && network === "regional" ? Megaphone : RETURN_PAGE_ICONS[page] ?? AlertTriangle;
  return (
    <span aria-hidden="true" className="contents">
      <Icon size={16} className={page === "source-status" ? `${className} station-search-return-icon--source-status-${network}` : className} />
    </span>
  );
}
