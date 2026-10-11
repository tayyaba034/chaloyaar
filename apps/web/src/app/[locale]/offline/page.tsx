import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { isAppLocale } from "@/i18n/routing";
import { SpeakerButton } from "@/components/speaker-button";

export default async function OfflinePage({
  params,
}: PageProps<"/[locale]/offline">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("offline");

  return (
    <main
      className="page-shell"
      style={{
        display: "grid",
        minHeight: "100vh",
        placeItems: "center",
        padding: "1rem",
        background: "#f5f7f6",
        color: "#172b27",
        fontFamily: '"Noto Naskh Arabic", Tahoma, Arial, sans-serif',
      }}
    >
      <section
        className="notice-card"
        aria-labelledby="offline-title"
        style={{
          display: "grid",
          width: "min(100%, 34rem)",
          justifyItems: "start",
          gap: "0.75rem",
          border: "1px solid #bdcbc6",
          borderRadius: "1.5rem",
          background: "#fff",
          padding: "1.5rem",
        }}
      >
        <span className="notice-icon" aria-hidden="true">📡</span>
        <h1 id="offline-title" style={{ margin: 0, fontSize: "1.75rem" }}>
          {t("title")}
        </h1>
        <p style={{ margin: 0, lineHeight: 1.7 }}>{t("message")}</p>
        <SpeakerButton
          text={`${t("title")}. ${t("message")}`}
          phraseId="offline-message"
        />
        <Link
          href="/"
          className="primary-link"
          style={{
            minHeight: "3.5rem",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "0.9rem",
            background: "#075e54",
            paddingInline: "1rem",
            color: "#fff",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          {t("retry")}
        </Link>
      </section>
    </main>
  );
}
