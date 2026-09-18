import type { AriaRole, ForwardRefExoticComponent, ReactNode, RefAttributes } from "react";

export type SquishSwitchProps = {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  trackColor?: string;
  trackOnColor?: string;
  thumbColor?: string;
  thumbOnColor?: string;
  width?: number;
  height?: number;
  radius?: number;
  speed?: number;
  stretch?: number;
  hoverScale?: number;
  colorDuration?: number;
  ariaLabel?: string;
  className?: string;
  id?: string;
  role?: AriaRole;
};

declare const SquishSwitch: ForwardRefExoticComponent<
  SquishSwitchProps & RefAttributes<HTMLButtonElement>
>;

export default SquishSwitch;
