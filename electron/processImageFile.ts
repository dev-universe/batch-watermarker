import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import type { InputFile, ProcessRequest } from "../src/shared/types";
import { getWatermarkCenterPoint } from "../src/shared/watermarkGeometry";
import { getOutputWritePaths } from "./outputPlanning";
import {
  applyOpacityToWatermarkAsset,
  buildPositionedWatermarkLayer,
  getOrCreateWatermarkAsset,
  type WatermarkAssetCache
} from "./watermarkAssets";

export const processImageFile = async (
  inputFile: InputFile,
  watermarkBuffer: Buffer,
  request: ProcessRequest,
  watermarkMetadata: sharp.Metadata,
  watermarkAssetCache: WatermarkAssetCache
) => {
  const { settings } = request;
  const { finalOutputPath, writePath, shouldReplaceOriginal } = getOutputWritePaths(
    inputFile.path,
    settings
  );
  const image = sharp(inputFile.path, { failOn: "none" });
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`Unable to read image dimensions: ${inputFile.name}`);
  }

  if (!watermarkMetadata.width || !watermarkMetadata.height) {
    throw new Error("Unable to read watermark dimensions.");
  }

  const anchorCenter = getWatermarkCenterPoint(
    settings,
    metadata.width,
    metadata.height
  );
  const { rotatedWatermarkBuffer, drawWidth, drawHeight } = await getOrCreateWatermarkAsset(
    watermarkAssetCache,
    watermarkBuffer,
    metadata.width,
    metadata.height,
    watermarkMetadata.width,
    watermarkMetadata.height,
    settings,
    settings.rotation
  );
  const watermarkBufferWithOpacity = await applyOpacityToWatermarkAsset(
    rotatedWatermarkBuffer,
    settings.opacity / 100
  );
  const topLeftX = Math.round(anchorCenter.x - drawWidth / 2);
  const topLeftY = Math.round(anchorCenter.y - drawHeight / 2);
  const watermarkLayer = await buildPositionedWatermarkLayer(
    watermarkBufferWithOpacity,
    metadata.width,
    metadata.height,
    topLeftX,
    topLeftY
  );

  const density = metadata.density;
  const composite =
    watermarkLayer.length > 0
      ? sharp(inputFile.path, { density, failOn: "none" }).composite([{ input: watermarkLayer, blend: "over" }])
      : sharp(inputFile.path, { density, failOn: "none" });

  const ext = path.extname(inputFile.path).toLowerCase();
  if (ext === ".png") {
    await composite.png().withMetadata({ density }).toFile(writePath);
  } else if (ext === ".webp") {
    await composite.webp().withMetadata({ density }).toFile(writePath);
  } else if (ext === ".tif" || ext === ".tiff") {
    await composite.tiff().withMetadata({ density }).toFile(writePath);
  } else {
    await composite.jpeg({ quality: 95 }).withMetadata({ density }).toFile(writePath);
  }

  if (shouldReplaceOriginal) {
    await fs.rm(finalOutputPath, { force: true });
    await fs.rename(writePath, finalOutputPath);
  }

  return finalOutputPath;
};
