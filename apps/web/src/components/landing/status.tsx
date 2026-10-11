import {
  CheckCircle,
  ClockCountdown,
  ClockCounterClockwise,
  Question,
  XCircle,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

export const statusKeys = ["available", "queue", "stale", "unavailable", "unknown"] as const;
export type StatusKey = (typeof statusKeys)[number];

// Status is always icon + word; colour is a third, redundant cue (PLAN.md UI rules).
export const statusIcons: Record<StatusKey, Icon> = {
  available: CheckCircle,
  queue: ClockCountdown,
  stale: ClockCounterClockwise,
  unavailable: XCircle,
  unknown: Question,
};

export function StatusChip({ status, label }: { status: StatusKey; label: string }) {
  const StatusIcon = statusIcons[status];
  return (
    <span className={`cy-status cy-status--${status}`}>
      <StatusIcon aria-hidden="true" weight="bold" />
      {label}
    </span>
  );
}
