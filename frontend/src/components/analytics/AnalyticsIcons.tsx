import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CalendarDays,
  CarFront,
  CircleHelp,
  CloudRain,
  Construction,
  Database,
  FileText,
  Flag,
  Gauge,
  Hammer,
  HeartPulse,
  Layers,
  ListOrdered,
  MapPin,
  Shapes,
  Shield,
  ShieldCheck,
  Target,
  Timer,
  TrainFront,
  TrainTrack,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { DelayIcon } from "../DelayIcon";
import { PlannedClosureIcon } from "../PlannedClosureIcon";

/** The same artwork as the alert lists, in the colour the analytics charts give that class. */
function ImpactIcon({ tone, plain, children }: { tone: string; plain?: boolean; children: ReactNode }) {
  return <span className="analytics-icon" data-class={plain ? undefined : tone} aria-hidden="true">{children}</span>;
}

/** A disruption class: Service Stopped, Delays or Slow Zones. `plain` takes the text's colour. */
export function ClassIcon({ id, size = 15, plain }: { id: string; size?: number; plain?: boolean }) {
  if (id === "service-stopped") return <ImpactIcon tone={id} plain={plain}><AlertTriangle size={size} /></ImpactIcon>;
  if (id === "delay") return <ImpactIcon tone={id} plain={plain}><DelayIcon size={size} /></ImpactIcon>;
  if (id === "slow-zone") return <ImpactIcon tone={id} plain={plain}><Construction size={size} /></ImpactIcon>;
  return null;
}

/** An alert type. */
export function KindIcon({ kind, size = 16 }: { kind: string; size?: number }) {
  switch (kind.toLowerCase().replace(/_/g, "-")) {
    case "planned-closure":
    case "closure":
      return <ImpactIcon tone="planned"><PlannedClosureIcon size={size} /></ImpactIcon>;
    case "delay":
    case "limited-service":
      return <ClassIcon id="delay" size={size} />;
    case "reduced-speed-zone":
    case "rsz":
      return <ClassIcon id="slow-zone" size={size} />;
    case "cancellation":
      return <ImpactIcon tone="service-stopped"><TrainFront size={size} /></ImpactIcon>;
    default:
      return <ClassIcon id="service-stopped" size={size} />;
  }
}

const CAUSE_ICONS: Record<string, LucideIcon> = {
  ACCIDENT: CarFront,
  CONSTRUCTION: Construction,
  DEMONSTRATION: Users,
  HOLIDAY: CalendarDays,
  MAINTENANCE: Hammer,
  MEDICAL_EMERGENCY: HeartPulse,
  POLICE_ACTIVITY: Shield,
  STRIKE: Flag,
  TECHNICAL_PROBLEM: Wrench,
  WEATHER: CloudRain,
};

/** A GTFS-RT cause. */
export function CauseIcon({ cause, size = 16 }: { cause: string; size?: number }) {
  const Icon = CAUSE_ICONS[cause.toUpperCase()] ?? CircleHelp;
  return <span className="analytics-icon" aria-hidden="true"><Icon size={size} /></span>;
}

const STAT_ICONS: Record<string, LucideIcon> = {
  "service-stopped-hours": AlertTriangle,
  "median-time-to-clear": Timer,
  "share-affected": TrainTrack,
  coverage: ShieldCheck,
  "any-alert": BellRing,
  "incident-hours": Layers,
  trend: TrendingUp,
  breakdown: Shapes,
  "how-long": Timer,
  when: CalendarClock,
  where: MapPin,
  "slow-zones": Construction,
  cancellations: TrainFront,
  calendar: CalendarDays,
  episodes: ListOrdered,
  lines: TrainTrack,
  "on-time": Gauge,
  "on-time-performance": Gauge,
  "ttc-delay-log": FileText,
  "ttc-performance-history": Target,
  availability: ShieldCheck,
  dates: CalendarDays,
  source: Database,
};

/** The icon for a figure, a chart or a section, by its id. Delays use the delay artwork. */
export function StatIcon({ id, size = 14 }: { id: string; size?: number }) {
  if (id === "delay-incidents") return <ClassIcon id="delay" size={size} plain />;
  const Icon = STAT_ICONS[id];
  return Icon ? <span className="analytics-icon" aria-hidden="true"><Icon size={size} /></span> : null;
}
