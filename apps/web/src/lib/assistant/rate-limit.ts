import "server-only";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 8;
const MAX_TRACKED_CLIENTS = 5_000;
const recent = new Map<string, number[]>();

// Per-instance limit that keeps one client from spending the shared free AI quota.
// Serverless instances do not share this map, so it is a soft guard, not a hard cap.
export function allowAssistantRequest(clientKey: string, now = Date.now()) {
  const times = (recent.get(clientKey) ?? []).filter((time) => now - time < WINDOW_MS);
  if (times.length >= MAX_REQUESTS) {
    recent.set(clientKey, times);
    return false;
  }
  times.push(now);
  recent.delete(clientKey);
  recent.set(clientKey, times);
  if (recent.size > MAX_TRACKED_CLIENTS) recent.delete(recent.keys().next().value!);
  return true;
}

export function resetAssistantRateLimit() {
  recent.clear();
}
