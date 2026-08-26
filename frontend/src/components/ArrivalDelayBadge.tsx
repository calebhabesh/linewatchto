import { DelayIcon } from "./DelayIcon";

type Props = {
  delayMinutes: number;
  isDue?: boolean;
  isCompact?: boolean;
};

export function ArrivalDelayBadge({ delayMinutes, isDue = false, isCompact = false }: Props) {
  const label = `${delayMinutes} Min Late`;

  return (
    <span
      className={[
        "absolute left-1.5 top-1 inline-flex max-w-[calc(100%-2.25rem)] items-center gap-0.5 whitespace-nowrap font-black leading-none",
        isCompact ? "text-[8px] sm:text-[9px]" : "text-[9px]",
        isDue ? "text-red-100" : "text-red-600 dark:text-red-400",
      ].join(" ")}
      data-arrival-delay={delayMinutes}
      aria-label={`Live estimate is ${label}`}
      title={`Live estimate is ${label}`}
    >
      <DelayIcon size={isCompact ? 9 : 10} className="shrink-0" />
      {label}
    </span>
  );
}
