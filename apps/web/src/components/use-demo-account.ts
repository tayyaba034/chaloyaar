"use client";

import { useMemo, useSyncExternalStore } from "react";

export type DemoVehicle = { id: string; name: string; fuel: "petrol" | "diesel"; economy: number };
export type DemoFuelLog = { id: string; vehicleId: string; date: string; litres: number; amount: number };
export type DemoAccount = {
  name: string; email: string; city: string; avatar: string;
  vehicles: DemoVehicle[]; primaryVehicle: string; logs: DemoFuelLog[];
  savedStations: string[];
  requests: { id: string; service: string; date: string; status: "Previewed" | "Completed (simulated)" | "Cancelled (simulated)" }[];
  reports: { id: string; station: string; date: string; status: "Pending (simulated)" | "Withdrawn (simulated)" }[];
  preferences: { autoRead: boolean; notifications: boolean; reducedMotion: boolean };
};

export const demoAccountSeed: DemoAccount = {
  name: "Demo Driver", email: "driver@example.com", city: "Faisalabad", avatar: "green",
  vehicles: [{ id: "demo-car", name: "Demo city car", fuel: "petrol", economy: 14 }, { id: "demo-diesel", name: "Demo family vehicle", fuel: "diesel", economy: 12 }],
  primaryVehicle: "demo-car",
  logs: [{ id: "demo-log-1", vehicleId: "demo-car", date: "2026-10-02", litres: 10, amount: 2500 }, { id: "demo-log-2", vehicleId: "demo-car", date: "2026-10-07", litres: 15, amount: 3750 }],
  savedStations: ["demo-faisalabad-1"],
  requests: [{ id: "DEMO-102", service: "Battery jump-start", date: "2026-10-08", status: "Previewed" }, { id: "DEMO-101", service: "Puncture repair", date: "2026-10-03", status: "Completed (simulated)" }],
  reports: [{ id: "DEMO-R1", station: "Demo station - City Centre", date: "2026-10-09", status: "Pending (simulated)" }],
  preferences: { autoRead: false, notifications: false, reducedMotion: false },
};

const storageKey = "chalo-yaar-demo-account-v1";
const changeEvent = "chalo-demo-account-change";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changeEvent, callback);
  };
}
function snapshot() {
  try { return window.localStorage.getItem(storageKey); } catch { return null; }
}
function readAccount(raw: string | null): DemoAccount {
  if (!raw) return demoAccountSeed;
  try {
    const value = JSON.parse(raw) as DemoAccount;
    if (typeof value.name !== "string" || typeof value.email !== "string" || typeof value.city !== "string" ||
      !["green", "orange", "blue", "rose"].includes(value.avatar) ||
      !Array.isArray(value.vehicles) || !Array.isArray(value.logs) || !Array.isArray(value.savedStations) ||
      !Array.isArray(value.requests) || !Array.isArray(value.reports) || !value.preferences ||
      !value.vehicles.every(v => typeof v.id === "string" && typeof v.name === "string" && ["petrol", "diesel"].includes(v.fuel) && Number.isFinite(v.economy) && v.economy > 0) ||
      !value.logs.every(log => typeof log.id === "string" && typeof log.date === "string" && Number.isFinite(log.litres) && Number.isFinite(log.amount))) return demoAccountSeed;
    return value;
  } catch { return demoAccountSeed; }
}

export function useDemoAccount() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const account = useMemo(() => readAccount(raw), [raw]);
  function update(change: (current: DemoAccount) => DemoAccount) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(change(readAccount(snapshot()))));
      window.dispatchEvent(new Event(changeEvent));
      return true;
    } catch { return false; }
  }
  return { account, update, reset: () => update(() => structuredClone(demoAccountSeed)) };
}
