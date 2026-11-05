import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { ImageAsset, ImageImportResult } from "../src/shared/transparentImageTypes";

export const IMAGE_EXTENSIONS = ["svg", "png", "jpg", "jpeg", "webp", "tif", "tiff"];
export const MAX_IMAGE_PIXELS = 150_000_000;
export const MAX_IMAGE_DIMENSION = 32_767;

export function checkImageDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 ||
      width * height > MAX_IMAGE_PIXELS || Math.max(width, height) > MAX_IMAGE_DIMENSION) {
    throw new Error("이미지 크기가 처리 한도를 초과하거나 올바르지 않습니다. (최대 1억 5천만 픽셀 / 한 변 32767px)");
  }
}

const parseLength = (value: string | null): number | undefined => {
  const match = value?.trim().match(/^([+]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px|mm|cm|in|pt|pc)?$/i);
  if (!match) return undefined;
  const factor: Record<string, number> = { px: 1, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72, pc: 16 };
  const size = Number(match[1]) * factor[(match[2] || "px").toLowerCase()];
  return Number.isFinite(size) && size > 0 ? size : undefined;
};

export function normalizeSvg(bytes: Buffer) {
  const source = bytes.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("외부 문서 선언이 없는 SVG로 저장해 주세요.");
  const document = new DOMParser({ errorHandler: {
    warning: () => { throw new Error("SVG 문법이 올바르지 않습니다."); },
    error: () => { throw new Error("SVG 문법이 올바르지 않습니다."); },
    fatalError: () => { throw new Error("SVG 문법이 올바르지 않습니다."); }
  } }).parseFromString(source, "image/svg+xml");
  const root = document.documentElement;
  if (!root || root.localName !== "svg") throw new Error("올바른 SVG 이미지가 아닙니다.");
  // Native raster previews never insert source SVG markup into the renderer DOM.
  for (const element of Array.from(root.getElementsByTagName("*"))) {
    if (["script", "foreignObject"].includes(element.localName)) throw new Error("스크립트가 없는 SVG로 저장해 주세요.");
    for (const attribute of Array.from(element.attributes)) {
      if (/^(?:xlink:)?href$/i.test(attribute.name) && !/^(#|data:image\/)/i.test(attribute.value)) {
        throw new Error("외부 참조 이미지를 SVG 안에 포함한 뒤 다시 불러와 주세요.");
      }
    }
  }
  if (/@import|url\(\s*["']?\s*(?:https?:|file:|\/\/)/i.test(source)) throw new Error("외부 스타일을 포함한 SVG는 지원하지 않습니다.");
  const viewBox = (root.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const hasViewBox = viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0;
  let width = parseLength(root.getAttribute("width"));
  let height = parseLength(root.getAttribute("height"));
  if (hasViewBox) {
    if (!width && !height) { width = viewBox[2]; height = viewBox[3]; }
    else if (!width && height) width = height * viewBox[2] / viewBox[3];
    else if (!height && width) height = width * viewBox[3] / viewBox[2];
  }
  if (!width || !height) throw new Error("SVG에 유효한 width/height 또는 viewBox가 필요합니다.");
  // Canonical CSS-pixel viewport: librsvg's physical-unit defaults otherwise differ.
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  return { width, height, bytes: Buffer.from(new XMLSerializer().serializeToString(document)) };
}

export async function inspectImage(filePath: string): Promise<ImageAsset> {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) throw new Error("지원하지 않는 이미지 형식입니다.");
  let widthPx: number, heightPx: number, widthPt: number, heightPt: number;
  if (ext === "svg") {
    const svg = normalizeSvg(await fs.readFile(filePath));
    widthPx = svg.width; heightPx = svg.height;
    widthPt = widthPx * 72 / 96; heightPt = heightPx * 72 / 96;
    // Validate the actual SVG too, without allocating a full-sized render.
    await sharp(svg.bytes, { density: 72 }).metadata();
  } else {
    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height) throw new Error("이미지 크기를 읽을 수 없습니다.");
    const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
    widthPx = swapsAxes ? metadata.height : metadata.width;
    heightPx = swapsAxes ? metadata.width : metadata.height;
    const dpi = metadata.density && metadata.density > 0 ? metadata.density : 96;
    widthPt = widthPx * 72 / dpi; heightPt = heightPx * 72 / dpi;
  }
  if (![widthPx, heightPx, widthPt, heightPt].every(n => Number.isFinite(n) && n > 0)) throw new Error("이미지 크기가 올바르지 않습니다.");
  return { path: filePath, name: path.basename(filePath), widthPx, heightPx, widthPt, heightPt };
}

export async function importImages(paths: string[]): Promise<ImageImportResult> {
  const result: ImageImportResult = { assets: [], errors: [] };
  for (const filePath of [...new Set(paths)]) {
    try { result.assets.push(await inspectImage(filePath)); }
    catch (error) { result.errors.push(`${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return result;
}

export async function rasterAsset(asset: ImageAsset, width: number, height: number, fit: "cover" | "contain" | "fill" = "fill") {
  width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
  checkImageDimensions(width, height);
  let image: sharp.Sharp;
  if (path.extname(asset.path).toLowerCase() === ".svg") {
    const svg = normalizeSvg(await fs.readFile(asset.path));
    const density = Math.max(1, Math.min(100000, 72 * Math.max(width / svg.width, height / svg.height)));
    // Guard the intermediate SVG raster, including very wide/tall contain/cover inputs.
    checkImageDimensions(Math.max(1, Math.ceil(svg.width * density / 72)), Math.max(1, Math.ceil(svg.height * density / 72)));
    image = sharp(svg.bytes, { density, limitInputPixels: MAX_IMAGE_PIXELS });
  } else image = sharp(asset.path, { limitInputPixels: MAX_IMAGE_PIXELS }).autoOrient();
  return image.resize(width, height, { fit, background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().png().toBuffer();
}
