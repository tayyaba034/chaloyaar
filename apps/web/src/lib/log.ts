// Structured JSON logs. Never pass coordinates, phone numbers, message text or other personal data.
type Level = "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | null | undefined>;

function write(level: Level, event: string, fields: Fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};

export function errorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}
