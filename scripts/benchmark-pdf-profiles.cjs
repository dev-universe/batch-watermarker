// Build first, then: node scripts/benchmark-pdf-profiles.cjs
// Synthetic 5-page score + textured background. Does not read user documents.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const sharp = require("sharp");
const { PDFDict, PDFDocument, PDFName, PDFRawStream } = require("pdf-lib");
const { composeTransparentPage } = require("../dist-electron/electron/transparentImageComposition.js");
const { inspectImage } = require("../dist-electron/electron/transparentImageAssets.js");
const { exportTransparentGroups } = require("../dist-electron/electron/transparentImageExport.js");
const { readLosslessImageRgb } = require("../dist-electron/electron/testUtils/pdfImagePixels.js");
const { DEFAULT_PAGE_TRANSFORM, DEFAULT_IMAGE_WATERMARK_SETTINGS } = require("../dist-electron/src/shared/transparentImageState.js");

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "tmp", "compression-qa", `run-${Date.now()}`);

async function main() {
  await fs.mkdir(output, { recursive: true });
  const width = 512, height = 768, rgb = Buffer.alloc(width * height * 3);
  let seed = 3791;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed >>> 24) / 8;
    const offset = (y * width + x) * 3;
    rgb[offset] = 175 + x / width * 30 + noise;
    rgb[offset + 1] = 180 + y / height * 25 + noise;
    rgb[offset + 2] = 185 + (x + y) / (width + height) * 20 + noise;
  }
  const backgroundPath = path.join(output, "textured-paper.png");
  await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toFile(backgroundPath);
  const pages = [];
  const sourceHashes = [];
  for (let i = 1; i <= 5; i++) {
    const staff = Array.from({ length: 4 }, (_, system) => {
      const y = 50 + system * 35;
      return Array.from({ length: 5 }, (_, line) => `<path d="M15 ${y + line * 3}H135" stroke="#151b25" stroke-width=".25"/>`).join("") +
        Array.from({ length: 12 }, (_, note) => `<g transform="translate(${22 + note * 9},${y + (note % 4) * 3})"><ellipse rx="1.8" ry="1.3" fill="#151b25"/><path d="M1.6 0V-10" stroke="#151b25" stroke-width=".4"/></g>`).join("");
    }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150mm" height="210mm" viewBox="0 0 150 210"><text x="75" y="22" text-anchor="middle" font-family="Segoe UI" font-size="7">Music score / ${i}</text>${staff}</svg>`;
    const file = path.join(output, `page-${i}.svg`);
    await fs.writeFile(file, svg);
    sourceHashes.push({ path: file, hash: hash(await fs.readFile(file)) });
    pages.push({ id: String(i), asset: await inspectImage(file), transform: { ...DEFAULT_PAGE_TRANSFORM } });
  }
  const watermarkPath = path.join(output, "watermark.svg");
  await fs.writeFile(watermarkPath, '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><text x="100" y="35" text-anchor="middle" font-family="Segoe UI" font-size="32" fill="#2563eb">UNIVERSE</text></svg>');
  const project = { groups: [{ id: "score", name: "score", pages }],
    background: { asset: await inspectImage(backgroundPath), fit: "cover" },
    watermarks: [{ id: "wm", label: "Watermark", asset: await inspectImage(watermarkPath), visible: true, locked: false,
      settings: { ...DEFAULT_IMAGE_WATERMARK_SETTINGS, rotation: 25, opacity: 20 } }] };
  const baseline = await PDFDocument.create();
  const pixelHashes = [];
  for (const page of pages) {
    const { png } = await composeTransparentPage({ page, background: project.background, watermarks: project.watermarks });
    pixelHashes.push(hash(await sharp(png).removeAlpha().raw().toBuffer()));
    const image = await baseline.embedPng(png);
    baseline.addPage([page.asset.widthPt, page.asset.heightPt]).drawImage(image, { x: 0, y: 0, width: page.asset.widthPt, height: page.asset.heightPt });
    console.log(`Baseline page ${page.id}/5`);
  }
  const baselineBytes = await baseline.save();
  await fs.writeFile(path.join(output, "baseline-1.1.0.pdf"), baselineBytes);
  const report = { fixture: "Synthetic five-page 150 x 210 mm score with textured paper and an image watermark", baselineBytes: baselineBytes.length, output, profiles: [] };
  for (const id of ["original", "quality", "distribution"]) {
    const result = await exportTransparentGroups({ jobId: id, project, outputDirectory: output, pdfExportProfile: id });
    assert.deepEqual(result.errors, []);
    const target = path.join(output, `${id}.pdf`);
    await fs.rename(result.results[0].outputPath, target);
    const bytes = await fs.readFile(target);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 5);
    const encodings = [];
    for (const [index, page] of pdf.getPages().entries()) {
      const objects = page.node.Resources().lookup(PDFName.of("XObject"), PDFDict);
      assert.equal(objects.keys().length, 1);
      const image = objects.lookup(objects.keys()[0]);
      assert(image instanceof PDFRawStream);
      assert.equal(image.dict.get(PDFName.of("SMask")), undefined);
      encodings.push(image.dict.get(PDFName.of("Filter")).toString());
      if (id === "original") assert.equal(hash(readLosslessImageRgb(image)), pixelHashes[index]);
    }
    const entry = { id, bytes: bytes.length, reductionPercent: Math.round((1 - bytes.length / baselineBytes.length) * 1000) / 10, encodings, exact600DpiPixels: id === "original" ? true : null };
    report.profiles.push(entry);
    console.log(JSON.stringify(entry));
  }
  for (const source of sourceHashes) assert.equal(hash(await fs.readFile(source.path)), source.hash);
  assert(report.profiles[0].bytes < report.baselineBytes);
  assert(report.profiles[1].bytes < report.profiles[0].bytes);
  assert(report.profiles[2].bytes < report.profiles[1].bytes);
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(root, "tmp", "compression-qa", "latest.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
