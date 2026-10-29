import sharp from "sharp";
import type { CompositionRequest, ImageAsset } from "../src/shared/transparentImageTypes";
import { getWatermarkBaseSize, getWatermarkCenterPoint } from "../src/shared/watermarkGeometry";
import { applyOpacityToWatermarkAsset } from "./watermarkAssets";
import { checkImageDimensions, rasterAsset } from "./transparentImageAssets";

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

// Clip overlays before compositing; Sharp requires overlays to fit the canvas.
export async function clippedOverlay(input: Buffer, canvasWidth: number, canvasHeight: number, centerX: number, centerY: number): Promise<sharp.OverlayOptions | null> {
  const metadata = await sharp(input).metadata();
  const left = Math.round(centerX - metadata.width! / 2);
  const top = Math.round(centerY - metadata.height! / 2);
  const extractLeft = Math.max(0, -left), extractTop = Math.max(0, -top);
  const width = Math.min(metadata.width! - extractLeft, canvasWidth - Math.max(0, left));
  const height = Math.min(metadata.height! - extractTop, canvasHeight - Math.max(0, top));
  if (width <= 0 || height <= 0) return null;
  return { input: await sharp(input).extract({ left: extractLeft, top: extractTop, width, height }).png().toBuffer(),
    left: Math.max(0, left), top: Math.max(0, top), blend: "over" };
}

async function rotatedAsset(asset: ImageAsset, width: number, height: number, rotation: number) {
  if (![width, height, rotation].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error("이미지 배치 값이 올바르지 않습니다.");
  const radians = rotation * Math.PI / 180;
  checkImageDimensions(Math.max(1, Math.ceil(Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)))),
    Math.max(1, Math.ceil(Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians)))));
  return sharp(await rasterAsset(asset, width, height)).rotate(rotation, { background: transparent }).png().toBuffer();
}

export async function composeTransparentPage(request: CompositionRequest, options: { dpi?: number; maxEdge?: number } = {}) {
  const { page, background, watermarks } = request;
  if (![page.asset.widthPt, page.asset.heightPt].every(n => Number.isFinite(n) && n > 0)) throw new Error("페이지 크기가 올바르지 않습니다.");
  const scale = options.maxEdge ? options.maxEdge / Math.max(page.asset.widthPt, page.asset.heightPt) : (options.dpi ?? 600) / 72;
  const width = Math.max(1, Math.ceil(page.asset.widthPt * scale - 1e-7));
  const height = Math.max(1, Math.ceil(page.asset.heightPt * scale - 1e-7));
  checkImageDimensions(width, height);
  const overlays: sharp.OverlayOptions[] = [];
  if (background) overlays.push({ input: await rasterAsset(background.asset, width, height, background.fit), left: 0, top: 0 });
  const transform = page.transform;
  if (![transform.scale, transform.rotation, transform.offsetXRatio, transform.offsetYRatio, transform.marginMm].every(Number.isFinite) || transform.scale <= 0 || transform.marginMm < 0) {
    throw new Error("페이지 편집 값이 올바르지 않습니다.");
  }
  const marginX = transform.marginMm * 72 / 25.4 / page.asset.widthPt * width;
  const marginY = transform.marginMm * 72 / 25.4 / page.asset.heightPt * height;
  if (marginX * 2 >= width || marginY * 2 >= height) throw new Error("여백이 페이지 크기보다 큽니다.");
  const sourceScale = Math.min((width - marginX * 2) / page.asset.widthPx, (height - marginY * 2) / page.asset.heightPx) * transform.scale;
  const source = await rotatedAsset(page.asset, page.asset.widthPx * sourceScale, page.asset.heightPx * sourceScale, transform.rotation);
  const sourceOverlay = await clippedOverlay(source, width, height, width * (0.5 + transform.offsetXRatio), height * (0.5 + transform.offsetYRatio));
  if (sourceOverlay) overlays.push(sourceOverlay);
  for (const layer of watermarks) {
    if (!layer.visible || layer.settings.opacity === 0) continue;
    if (!Number.isFinite(layer.settings.opacity) || layer.settings.opacity < 0 || layer.settings.opacity > 100) throw new Error("워터마크 투명도가 올바르지 않습니다.");
    const size = getWatermarkBaseSize(layer.settings, layer.asset.widthPx, layer.asset.heightPx, width, height);
    const center = getWatermarkCenterPoint(layer.settings, width, height);
    if (![center.x, center.y].every(Number.isFinite)) throw new Error("워터마크 위치가 올바르지 않습니다.");
    const image = await rotatedAsset(layer.asset, size.width, size.height, layer.settings.rotation);
    const overlay = await clippedOverlay(await applyOpacityToWatermarkAsset(image, layer.settings.opacity / 100), width, height, center.x, center.y);
    if (overlay) overlays.push(overlay);
  }
  // Start opaque so alpha is flattened after every over operation, with no PDF SMask.
  const png = await sharp({ create: { width, height, channels: 3, background: "white" } })
    .composite(overlays).removeAlpha().png({ compressionLevel: 6 }).toBuffer();
  return { png, width, height };
}
