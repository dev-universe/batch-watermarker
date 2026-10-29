// Run after npm run build:electron:
// node scripts/verify-raster-pdf.cjs input.pdf watermark.png output-directory
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createCanvas } = require("@napi-rs/canvas");
const sharp = require("sharp");
const { PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } = require("pdf-lib");
const { processWatermarkRequest } = require("../dist-electron/electron/processWatermarkRequest.js");
const { PDF_RASTER_DPI } = require("../dist-electron/electron/rasterizePdf.js");

const hash = (data) => createHash("sha256").update(data).digest("hex");
const file = (filePath, kind) => ({ path: path.resolve(filePath), name: path.basename(filePath), kind });

async function main() {
  const [inputPath, watermarkPath, outputDirectory] = process.argv.slice(2);
  assert(inputPath && watermarkPath && outputDirectory, "Supply input PDF, watermark image, and output directory");
  await fs.mkdir(outputDirectory, { recursive: true });
  const inputFile = file(inputPath, "pdf");
  const watermarkFile = file(watermarkPath, "image");
  const originalHash = hash(await fs.readFile(inputPath));
  const watermarkData = await fs.readFile(watermarkPath);
  const metadata = await sharp(watermarkData).metadata();
  const settings = {
    opacity: 7, sizeRatio: 0.8, preserveAspectRatio: true, rotation: 0,
    placementMode: "preset", position: "C", freeCenterXRatio: null,
    freeCenterYRatio: null, freeWidthRatio: null, freeHeightRatio: null,
    suffix: "_watermarked", outputDirectory: path.resolve(outputDirectory), overwriteOriginal: false
  };
  const request = {
    inputFiles: [inputFile], settings,
    watermarkLayers: [{
      id: "sample-watermark", file: watermarkFile, label: "Sample watermark",
      locked: false, visible: true, settings,
      previewPayload: { kind: "image", data: watermarkData, mimeType: "image/png", name: watermarkFile.name },
      naturalSize: { width: metadata.width, height: metadata.height }
    }]
  };
  const normal = await processWatermarkRequest(request);
  assert.deepEqual(normal.errors, []);
  const raster = await processWatermarkRequest({
    ...request, rasterizePdf: true, settings: { ...settings, suffix: "_watermarked_600dpi" }
  });
  assert.deepEqual(raster.errors, []);
  assert.equal(hash(await fs.readFile(inputPath)), originalHash, "Source PDF changed");
  const outputBytes = await fs.readFile(raster.results[0].outputPath);
  const output = await PDFDocument.load(outputBytes);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json")).replace(/\\/g, "/");
  const options = { standardFontDataUrl: `${pdfjsRoot}/standard_fonts/`, cMapUrl: `${pdfjsRoot}/cmaps/`, cMapPacked: true };
  const normalTask = getDocument({ ...options, data: new Uint8Array(await fs.readFile(normal.results[0].outputPath)) });
  const rasterTask = getDocument({ ...options, data: new Uint8Array(outputBytes) });
  try {
    const reference = await normalTask.promise;
    const result = await rasterTask.promise;
    assert.equal(result.numPages, reference.numPages);
    assert.equal(await result.getAttachments(), null);
    const pages = [];
    for (let index = 0; index < result.numPages; index++) {
      const referencePage = await reference.getPage(index + 1);
      const resultPage = await result.getPage(index + 1);
      assert.deepEqual(resultPage.view, referencePage.view);
      assert.equal((await resultPage.getTextContent()).items.length, 0);
      assert.equal((await resultPage.getAnnotations()).length, 0);
      const resources = output.getPage(index).node.Resources();
      assert.equal(resources.lookup(PDFName.of("Font"), PDFDict).keys().length, 0);
      const images = resources.lookup(PDFName.of("XObject"), PDFDict);
      assert.equal(images.keys().length, 1);
      const image = output.context.lookup(images.values()[0]);
      assert(image instanceof PDFRawStream);
      const viewport = referencePage.getViewport({ scale: PDF_RASTER_DPI / 72 });
      const canvas = createCanvas(Math.ceil(viewport.width - 1e-7), Math.ceil(viewport.height - 1e-7));
      try {
        await referencePage.render({ canvas, viewport, background: "rgb(255,255,255)" }).promise;
        const png = await canvas.encode("png");
        const expectedRgb = await sharp(png).removeAlpha().raw().toBuffer();
        const actualRgb = decodePDFRawStream(image).decode();
        assert.equal(hash(actualRgb), hash(expectedRgb), `Page ${index + 1} pixels differ`);
        await sharp(png).resize({ width: 1200 }).png().toFile(path.join(outputDirectory, `page-${index + 1}-preview.png`));
        pages.push({ page: index + 1, width: canvas.width, height: canvas.height, exactPixels: true,
          sourceTextItems: (await referencePage.getTextContent()).items.length, outputTextItems: 0 });
      } finally {
        canvas.width = canvas.height = 1;
        referencePage.cleanup();
      }
    }
    const report = { normal: normal.results[0].outputPath, raster: raster.results[0].outputPath,
      bytes: outputBytes.length, dpi: PDF_RASTER_DPI, sourceUnchanged: true, pages };
    await fs.writeFile(path.join(outputDirectory, "verification.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await normalTask.destroy();
    await rasterTask.destroy();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
