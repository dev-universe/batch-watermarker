import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const sourceSvg = path.join(root, "assets", "app-icon.svg");
const outputDir = path.join(root, "build");
const pngDir = path.join(outputDir, "generated-icons");
const iconsetDir = path.join(outputDir, "icon.iconset");

const sizes = [16, 32, 64, 128, 256, 512, 1024];

await mkdir(outputDir, { recursive: true });
await rm(pngDir, { recursive: true, force: true });
await rm(iconsetDir, { recursive: true, force: true });
await mkdir(pngDir, { recursive: true });
await mkdir(iconsetDir, { recursive: true });

for (const size of sizes) {
  const pngPath = path.join(pngDir, `icon-${size}.png`);
  await sharp(sourceSvg).resize(size, size).png().toFile(pngPath);
}

const icoBuffer = await pngToIco(sizes.map((size) => path.join(pngDir, `icon-${size}.png`)));
await writeFile(path.join(outputDir, "icon.ico"), icoBuffer);
await sharp(sourceSvg).resize(512, 512).png().toFile(path.join(outputDir, "icon.png"));

const iconsetPairs = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"]
];

for (const [size, fileName] of iconsetPairs) {
  await sharp(sourceSvg).resize(size, size).png().toFile(path.join(iconsetDir, fileName));
}

try {
  await execFileAsync("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(outputDir, "icon.icns")]);
  console.log("Generated build/icon.icns");
} catch {
  console.warn("iconutil not available. build/icon.icns was not generated on this platform.");
}

console.log("Generated build/icon.png and build/icon.ico");
