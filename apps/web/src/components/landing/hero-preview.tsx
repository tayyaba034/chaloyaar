"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BatteryCharging, GasPump, MapPin, Truck, Wrench } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { StatusChip } from "./status";
import type { StatusKey } from "./status";

type TimeKey = "reportedRecently" | "reportedEarlier" | "expired" | "noReport";

// The petrol row steps through the labels a driver can meet, so the hero shows
// how a status and its report time change together.
const petrolCycle: { status: StatusKey; time: TimeKey }[] = [
  { status: "available", time: "reportedRecently" },
  { status: "queue", time: "reportedEarlier" },
  { status: "stale", time: "expired" },
  { status: "unknown", time: "noReport" },
];

// A working miniature of the station list screen, framed as a phone. It is
// an illustration of the real UI built from the same status component.
export function HeroPreview() {
  const t = useTranslations("landing");
  const homeT = useTranslations("home");
  const fuelT = useTranslations("stations.fuels");
  const areaT = useTranslations("stations.areas");
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  // Play the cycle once and settle on Unknown, so the motion ends on its own.
  useEffect(() => {
    if (reduce || step === petrolCycle.length - 1) return;
    const timer = window.setTimeout(() => setStep(step + 1), 2200);
    return () => window.clearTimeout(timer);
  }, [reduce, step]);

  const petrol = petrolCycle[step];
  const rows = [
    { fuel: "diesel", status: "available", time: "reportedEarlier" },
    { fuel: "cng", status: "unknown", time: "noReport" },
  ] as const;

  return (
    <div className="cy-hero-visual">
      <span className="cy-hero-wordmark" aria-hidden="true" translate="no">
        {homeT("brand").split(" ").map((word) => (
          <span key={word}>{word}</span>
        ))}
      </span>

      <motion.figure
        className="cy-phone"
        aria-label={t("preview.ariaLabel")}
        initial={reduce ? false : { opacity: 0, y: 40, rotate: 0 }}
        animate={{ opacity: 1, y: 0, rotate: -4 }}
        transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="cy-phone-screen">
          <div className="cy-phone-top">
            <span className="cy-phone-notch" aria-hidden="true" />
            <p className="cy-phone-title">{homeT("actions.fuel")}</p>
            <p className="cy-phone-area">
              <MapPin aria-hidden="true" weight="fill" />
              {areaT("susan-road")}
            </p>
          </div>
          <div className="cy-phone-sheet">
            <div className="cy-phone-filters" aria-hidden="true">
              <span className="is-on">{fuelT("petrol")}</span>
              <span>{fuelT("diesel")}</span>
              <span>{fuelT("cng")}</span>
            </div>

            <div className="cy-preview-card">
              <div className="cy-preview-head">
                <span className="cy-preview-icon" aria-hidden="true">
                  <GasPump weight="fill" />
                </span>
                <div>
                  <p className="cy-preview-name">{t("preview.name")}</p>
                  <p className="cy-preview-meta">{t("preview.meta")}</p>
                </div>
                <span className="cy-preview-example">{t("preview.example")}</span>
              </div>
              <ul className="cy-preview-rows">
                <li>
                  <span className="cy-preview-fuel">{fuelT("petrol")}</span>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={petrol.status}
                      className="cy-preview-status"
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ type: "spring", stiffness: 260, damping: 26 }}
                    >
                      <StatusChip status={petrol.status} label={t(`status.${petrol.status}`)} />
                      <small>{t(`preview.${petrol.time}`)}</small>
                    </motion.span>
                  </AnimatePresence>
                </li>
                {rows.map((row) => (
                  <li key={row.fuel}>
                    <span className="cy-preview-fuel">{fuelT(row.fuel)}</span>
                    <span className="cy-preview-status">
                      <StatusChip status={row.status} label={t(`status.${row.status}`)} />
                      <small>{t(`preview.${row.time}`)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="cy-phone-ghost" aria-hidden="true" />
          </div>
        </div>
      </motion.figure>

      <motion.div
        className="cy-hero-help"
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <p>{homeT("actions.help")}</p>
        <span className="cy-hero-help-icons">
          <Wrench weight="bold" />
          <BatteryCharging weight="bold" />
          <Truck weight="bold" />
        </span>
        <small>{t("liveTag")}</small>
      </motion.div>
    </div>
  );
}
