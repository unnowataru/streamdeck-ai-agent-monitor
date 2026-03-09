import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const pluginSourceDir = path.join(rootDir, "packages", "plugin");
const collectorBundlePath = path.join(
    rootDir,
    "packages",
    "collector",
    "dist",
    "collector.js",
);
const stagingDir = path.join(rootDir, "dist", "com.antigravity.aimonitor.sdPlugin");
const runtimePaths = [
    "manifest.json",
    "dist/plugin.js",
    "property-inspector",
    "imgs",
    "layouts",
];
const pluginIconBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAIAAADajyQQAAAAa0lEQVR4nO3PAQkAMAzAsAkZ9y/zMk5PoAKa2T1fNs8PwMDAkoHVAqsFVgusFlgtsFpgtcBqgdUCqwVWC6wWWC2wWmC1wGqB1QKrBVYLrBZYLbBaYLXAaoHVAqsFVgusFlgtsFpgtcBqgdW6NRXN26gj12MAAAAASUVORK5CYII=";

await rm(stagingDir, { recursive: true, force: true });
await mkdir(stagingDir, { recursive: true });

for (const relativePath of runtimePaths) {
    await cp(
        path.join(pluginSourceDir, relativePath),
        path.join(stagingDir, relativePath),
        { recursive: true },
    );
}

await cp(collectorBundlePath, path.join(stagingDir, "collector.js"));

const iconBytes = Buffer.from(pluginIconBase64, "base64");
await writeFile(path.join(stagingDir, "imgs", "plugin.png"), iconBytes);
await writeFile(path.join(stagingDir, "imgs", "plugin@2x.png"), iconBytes);

console.log(`Staged plugin at ${path.relative(rootDir, stagingDir)}`);
