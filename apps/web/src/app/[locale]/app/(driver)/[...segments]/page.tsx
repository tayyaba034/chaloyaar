import { notFound } from "next/navigation";
import { RoadsideAssistance } from "@/components/roadside-assistance";
import { DriverVehicles } from "@/components/driver-vehicles";
import { DriverFuelHistory } from "@/components/driver-fuel-history";
import { DriverProfile } from "@/components/driver-profile";
import { TrueCostFeature } from "@/components/truecost-feature";

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
  if (segments[0] === "help" && segments.length === 2) {
    return <RoadsideAssistance requestId={segments[1]} />;
  }
  notFound();
}
