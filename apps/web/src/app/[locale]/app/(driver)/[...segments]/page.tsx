import { notFound } from "next/navigation";
import { FeaturePlaceholder } from "@/components/feature-placeholder";
import { RoadsideAssistance } from "@/components/roadside-assistance";

const featureByPath: Record<string, Parameters<typeof FeaturePlaceholder>[0]["feature"]> = {
  truecost: "truecost",
  help: "help",
  "help/new": "helpNew",
  "vehicle": "vehicle",
  "vehicle/log": "vehicleLog",
  settings: "settings",
};

export default async function DriverFeaturePage({
  params,
}: PageProps<"/[locale]/app/[...segments]">) {
  const { segments } = await params;
  const key = segments.join("/");
  if (key === "help" || key === "help/new") return <RoadsideAssistance />;
  if (segments[0] === "help" && segments.length === 2) {
    return <RoadsideAssistance requestId={segments[1]} />;
  }
  const feature = featureByPath[key];
  if (!feature || (segments[0] !== "help" && !featureByPath[key])) notFound();
  return <FeaturePlaceholder feature={feature} />;
}
