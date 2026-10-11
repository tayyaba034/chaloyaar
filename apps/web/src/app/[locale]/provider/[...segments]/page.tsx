import { notFound } from "next/navigation";
import { FeaturePlaceholder } from "@/components/feature-placeholder";
import { ProviderServices } from "@/components/provider-services";

const sections: Record<string, Parameters<typeof FeaturePlaceholder>[0]["feature"]> = {
  requests: "providerRequests",
  services: "providerServices",
  profile: "providerProfile",
};

export default async function ProviderSectionPage({
  params,
}: PageProps<"/[locale]/provider/[...segments]">) {
  const { segments } = await params;
  if (segments.join("/") === "services") return <ProviderServices />;
  const feature = segments.length === 1 ? sections[segments[0]] : undefined;
  if (!feature) notFound();
  return <FeaturePlaceholder feature={feature} />;
}
