import { ArrowRight } from "lucide-react";

export function CommuteRouteLabel({ label }: { label: string }) {
  const stations = label.split(/\s*(?:→|-\s*>)\s*/);
  if (stations.length !== 2) return label;
  return (
    <>
      {stations[0]}{" "}
      <ArrowRight className="commute-route-direction-arrow" size={16} strokeWidth={3} aria-hidden="true" />
      <span className="sr-only"> → </span>{" "}{stations[1]}
    </>
  );
}
