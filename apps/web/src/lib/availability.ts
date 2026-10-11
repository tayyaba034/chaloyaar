export type AvailabilityStatus =
  | "available"
  | "unavailable"
  | "stale"
  | "unknown"
  | "queue_reported";

type AvailabilityReport = {
  reported_status: Exclude<AvailabilityStatus, "stale" | "unknown">;
  expires_at: string;
} | null;

export function resolveAvailabilityStatus(
  report: AvailabilityReport,
  now: Date = new Date(),
): AvailabilityStatus {
  if (!report) return "unknown";
  if (new Date(report.expires_at).getTime() <= now.getTime()) return "stale";
  return report.reported_status;
}
