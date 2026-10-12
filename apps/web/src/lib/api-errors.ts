import { NextResponse } from "next/server";
import type { ZodError } from "zod";

const noStore = { "Cache-Control": "private, no-store" };

export function apiReply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

export function apiError(code: string, message: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status, headers: noStore });
}

export function validationError(error: ZodError) {
  return apiError("VALIDATION_ERROR", "Some details are missing or invalid.", 400, {
    issues: error.issues.slice(0, 10).map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
}

// PostgREST/Postgres codes for a table or function that does not exist yet (migration not applied).
const missingSchemaCodes = new Set(["42P01", "42883", "PGRST202", "PGRST205", "PGRST204"]);

export function isMissingSchema(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && missingSchemaCodes.has(error.code));
}

export function migrationPending(migration: string) {
  return apiError(
    "MIGRATION_PENDING",
    `This feature needs the database migration ${migration} to be applied to the Supabase project.`,
    503,
    { migration },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
