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
  ariaBusy?: boolean;
  className?: string;
  id?: string;
  role?: AriaRole;
  thumbContent?: ReactNode;
  title?: string;
};

declare const SquishSwitch: ForwardRefExoticComponent<
  SquishSwitchProps & RefAttributes<HTMLButtonElement>
>;

export default SquishSwitch;
