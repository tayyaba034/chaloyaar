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
  const expiry = new Date(report.expires_at).getTime();
  if (!Number.isFinite(expiry)) return "unknown";
  if (expiry <= now.getTime()) return "stale";
  return report.reported_status;
}
