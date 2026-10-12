import { notFound } from "next/navigation";
import { RoadsideAssistance } from "@/components/roadside-assistance";
import { DriverVehicles } from "@/components/driver-vehicles";
import { DriverFuelHistory } from "@/components/driver-fuel-history";
import { DriverProfile } from "@/components/driver-profile";
import { TrueCostFeature } from "@/components/truecost-feature";
import { SavedPlaces } from "@/components/saved-places";
import { BusinessDashboard } from "@/components/business-dashboard";
import { TripsHome } from "@/components/trips-home";
import { TripDetail } from "@/components/trip-detail";
import { TripOutcome } from "@/components/trip-outcome";
import { TripsHistory } from "@/components/trips-history";
import { Suspense } from "react";

export default async function DriverFeaturePage({
  params,
}: PageProps<"/[locale]/app/[...segments]">) {
  const { segments } = await params;
  const key = segments.join("/");
  if (key === "help" || key === "help/new") return <RoadsideAssistance />;
  if (key === "vehicle") return <DriverVehicles />;
  if (key === "vehicle/log") return <DriverFuelHistory formOnly />;
  if (key === "fuel-history") return <DriverFuelHistory />;
  if (key === "profile") return <DriverProfile />;
  if (key === "settings") return <DriverProfile settings />;
  if (key === "truecost") return <TrueCostFeature />;
  if (key === "saved-places") return <SavedPlaces />;
  if (key === "business") return <Suspense><BusinessDashboard /></Suspense>;
  if (key === "trips") return <TripsHome />;
  if (key === "trips/history") return <TripsHistory />;
  if (segments[0] === "trips" && segments.length === 3 && segments[2] === "outcome" && /^[0-9a-f-]{36}$/i.test(segments[1])) return <TripOutcome tripId={segments[1]} />;
  if (segments[0] === "trips" && segments.length === 2 && /^[0-9a-f-]{36}$/i.test(segments[1])) return <TripDetail tripId={segments[1]} />;
  if (segments[0] === "help" && segments.length === 2) {
    return <RoadsideAssistance requestId={segments[1]} />;
  }
  notFound();
}
