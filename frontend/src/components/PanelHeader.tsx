"use client";

import type { ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";

export interface PanelHeaderProps {
  title: ReactNode;
  icon?: ReactNode;
  kicker?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  onClose?: () => void;
  closeLabel?: string;
  metadata?: ReactNode;
  titleCompact?: boolean;
  className?: string;
  titleClassName?: string;
  titleGroupClassName?: string;
  actions?: ReactNode;
  titleBadge?: ReactNode;
}

export function PanelHeader({
  title,
  icon,
  kicker,
  onBack,
  backLabel = "Back",
  onClose,
  closeLabel = "Close",
  metadata,
  titleCompact = false,
  className = "",
  titleClassName = "",
  titleGroupClassName = "",
  actions,
  titleBadge,
}: PanelHeaderProps) {
  return (
    <div className={`panel-heading panel-header ${className}`.trim()}>
      {kicker ? <div className="panel-header-kicker">{kicker}</div> : null}
      <div className="panel-header-primary">
        <div className={`panel-header-title-group ${titleGroupClassName}`.trim()}>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="panel-header-btn panel-header-back"
              aria-label={backLabel}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
          ) : null}
          <div className="panel-header-title-wrap">
            {icon ? (
              <span className={`panel-header-icon ${titleCompact ? "panel-header-icon--compact" : ""}`.trim()} aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <h2 className={`panel-header-title ${titleCompact ? "panel-header-title--compact" : ""} ${titleClassName}`.trim()}>
              {typeof title === "string" ? <span>{title}</span> : title}
            </h2>
            {titleBadge}
          </div>
        </div>
        <div className="panel-header-actions">
          {actions}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="panel-header-btn panel-header-close"
              aria-label={closeLabel}
            >
              <X size={20} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      {metadata ? (
        <div className="panel-header-metadata">
          {metadata}
        </div>
      ) : null}
    </div>
  );
}
