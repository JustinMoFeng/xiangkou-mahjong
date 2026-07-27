import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const distDir = join(root, "dist");
const functionsDir = join(root, "functions");
const outputDir = join(root, "edgeone-output");

if (!existsSync(distDir)) {
  throw new Error("dist/ does not exist. Run npm run build before preparing the EdgeOne package.");
}

rmSync(outputDir, { recursive: true, force: true });
cpSync(distDir, outputDir, { recursive: true });

if (existsSync(functionsDir)) {
  cpSync(functionsDir, join(outputDir, "edge-functions"), { recursive: true });
}

writeFileSync(
  join(outputDir, "package.json"),
  `${JSON.stringify(
    {
      name: "xiangkou-mahjong-edgeone-functions",
      version: "0.0.0",
      private: true,
      type: "module",
      dependencies: {
        "@edgeone/pages-blob": "0.0.13",
      },
    },
    null,
    2,
  )}\n`,
);
