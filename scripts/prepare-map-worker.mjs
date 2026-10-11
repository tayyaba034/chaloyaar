import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packagePath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(await readFile(packagePath, "utf8"));
const destination = fileURLToPath(new URL(`../apps/web/public/maplibre/${version}/`, import.meta.url));
await mkdir(destination, { recursive: true });
// Keep the distribution's sibling shared bundle available for versions that import it.
for (const name of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(join(dirname(packagePath), "dist", name), join(destination, name));
}
await copyFile(join(dirname(packagePath), "LICENSE.txt"), join(destination, "LICENSE.txt"));
console.log(`Prepared same-origin MapLibre ${version} worker assets.`);
