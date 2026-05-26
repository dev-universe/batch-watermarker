import path from "node:path";
import sharp from "sharp";
import type { WatermarkSettings } from "../src/shared/types";
import { getWatermarkMetrics } from "../src/shared/watermarkGeometry";

export interface WatermarkAsset {
  rotatedWatermarkBuffer: Buffer;
  drawWidth: number;
  drawHeight: number;
}

export type WatermarkAssetCache = Map<string, WatermarkAsset>;

export const getPdfWatermarkEmbedSource = async (
  watermarkPath: string,
  watermarkBuffer: Buffer
) => {
  const ext = path.extname(watermarkPath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return {
      kind: "jpg" as const,
      bytes: watermarkBuffer
    };
  }

  if (ext === ".png") {
    return {
      kind: "png" as const,
      bytes: watermarkBuffer
    };
  }

  return {
    kind: "png" as const,
    bytes: await sharp(watermarkBuffer).png().toBuffer()
  };
};

const getWatermarkAssetCacheKey = (
  sourceKey: string,
  canvasWidth: number,
  canvasHeight: number,
  settings: Pick<WatermarkSettings, "placementMode" | "freeWidthRatio" | "freeHeightRatio" | "sizeRatio">,
  rotation: number
) =>
  `${sourceKey}:${canvasWidth}x${canvasHeight}:${settings.placementMode}:${settings.sizeRatio}:${settings.freeWidthRatio ?? "null"}:${settings.freeHeightRatio ?? "null"}:${rotation}`;

const buildWatermarkAsset = async (
  watermarkBuffer: Buffer,
  canvasWidth: number,
  canvasHeight: number,
  watermarkWidth: number,
  watermarkHeight: number,
  settings: Pick<WatermarkSettings, "placementMode" | "freeWidthRatio" | "freeHeightRatio" | "sizeRatio">,
  rotation: number
): Promise<WatermarkAsset> => {
  const oversampleFactor = 1;
  const metrics = getWatermarkMetrics(
    watermarkWidth,
    watermarkHeight,
    settings,
    canvasWidth,
    canvasHeight,
    rotation
  );
  const rotatedWatermarkBuffer = await sharp(watermarkBuffer)
    .resize({
      width: Math.max(1, Math.round(metrics.base.width * oversampleFactor)),
      height: Math.max(1, Math.round(metrics.base.height * oversampleFactor)),
      fit: "fill",
      kernel: sharp.kernel.lanczos3
    })
    .rotate(rotation, {
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0
      }
    })
    .png()
    .toBuffer();

  return {
    rotatedWatermarkBuffer,
    drawWidth: metrics.rotated.width,
    drawHeight: metrics.rotated.height
  };
};

export const getOrCreateWatermarkAsset = async (
  cache: WatermarkAssetCache,
  watermarkBuffer: Buffer,
  sourceKey: string,
  canvasWidth: number,
  canvasHeight: number,
  watermarkWidth: number,
  watermarkHeight: number,
  settings: Pick<WatermarkSettings, "placementMode" | "freeWidthRatio" | "freeHeightRatio" | "sizeRatio">,
  rotation: number
) => {
  const cacheKey = getWatermarkAssetCacheKey(sourceKey, canvasWidth, canvasHeight, settings, rotation);
  const cachedAsset = cache.get(cacheKey);
  if (cachedAsset) {
    return cachedAsset;
  }

  const asset = await buildWatermarkAsset(
    watermarkBuffer,
    canvasWidth,
    canvasHeight,
    watermarkWidth,
    watermarkHeight,
    settings,
    rotation
  );
  cache.set(cacheKey, asset);
  return asset;
};

export const applyOpacityToWatermarkAsset = async (
  watermarkBuffer: Buffer,
  opacity: number
) => {
  const alphaMultiplier = Math.max(0, Math.min(1, opacity));
  if (alphaMultiplier === 1) {
    return watermarkBuffer;
  }

  return sharp(watermarkBuffer)
    .ensureAlpha()
    .linear([1, 1, 1, alphaMultiplier], [0, 0, 0, 0])
    .png()
    .toBuffer();
};

export const buildPositionedWatermarkLayer = async (
  watermarkBuffer: Buffer,
  canvasWidth: number,
  canvasHeight: number,
  left: number,
  top: number
) => {
  const metadata = await sharp(watermarkBuffer).metadata();
  const watermarkWidth = metadata.width ?? 0;
  const watermarkHeight = metadata.height ?? 0;
  if (!watermarkWidth || !watermarkHeight || !canvasWidth || !canvasHeight) {
    return Buffer.alloc(0);
  }

  const clippedLeft = Math.max(0, left);
  const clippedTop = Math.max(0, top);
  const extractLeft = Math.max(0, -left);
  const extractTop = Math.max(0, -top);
  const clippedWidth = Math.min(watermarkWidth - extractLeft, canvasWidth - clippedLeft);
  const clippedHeight = Math.min(watermarkHeight - extractTop, canvasHeight - clippedTop);

  if (clippedWidth <= 0 || clippedHeight <= 0) {
    return Buffer.alloc(0);
  }

  const clippedWatermark = await sharp(watermarkBuffer)
    .extract({
      left: extractLeft,
      top: extractTop,
      width: clippedWidth,
      height: clippedHeight
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0
      }
    }
  })
    .composite([
      {
        input: clippedWatermark,
        left: clippedLeft,
        top: clippedTop
      }
    ])
    .png()
    .toBuffer();
};
