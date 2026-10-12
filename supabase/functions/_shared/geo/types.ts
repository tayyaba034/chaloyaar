// Shared geo types. This folder is plain TypeScript with no Deno or Node APIs so the same
// code runs in the Supabase Edge Function and in-process in Next.js.

export type LatLng = { latitude: number; longitude: number };

export type GeoResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; code: string; message: string };

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export function ok<T>(value: T, warnings: string[] = []): GeoResult<T> {
  return { ok: true, value, warnings };
}

export function fail<T>(code: string, message: string): GeoResult<T> {
  return { ok: false, code, message };
}
