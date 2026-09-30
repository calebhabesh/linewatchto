import { useContext, type ReactNode } from "react";
import { DecorativeMotionPausedContext } from "./DecorativeMotionContext";
import { ElectricBorder } from "./ui/ElectricBorder";

export function IncidentElectricBorder({ kind, children }: { kind: string; children: ReactNode }) {
  const reducedMotion = useContext(DecorativeMotionPausedContext);
  const color = kind === "delay" ? "#f59e0b" : kind === "planned-closure" ? "#3b82f6" : "#ef4444";
  return (
    <ElectricBorder color={color} borderRadius={8} speed={0.15} chaos={0.007} reducedMotion={reducedMotion}>
      {children}
    </ElectricBorder>
  );
}
