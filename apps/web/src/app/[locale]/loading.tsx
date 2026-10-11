import { getTranslations } from "next-intl/server";

export default async function LocaleLoading() {
  const t = await getTranslations("states");
  return (
    <main className="driver-content">
      <div className="dashboard-skeleton" aria-label={t("loading")} aria-busy="true" />
    </main>
  );
}
