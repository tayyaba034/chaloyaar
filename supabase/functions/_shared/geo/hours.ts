// Converts published business hours into time windows relative to a trip's departure.
// Published hours only constrain WHEN a visit can happen; they never prove anyone is there.
// Pakistan Standard Time is UTC+05:00 with no daylight saving, so a fixed offset is exact.

export const PKT_OFFSET_MINUTES = 5 * 60;

export type HoursRow = {
  weekday: number; // 0 = Sunday … 6 = Saturday
  opensAt: string; // "HH:MM" local time
  closesAt: string; // "HH:MM" local time
  closesNextDay?: boolean;
  isClosed?: boolean;
  validOn?: string | null; // "YYYY-MM-DD" exception for one date; overrides weekday rows that day
};

export type TimeWindow = { startMin: number; endMin: number };

const parseClock = (value: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::\d\d)?$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

export function isValidHoursRow(row: HoursRow) {
  return Number.isInteger(row.weekday) && row.weekday >= 0 && row.weekday <= 6
    && parseClock(row.opensAt) !== null && parseClock(row.closesAt) !== null;
}

function localDate(utcMs: number) {
  const local = new Date(utcMs + PKT_OFFSET_MINUTES * 60_000);
  return { weekday: local.getUTCDay(), iso: local.toISOString().slice(0, 10), midnightUtcMs: Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - PKT_OFFSET_MINUTES * 60_000 };
}

/**
 * Windows (minutes after departure) during which the business is published as open, within
 * [0, horizonMinutes]. Returns null when no hours are known (unconstrained but unverified),
 * and [] when the business is published as closed for the whole period.
 */
export function windowsForTrip(rows: HoursRow[], departAt: Date, horizonMinutes = 24 * 60): TimeWindow[] | null {
  const valid = rows.filter(isValidHoursRow);
  if (!valid.length) return null;
  const departMs = departAt.getTime();
  const windows: TimeWindow[] = [];
  // Start one day early so an overnight window that began yesterday is included.
  for (let dayOffset = -1; dayOffset * 1440 <= horizonMinutes + 1440; dayOffset += 1) {
    const day = localDate(departMs + dayOffset * 86_400_000);
    const exceptions = valid.filter((row) => row.validOn === day.iso);
    const dayRows = exceptions.length ? exceptions : valid.filter((row) => !row.validOn && row.weekday === day.weekday);
    for (const row of dayRows) {
      if (row.isClosed) continue;
      const opens = parseClock(row.opensAt)!;
      let closes = parseClock(row.closesAt)!;
      if (row.closesNextDay || closes <= opens) closes += 1440;
      const startMin = Math.round((day.midnightUtcMs + opens * 60_000 - departMs) / 60_000);
      const endMin = Math.round((day.midnightUtcMs + closes * 60_000 - departMs) / 60_000);
      const clipped = { startMin: Math.max(0, startMin), endMin: Math.min(horizonMinutes, endMin) };
      if (clipped.endMin > clipped.startMin) windows.push(clipped);
    }
  }
  return mergeWindows(windows);
}

export function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  const sorted = [...windows].sort((a, b) => a.startMin - b.startMin);
  const merged: TimeWindow[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window.startMin <= last.endMin) last.endMin = Math.max(last.endMin, window.endMin);
    else merged.push({ ...window });
  }
  return merged;
}

// Intersection of two window sets (e.g. published hours and an appointment slot). null = no constraint.
export function intersectWindows(a: TimeWindow[] | null, b: TimeWindow[] | null): TimeWindow[] | null {
  if (a === null) return b === null ? null : mergeWindows(b);
  if (b === null) return mergeWindows(a);
  const result: TimeWindow[] = [];
  for (const left of a) {
    for (const right of b) {
      const startMin = Math.max(left.startMin, right.startMin);
      const endMin = Math.min(left.endMin, right.endMin);
      if (endMin > startMin) result.push({ startMin, endMin });
    }
  }
  return mergeWindows(result);
}

export function minutesAfter(departAt: Date, at: Date) {
  return Math.round((at.getTime() - departAt.getTime()) / 60_000);
}

export function clockLabel(departAt: Date, minutesAfterDeparture: number) {
  const local = new Date(departAt.getTime() + (minutesAfterDeparture + PKT_OFFSET_MINUTES) * 60_000);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}
