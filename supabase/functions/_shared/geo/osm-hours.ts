// Parses the common subset of OpenStreetMap opening_hours ("Mo-Sa 09:00-21:00; Su off", "24/7",
// "Mo-Fr 10:00-14:00,17:00-21:00"). Anything else returns null and the raw text is shown as-is.
// Published hours are a constraint on timing only, never proof that someone is present.

export type ParsedHours = Array<{ weekday: number; opensAt: string; closesAt: string; closesNextDay: boolean }>;

const dayIndex: Record<string, number> = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
const order = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function expandDays(spec: string): number[] | null {
  const days = new Set<number>();
  for (const part of spec.split(",")) {
    const range = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part.trim());
    if (!range) return null;
    const start = order.indexOf(range[1]);
    const end = range[2] ? order.indexOf(range[2]) : start;
    for (let i = start; ; i = (i + 1) % 7) {
      days.add(dayIndex[order[i]]);
      if (i === end) break;
    }
  }
  return [...days];
}

export function parseOsmOpeningHours(raw: string | null | undefined): ParsedHours | null {
  const text = raw?.trim();
  if (!text || text.length > 300) return null;
  if (text === "24/7") return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: "00:00", closesAt: "00:00", closesNextDay: true }));
  const rows: ParsedHours = [];
  const closed = new Set<number>();
  for (const rule of text.split(";").map((value) => value.trim()).filter(Boolean)) {
    const match = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.+)$/.exec(rule);
    if (!match) return null;
    const days = match[1] ? expandDays(match[1]) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return null;
    const times = match[2].trim();
    if (times === "off" || times === "closed") {
      days.forEach((day) => closed.add(day));
      continue;
    }
    for (const span of times.split(",")) {
      const time = /^([01]\d|2[0-4]):([0-5]\d)-([01]\d|2[0-4]):([0-5]\d)$/.exec(span.trim());
      if (!time) return null;
      const opensAt = `${time[1]}:${time[2]}`;
      const closesAt = `${time[3] === "24" ? "00" : time[3]}:${time[4]}`;
      const closesNextDay = time[3] === "24" || Number(time[3]) * 60 + Number(time[4]) <= Number(time[1]) * 60 + Number(time[2]);
      for (const weekday of days) rows.push({ weekday, opensAt, closesAt, closesNextDay });
    }
  }
  const result = rows.filter((row) => !closed.has(row.weekday));
  return result.length || closed.size ? result : null;
}
