import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({ resolve: { alias: {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "@geo": fileURLToPath(new URL("../../supabase/functions/_shared/geo", import.meta.url)),
} } });
