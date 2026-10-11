import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("title"),
    description: t("description"),
    applicationName: t("title"),
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icons/chalo.svg", apple: "/icons/chalo.svg" },
    appleWebApp: { capable: true, statusBarStyle: "default", title: t("title") },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const direction = locale === "ur" || locale === "pa-Arab" ? "rtl" : "ltr";
  const messages = await getMessages();

  return (
    <html lang={locale} dir={direction} className="font-arabic">
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
          <ServiceWorkerRegister />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
