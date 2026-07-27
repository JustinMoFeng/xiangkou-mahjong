import { copyFileSync, cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const distDir = join(root, "dist");
const functionsDir = join(root, "functions");
const outputDir = join(root, "edgeone-output");
const deployFiles = ["package.json", "package-lock.json"];

if (!existsSync(distDir)) {
  throw new Error("dist/ does not exist. Run npm run build before preparing the EdgeOne package.");
}

rmSync(outputDir, { recursive: true, force: true });
cpSync(distDir, outputDir, { recursive: true });

if (existsSync(functionsDir)) {
  cpSync(functionsDir, join(outputDir, "edge-functions"), { recursive: true });
}

for (const filename of deployFiles) {
  const source = join(root, filename);
  if (existsSync(source)) {
    copyFileSync(source, join(outputDir, filename));
  }
}
