"use client";
import { useTranslations } from "next-intl";
import { WarningCircle } from "@phosphor-icons/react";

export type ApiFailure = { code?: string; message?: string; details?: { migration?: string } };

// Shown instead of a silent failure when a feature is built but its setup step is missing.
export function SetupNotice({ failure }: { failure: ApiFailure }) {
  const t = useTranslations("setup");
  const pending = failure.code === "MIGRATION_PENDING";
  return (
    <div className={`driver-message${pending ? "" : " driver-error"}`} role="status">
      <WarningCircle aria-hidden="true" />
      <div>
        <strong>{pending ? t("migrationTitle") : t("errorTitle")}</strong>
        <p>{pending ? t("migrationBody") : failure.message ?? t("errorBody")}</p>
        {pending && failure.details?.migration && <code lang="en" dir="ltr">{failure.details.migration}</code>}
      </div>
    </div>
  );
}

export async function readFailure(response: Response): Promise<ApiFailure> {
  const body = await response.json().catch(() => null) as { error?: ApiFailure } | null;
  return body?.error ?? { message: undefined };
}
