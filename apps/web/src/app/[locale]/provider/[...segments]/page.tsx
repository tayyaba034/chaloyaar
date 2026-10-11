import { notFound } from "next/navigation";
import { FeaturePlaceholder } from "@/components/feature-placeholder";

const sections: Record<string, Parameters<typeof FeaturePlaceholder>[0]["feature"]> = {
  requests: "providerRequests",
  services: "providerServices",
  profile: "providerProfile",
};

export default async function ProviderSectionPage({
  params,
}: PageProps<"/[locale]/provider/[...segments]">) {
  const { segments } = await params;
  const feature = segments.length === 1 ? sections[segments[0]] : undefined;
  if (!feature) notFound();
  return <FeaturePlaceholder feature={feature} />;
}
