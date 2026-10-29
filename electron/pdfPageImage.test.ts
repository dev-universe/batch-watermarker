import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import sharp from "sharp";
import { getPdfExportProfile, type PdfExportProfileId } from "../src/shared/pdfExportProfiles";
import { drawPageImage, encodePageImage } from "./pdfPageImage";
import { readLosslessImageRgb } from "./testUtils/pdfImagePixels";

function gradient(width: number, height: number, textured = false) {
  const rgb = Buffer.alloc(width * height * 3);
  let seed = 12345;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = textured ? ((seed >>> 24) - 128) / 4 : 0;
    const offset = (y * width + x) * 3;
    rgb[offset] = Math.max(0, Math.min(255, 40 + x / width * 170 + noise));
    rgb[offset + 1] = Math.max(0, Math.min(255, 40 + y / height * 170 + noise));
    rgb[offset + 2] = Math.max(0, Math.min(255, 40 + (x + y) / (width + height) * 170 + noise));
  }
  return rgb;
}

const imageStream = (pdf: PDFDocument) => {
  const objects = pdf.getPage(0).node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
  expect(objects.keys()).toHaveLength(1);
  const image = objects.lookup(objects.keys()[0]);
  if (!(image instanceof PDFRawStream)) throw new Error("Expected image stream");
  return image;
};

describe("PDF page image encoding", () => {
  it("defaults to original and rejects unknown profile IDs instead of changing quality silently", async () => {
    expect(getPdfExportProfile().dpi).toBe(600);
    expect(getPdfExportProfile("quality").jpegQuality).toBe(95);
    expect(getPdfExportProfile("distribution").dpi).toBe(300);
    expect(() => getPdfExportProfile("invalid" as PdfExportProfileId)).toThrow("저장 옵션");
  });
  it("preserves exact RGB pixels and improves on the previous PDF encoder", async () => {
    const rgb = gradient(400, 600);
    const png = await sharp(rgb, { raw: { width: 400, height: 600, channels: 3 } }).png().toBuffer();
    const previous = await PDFDocument.create();
    previous.addPage([72, 108]).drawImage(await previous.embedPng(png), { x: 0, y: 0, width: 72, height: 108 });
    const previousBytes = await previous.save();
    const pdf = await PDFDocument.create();
    const encoded = await drawPageImage(pdf, pdf.addPage([72, 108]), png);
    const bytes = await pdf.save();
    const reopened = await PDFDocument.load(bytes);
    const image = imageStream(reopened);
    expect(encoded.pngPredictor).toBe(true);
    expect(readLosslessImageRgb(image)).toEqual(rgb);
    expect(bytes.length).toBeLessThan(previousBytes.length * 0.6);
    expect(image.dict.get(PDFName.of("SMask"))).toBeUndefined();
    expect(reopened.getPage(0).getSize()).toEqual({ width: 72, height: 108 });
  });
  it.each(["original", "quality", "distribution"] as const)("keeps flat-colour images lossless in %s", async profile => {
    const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: "white" } }).png().toBuffer();
    const encoded = await encodePageImage(png, profile);
    expect(encoded.filter).toBe("FlateDecode");
  });
  it.each(["quality", "distribution"] as const)("uses smaller JPEG for textured colour in %s", async profile => {
    const width = 512, height = 512, rgb = gradient(width, height, true);
    const png = await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const lossless = await encodePageImage(png, "original");
    const encoded = await encodePageImage(png, profile);
    expect(encoded.filter).toBe("DCTDecode");
    expect(encoded.bytes.length).toBeLessThan(lossless.bytes.length);
    const metadata = await sharp(encoded.bytes).metadata();
    expect([metadata.width, metadata.height]).toEqual([width, height]);
    expect(metadata.chromaSubsampling).toBe("4:4:4");
    const pdf = await PDFDocument.create();
    await drawPageImage(pdf, pdf.addPage([72, 72]), png, profile);
    const output = await PDFDocument.load(await pdf.save());
    expect(imageStream(output).dict.get(PDFName.of("Filter"))).toEqual(PDFName.of("DCTDecode"));
    expect(imageStream(output).dict.get(PDFName.of("SMask"))).toBeUndefined();
  });
  it("renders PNG predictors correctly in PDF.js with no colour or orientation changes", async () => {
    const width = 160, height = 240, rgb = gradient(width, height);
    const png = await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const pdf = await PDFDocument.create();
    const encoded = await drawPageImage(pdf, pdf.addPage([width, height]), png);
    expect(encoded.pngPredictor).toBe(true);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(await pdf.save()), isEvalSupported: false });
    try {
      const output = await task.promise;
      const page = await output.getPage(1);
      const canvas = createCanvas(width, height);
      try {
        await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport: page.getViewport({ scale: 1 }) }).promise;
        expect(await sharp(await canvas.encode("png")).removeAlpha().raw().toBuffer()).toEqual(rgb);
      } finally { canvas.width = canvas.height = 1; }
    } finally { await task.destroy(); }
  });
});
