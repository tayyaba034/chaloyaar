import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ur", "en", "ur-Latn", "pa-Arab"],
  defaultLocale: "ur",
  localePrefix: "always",
  localeDetection: false,
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  },
});

export type AppLocale = (typeof routing.locales)[number];

export function isAppLocale(value: string): value is AppLocale {
  return routing.locales.some((locale) => locale === value);
}
