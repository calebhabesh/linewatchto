import { windowCountdownStage } from "../app/current-service";

type Props = {
  timing?: string;
  target?: string | null;
  now: number;
  shuttle: boolean;
};

/** Preserve the full time label; only the bracketed countdown receives a tint. */
export function IncidentTiming({ timing, target, now, shuttle }: Props) {
  const parts = timing?.match(/^(.*) (\([^()]+\))$/);
  const stage = windowCountdownStage(target, now);
  return (
    <>
      {parts && stage ? <>{parts[1]} <span className="incident-countdown" data-stage={stage}>{parts[2]}</span></> : timing}
      {shuttle ? <span className="incident-shuttle">Shuttle Buses Running</span> : null}
    </>
  );
}
