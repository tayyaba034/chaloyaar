import { apiError, isMissingSchema, migrationPending } from "./api-errors";
import { migrations } from "./migrations";
import { log } from "./log";

// Maps Supabase errors from trip-planner functions to API responses. Business-rule exceptions
// raised in SQL (P0001) carry a user-readable message; permission errors become 403.
export function dbError(error: { code?: string; message?: string }, event: string, migration: string = migrations.tripPlanner) {
  if (isMissingSchema(error)) return migrationPending(migration);
  if (error.code === "P0001") return apiError("RULE", error.message ?? "That action is not allowed.", 409);
  if (error.code === "42501") return apiError("FORBIDDEN", "You cannot change this record.", 403);
  if (error.code === "23514" || error.code === "22P02" || error.code === "22007") return apiError("VALIDATION_ERROR", "Some details are invalid.", 400);
  if (error.code === "40001") return apiError("CONFLICT", error.message ?? "The record changed. Reload and try again.", 409);
  log.error(event, { code: error.code });
  return apiError("UNAVAILABLE", "This is temporarily unavailable. Please try again.", 503);
}
