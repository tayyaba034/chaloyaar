import type { MetadataRoute } from "next";
import ur from "../messages/ur.json";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: ur.metadata.title,
    short_name: ur.metadata.shortName,
    description: ur.metadata.description,
    start_url: "/ur",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7f6",
    theme_color: "#075e54",
    dir: "rtl",
    lang: "ur",
    icons: [
      {
        src: "/icons/chalo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
