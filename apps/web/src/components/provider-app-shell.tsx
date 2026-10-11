"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { SpeakerButton } from "./speaker-button";

const navigation = [
  { key: "requests", href: "/provider/requests" },
  { key: "services", href: "/provider/services" },
  { key: "profile", href: "/provider/profile" },
] as const;

export function ProviderAppShell({
  children,
  displayName,
  verificationStatus,
}: {
  children: ReactNode;
  displayName: string | null;
  verificationStatus: "pending" | "approved" | "suspended";
}) {
  const t = useTranslations("shell.provider");
  const pathname = usePathname();
  if (verificationStatus !== "approved") {
    const suspended = verificationStatus === "suspended";
    const title = suspended ? t("suspendedTitle") : t("pendingTitle");
    const message = suspended ? t("suspendedMessage") : t("pendingMessage");
    return (
      <main className="provider-pending-screen cy-root">
        <section className="notice-card" aria-labelledby="provider-verification-title">
          <span className="notice-icon" aria-hidden="true">{suspended ? "⛔" : "⏳"}</span>
          <div className="dashboard-card-heading">
            <h1 id="provider-verification-title">{title}</h1>
            <SpeakerButton text={`${title}. ${message}`} phraseId="provider-verification-status" />
          </div>
          <p>{message}</p>
        </section>
      </main>
    );
  }

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
    <div className="role-app-shell cy-root">
      <aside className="role-sidebar">
        <Link className="brand" href="/provider"><span aria-hidden="true">⛽</span> Chalo Yaar</Link>
        {links}
        <p className="role-account-name">{displayName}</p>
      </aside>
      <div className="role-main">
        <header className="role-mobile-header">
          <Link className="brand" href="/provider"><span aria-hidden="true">⛽</span> Chalo Yaar</Link>
          <span>{displayName}</span>
        </header>
        {children}
        {links}
      </div>
    </div>
  );
}
