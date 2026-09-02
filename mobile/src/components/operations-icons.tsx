import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import {
  Accessibility,
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Bookmark,
  Bus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Construction,
  ExternalLink,
  History,
  Info,
  Layers,
  Locate,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  ShieldCheck,
  Sun,
  Train,
  Trash2,
  User,
  X,
} from "lucide-react-native";

export interface IconProps {
  color?: ColorValue | string;
  size?: number;
}

export function CloseIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <X color={color as string} size={size} strokeWidth={2} />;
}

export function BackIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <ChevronLeft color={color as string} size={size} strokeWidth={2} />;
}

export function ChevronRightIcon({ color = "#ffffff", size = 16 }: IconProps) {
  return <ChevronRight color={color as string} size={size} strokeWidth={2} />;
}

export function ChevronDownIcon({ color = "#ffffff", size = 16 }: IconProps) {
  return <ChevronDown color={color as string} size={size} strokeWidth={2} />;
}

export function ChevronUpIcon({ color = "#ffffff", size = 16 }: IconProps) {
  return <ChevronUp color={color as string} size={size} strokeWidth={2} />;
}

export function LocateIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Locate color={color as string} size={size} strokeWidth={2} />;
}

export function RefreshIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <RefreshCw color={color as string} size={size} strokeWidth={2} />;
}

export function SunIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Sun color={color as string} size={size} strokeWidth={2} fill={color as string} />;
}

export function MoonIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Moon color={color as string} size={size} strokeWidth={2} fill={color as string} />;
}

export function TrainIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Train color={color as string} size={size} strokeWidth={2} />;
}

export function AlertTriangleIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <AlertTriangle color={color as string} size={size} strokeWidth={2} />;
}

export function BellIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Bell color={color as string} size={size} strokeWidth={2} />;
}

export function SearchIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Search color={color as string} size={size} strokeWidth={2} />;
}

export function BookmarkIcon({ color = "#ffffff", size = 18, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Bookmark
      color={color as string}
      size={size}
      strokeWidth={2}
      fill={filled ? (color as string) : "none"}
    />
  );
}

export function ConstructionIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Construction color={color as string} size={size} strokeWidth={2} />;
}

export function InfoIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Info color={color as string} size={size} strokeWidth={2} />;
}

export function CheckIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Check color={color as string} size={size} strokeWidth={2} />;
}

export function ClockIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Clock color={color as string} size={size} strokeWidth={2} />;
}

export function RotateIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <RotateCw color={color as string} size={size} strokeWidth={2} />;
}

export function ExternalLinkIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <ExternalLink color={color as string} size={size} strokeWidth={2} />;
}

export function AccessibilityIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Accessibility color={color as string} size={size} strokeWidth={2} />;
}

export function BusIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Bus color={color as string} size={size} strokeWidth={2} />;
}

export function UserIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <User color={color as string} size={size} strokeWidth={2} />;
}

export function ActivityIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Activity color={color as string} size={size} strokeWidth={2} />;
}

export function PlusIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Plus color={color as string} size={size} strokeWidth={2} />;
}

export function EditIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Pencil color={color as string} size={size} strokeWidth={2} />;
}

export function TrashIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Trash2 color={color as string} size={size} strokeWidth={2} />;
}

export function ArrowRightIcon({
  color = "#ffffff",
  size = 16,
  strokeWidth = 2.75,
}: IconProps & { strokeWidth?: number }) {
  return <ArrowRight color={color as string} size={size} strokeWidth={strokeWidth} />;
}

export function HistoryIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <History color={color as string} size={size} strokeWidth={2} />;
}

export function LayersIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <Layers color={color as string} size={size} strokeWidth={2} />;
}

export function ShieldCheckIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return <ShieldCheck color={color as string} size={size} strokeWidth={2} />;
}

/* -------------------------------------------------------------------------- */
/* Canonical LineWatch-Authored Icons (Exact match to frontend components)    */
/* -------------------------------------------------------------------------- */

export function BellFilledIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 18H4l2-2V10a6 6 0 015-5.91V3a1 1 0 012 0V4.09a5.9 5.9 0 011.3.4A3.992 3.992 0 0018 10v6z"
        fill={color as string}
      />
      <Path d="M10 20a2 2 0 004 0H10z" fill={color as string} />
      <Circle cx={19} cy="5" r={2} fill={color as string} />
    </Svg>
  );
}

export function PlannedClosureIcon({
  color = "#ffffff",
  size = 18,
  strokeWidth = 2,
}: IconProps & { strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3}
        y={5}
        width={18}
        height={16}
        rx={3}
        stroke={color as string}
        strokeWidth={strokeWidth}
      />
      <Path
        d="M3 9H21M12 12V15M12 18H12.01M7 3V5M17 3V5"
        stroke={color as string}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function DelayIcon({
  color = "#ffffff",
  size = 18,
  filled = true,
}: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 4v2h2v4a7 7 0 003.4 6A7 7 0 009 22v4H7v2h18v-2h-2v-4a7 7 0 00-3.4-6A7 7 0 0023 10V6h2V4zm4 2h10v4c0 2.773-2.227 5-5 5s-5-2.227-5-5zm1.156 5c.446 1.723 1.98 3 3.844 3c1.863 0 3.398-1.277 3.844-3zM16 17c2.773 0 5 2.227 5 5v4h-1c0-2.21-1.79-4-4-4s-4 1.79-4 4h-1v-4c0-2.773 2.227-5 5-5z"
        fill={color as string}
        transform="translate(-0.8, -0.8) scale(0.8)"
      />
      <Circle
        cx={18}
        cy={18}
        r={5.2}
        fill={filled ? (color as string) : "none"}
        stroke={color as string}
        strokeWidth={filled ? 0 : 1.5}
      />
      {filled ? (
        <>
          <Path
            d="M18 14.5v3.2"
            stroke="#0d0808"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <Circle cx={18} cy={20.8} r={0.9} fill="#0d0808" />
        </>
      ) : (
        <>
          <Path
            d="M18 14.5v3.2"
            stroke={color as string}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <Circle cx={18} cy={20.8} r={0.9} fill={color as string} />
        </>
      )}
    </Svg>
  );
}

export function PhoneRotateLandscapeIcon({ color = "#ffffff", size = 20 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color as string}>
      <Path d="M9 1H3a2 2 0 00-2 2v13a2 2 0 002 2h6a2 2 0 002-2V3a2 2 0 00-2-2m0 14H3V3h6v12m12-2h-8v2h8v6H9v-1H6v1a2 2 0 002 2h13a2 2 0 002-2v-6a2 2 0 00-2-2m2-3l-4-2l1.91-.91A7.516 7.516 0 0014 2.5V1a9 9 0 019 9z" />
    </Svg>
  );
}

export function ElevatorIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={2} width={16} height={20} rx={2} stroke={color as string} strokeWidth={2} />
      <Path
        d="M9 10l3-3 3 3M9 14l3 3 3-3"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function EscalatorIcon({ color = "#ffffff", size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 19h4l8-14h4"
        stroke={color as string}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={10} cy={7} r={2} fill={color as string} />
      <Path d="M8 12l2-3 2 1" stroke={color as string} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
