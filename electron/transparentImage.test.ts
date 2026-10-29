import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { readLosslessImageRgb } from "./testUtils/pdfImagePixels";
import { importImages, inspectImage, normalizeSvg } from "./transparentImageAssets";
import { composeTransparentPage } from "./transparentImageComposition";
import { commitNewPdf, exportTransparentGroups, sanitizeGroupFilename } from "./transparentImageExport";
import { DEFAULT_IMAGE_WATERMARK_SETTINGS, DEFAULT_PAGE_TRANSFORM } from "../src/shared/transparentImageState";
import type { CompositionRequest, ImageAsset, TransparentPage, TransparentProject, TransparentWatermark } from "../src/shared/transparentImageTypes";

let directory: string;
let source: ImageAsset, red: ImageAsset, blue: ImageAsset;
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "transparent-image-test-"));
  const svgPath = path.join(directory, "sheet.svg");
  await fs.writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="0.5in" viewBox="0 0 96 48"><rect x="0" y="0" width="24" height="12" fill="black"/></svg>');
  source = await inspectImage(svgPath);
  for (const color of ["red", "blue"]) await sharp({ create: { width: 16, height: 16, channels: 4, background: color } }).png().toFile(path.join(directory, `${color}.png`));
  red = await inspectImage(path.join(directory, "red.png"));
  blue = await inspectImage(path.join(directory, "blue.png"));
});
afterAll(async () => { await fs.rm(directory, { recursive: true, force: true }); });
const page = (asset = source, id = "page"): TransparentPage => ({ id, asset, transform: { ...DEFAULT_PAGE_TRANSFORM } });
const watermark = (asset: ImageAsset, opacity = 100): TransparentWatermark => ({ id: asset.name, label: asset.name, asset, locked: false, visible: true,
  settings: { ...DEFAULT_IMAGE_WATERMARK_SETTINGS, opacity, placementMode: "free", position: null, freeCenterXRatio: 0.75, freeCenterYRatio: 0.75, freeWidthRatio: 0.25, freeHeightRatio: 0.25 } });
async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return Array.from(data.subarray(offset, offset + 3));
}

describe("SVG dimensions and imports", () => {
  it.each([['width="25.4mm" height="2.54cm"'], ['width="1in" height="72pt"'], ['width="6pc" height="96px"'], ['width="96" height="96"'], ['viewBox="0 0 96 96"'], ['width="96" viewBox="0 0 96 96"']])("resolves CSS units independently of librsvg defaults: %s", dimensions => {
    const svg = normalizeSvg(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${dimensions}/>`));
    expect(svg.width).toBeCloseTo(96); expect(svg.height).toBeCloseTo(96);
  });
  it("retains physical SVG size and falls back to 96 PPI for raster images", () => {
    expect(source.widthPt).toBeCloseTo(72); expect(source.heightPt).toBeCloseTo(36);
    expect(red.widthPt).toBe(12);
  });
  it("uses raster density and EXIF orientation", async () => {
    const file = path.join(directory, "rotated.jpg");
    await sharp({ create: { width: 40, height: 20, channels: 3, background: "white" } }).jpeg().withMetadata({ density: 200, orientation: 6 }).toFile(file);
    const asset = await inspectImage(file);
    expect(asset.widthPx).toBe(20); expect(asset.heightPx).toBe(40);
    expect(asset.widthPt).toBeCloseTo(7.2);
  });
  it("reports bad files without losing valid imports", async () => {
    const malformed = path.join(directory, "bad.svg"); await fs.writeFile(malformed, '<svg width="20" height="20"><path></svg>');
    const result = await importImages([source.path, malformed, path.join(directory, "missing.svg")]);
    expect(result.assets).toEqual([source]); expect(result.errors).toHaveLength(2);
  });
  it("rejects external references and indeterminate viewports", () => {
    for (const body of ['<svg/>', '<svg width="20" height="20"><image href="file:///secret.png"/></svg>', '<!DOCTYPE svg><svg width="20" height="20"/>']) expect(() => normalizeSvg(Buffer.from(body))).toThrow();
  });
});

describe("composition", () => {
  it("keeps SVG transparency and applies every watermark in list order", async () => {
    const { png, width, height } = await composeTransparentPage({ page: page(), background: { asset: blue, fit: "cover" }, watermarks: [watermark(red), watermark(blue, 50)] }, { dpi: 96 });
    expect([width, height]).toEqual([96, 48]);
    expect(await pixel(png, 3, 3)).toEqual([0, 0, 0]);
    expect(await pixel(png, 40, 20)).toEqual([0, 0, 255]);
    const blended = await pixel(png, 72, 36);
    expect(blended[0]).toBeGreaterThanOrEqual(126); expect(blended[0]).toBeLessThanOrEqual(128);
    expect(blended[1]).toBe(0); expect(blended[2]).toBeGreaterThanOrEqual(127);
    expect((await sharp(png).metadata()).hasAlpha).toBe(false);
  });
  it("supports no background/watermark and correctly distinguishes contain from cover", async () => {
    const base: CompositionRequest = { page: page(), background: null, watermarks: [] };
    expect(await pixel((await composeTransparentPage(base, { dpi: 96 })).png, 95, 47)).toEqual([255, 255, 255]);
    const contain = await composeTransparentPage({ ...base, background: { asset: blue, fit: "contain" } }, { dpi: 96 });
    expect(await pixel(contain.png, 95, 47)).toEqual([255, 255, 255]);
    expect(await pixel(contain.png, 48, 24)).toEqual([0, 0, 255]);
  });
  it("clips rotated layers at page edges and ignores hidden layers", async () => {
    const layer = watermark(red); layer.settings.freeCenterXRatio = 0; layer.settings.rotation = 45;
    const hidden = { ...watermark(blue), visible: false };
    const output = await composeTransparentPage({ page: page(), background: null, watermarks: [layer, hidden] }, { dpi: 96 });
    expect(await pixel(output.png, 1, 36)).toEqual([255, 0, 0]);
    expect(await pixel(output.png, 72, 36)).toEqual([255, 255, 255]);
  });
  it("applies page margin, offset, scale, and rotation", async () => {
    const transformed = { ...page(), transform: { scale: 0.5, rotation: 180, marginMm: 0, offsetXRatio: 0.25, offsetYRatio: 0 } };
    const { png } = await composeTransparentPage({ page: transformed, background: null, watermarks: [] }, { dpi: 96 });
    expect(await pixel(png, 93, 33)).toEqual([0, 0, 0]);
    expect(await pixel(png, 3, 3)).toEqual([255, 255, 255]);
    await expect(composeTransparentPage({ page: { ...page(), transform: { ...DEFAULT_PAGE_TRANSFORM, marginMm: 200 } }, background: null, watermarks: [] })).rejects.toThrow("여백");
  });
  it("rejects oversized 600 DPI pages before allocating a render", async () => {
    const large = page({ ...source, widthPt: 72000, heightPt: 72000 });
    await expect(composeTransparentPage({ page: large, background: null, watermarks: [] })).rejects.toThrow("한도");
  });
});

describe("group PDF export", () => {
  it("exports one PDF per group with ordered 600 DPI images and original page sizes", async () => {
    const original = await fs.readFile(source.path);
    const project: TransparentProject = { groups: [
      { id: "a", name: "악보/그룹", pages: [page(), page(red, "red")] },
      { id: "b", name: "악보/그룹", pages: [page()], backgroundOverride: null, watermarkOverride: [] }
    ], background: { asset: blue, fit: "cover" }, watermarks: [watermark(red)] };
    const progress: number[] = [];
    const result = await exportTransparentGroups({ jobId: "test", project, outputDirectory: directory }, event => progress.push(event.completedPages));
    expect(result.errors).toEqual([]); expect(result.results).toHaveLength(2);
    expect(result.results.map(item => path.basename(item.outputPath))).toEqual(["악보_그룹.pdf", "악보_그룹 (2).pdf"]);
    expect(progress[progress.length - 1]).toBe(3);
    const pdf = await PDFDocument.load(await fs.readFile(result.results[0].outputPath));
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPages().map(item => item.getSize())).toEqual([{ width: 72, height: 36 }, { width: 12, height: 12 }]);
    for (const [index, outputPage] of pdf.getPages().entries()) {
      const resources = outputPage.node.Resources()!;
      expect(resources.lookupMaybe(PDFName.of("Font"), PDFDict)?.keys() ?? []).toHaveLength(0);
      const images = resources.lookup(PDFName.of("XObject"), PDFDict);
      expect(images.keys()).toHaveLength(1);
      const image = images.lookup(images.keys()[0]);
      if (!(image instanceof PDFRawStream)) throw new Error("Expected an image stream");
      expect(image.dict.get(PDFName.of("Subtype"))).toEqual(PDFName.of("Image"));
      expect(image.dict.get(PDFName.of("Filter"))).toEqual(PDFName.of("FlateDecode"));
      expect(image.dict.get(PDFName.of("SMask"))).toBeUndefined();
      expect(image.dict.get(PDFName.of("Width"))?.toString()).toBe(index === 0 ? "600" : "100");
      expect(image.dict.get(PDFName.of("Height"))?.toString()).toBe(index === 0 ? "300" : "100");
      if (!index) {
        const { png } = await composeTransparentPage({ page: page(), background: project.background, watermarks: project.watermarks });
        const expected = await sharp(png).removeAlpha().raw().toBuffer();
        expect(readLosslessImageRgb(image)).toEqual(expected);
      }
    }
    expect(await fs.readFile(source.path)).toEqual(original);
    expect((await fs.readdir(directory)).filter(name => name.endsWith(".tmp"))).toEqual([]);
    const second = await PDFDocument.load(await fs.readFile(result.results[1].outputPath));
    expect(second.getPageCount()).toBe(1);
  }, 30000);
  it("does not leave a partial group when a page fails, and continues other groups", async () => {
    const project: TransparentProject = { groups: [
      { id: "bad", name: "failed", pages: [page(), page({ ...source, path: path.join(directory, "missing.svg") })] },
      { id: "good", name: "valid", pages: [page()] }
    ], background: null, watermarks: [] };
    const result = await exportTransparentGroups({ jobId: "fail", project, outputDirectory: directory });
    expect(result.results.map(item => item.groupId)).toEqual(["good"]);
    expect(result.errors).toHaveLength(1);
    await expect(fs.access(path.join(directory, "failed.pdf"))).rejects.toThrow();
    expect((await fs.readdir(directory)).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });
  it("never overwrites existing output, even when two exports commit at once", async () => {
    const temp = path.join(directory, "complete.tmp"); await fs.writeFile(temp, "complete");
    const original = path.join(directory, "collision.pdf"); await fs.writeFile(original, "original");
    const outputs = await Promise.all([commitNewPdf(temp, directory, "collision"), commitNewPdf(temp, directory, "collision")]);
    expect(new Set(outputs).size).toBe(2);
    expect(await fs.readFile(original, "utf8")).toBe("original");
    await fs.rm(temp);
    expect(sanitizeGroupFilename("CON")).toBe("_CON");
    expect(sanitizeGroupFilename(" ... ")).toBe("그룹");
  });
  it("skips empty groups and rejects an entirely empty project", async () => {
    const empty = { id: "empty", name: "empty", pages: [] };
    const project: TransparentProject = { groups: [empty, { id: "nonempty", name: "nonempty", pages: [page()] }], background: null, watermarks: [] };
    const result = await exportTransparentGroups({ jobId: "empty", project, outputDirectory: directory });
    expect(result.errors).toEqual([]); expect(result.results).toHaveLength(1);
    await expect(exportTransparentGroups({ jobId: "empty", project: { ...project, groups: [empty] }, outputDirectory: directory })).rejects.toThrow("입력 이미지");
  });
  it.each([["quality", 450, 225], ["distribution", 300, 150]] as const)("exports %s with the chosen DPI without changing page size", async (profile, width, height) => {
    const project: TransparentProject = { groups: [{ id: profile, name: profile, pages: [page()] }], background: null, watermarks: [] };
    const result = await exportTransparentGroups({ jobId: profile, project, outputDirectory: directory, pdfExportProfile: profile });
    expect(result.errors).toEqual([]);
    const pdf = await PDFDocument.load(await fs.readFile(result.results[0].outputPath));
    expect(pdf.getPage(0).getSize()).toEqual({ width: 72, height: 36 });
    const objects = pdf.getPage(0).node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
    const image = objects.lookup(objects.keys()[0]);
    if (!(image instanceof PDFRawStream)) throw new Error("Expected image");
    expect(image.dict.get(PDFName.of("Width"))?.toString()).toBe(String(width));
    expect(image.dict.get(PDFName.of("Height"))?.toString()).toBe(String(height));
    expect(image.dict.get(PDFName.of("SMask"))).toBeUndefined();
  });
});
