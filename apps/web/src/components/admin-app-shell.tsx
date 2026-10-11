"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const navigation = [
  { key: "overview", href: "/admin" },
  { key: "fuelPrices", href: "/admin/fuel-prices" },
  { key: "stations", href: "/admin/stations" },
  { key: "reports", href: "/admin/reports" },
  { key: "providers", href: "/admin/providers" },
  { key: "requests", href: "/admin/requests" },
  { key: "coverage", href: "/admin/coverage" },
  { key: "audit", href: "/admin/audit" },
] as const;

export function AdminAppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("shell.admin");
  const pathname = usePathname();
  const links = (
    <nav className="role-navigation" aria-label={t("navigationLabel")}>
      {navigation.map(({ key, href }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link className={`role-nav-link${active ? " is-active" : ""}`} href={href} key={key} aria-current={active ? "page" : undefined}>
            <span>{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="role-app-shell admin-app-shell cy-root">
      <aside className="role-sidebar">
        <Link className="brand" href="/admin"><span aria-hidden="true">⛽</span> Chalo Yaar</Link>
        {links}
      </aside>
      <div className="role-main">
        <header className="role-mobile-header">
          <Link className="brand" href="/admin"><span aria-hidden="true">⛽</span> Chalo Yaar</Link>
        </header>
        {children}
        {links}
      </div>
    </div>
  );
}
