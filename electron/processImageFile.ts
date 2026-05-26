import path from "node:path";
import sharp from "sharp";
import type { InputFile, ProcessRequest } from "../src/shared/types";
import { getWatermarkCenterPoint } from "../src/shared/watermarkGeometry";
import { writeOutputSafely } from "./outputFileWrites";
import { getOutputWritePaths } from "./outputPlanning";
import {
  applyOpacityToWatermarkAsset,
  buildPositionedWatermarkLayer,
  getOrCreateWatermarkAsset,
  type WatermarkAssetCache
} from "./watermarkAssets";
import type { ResolvedWatermarkLayer } from "./watermarkLayerAssets";

export const processImageFile = async (
  inputFile: InputFile,
  request: ProcessRequest,
  resolvedWatermarkLayers: ResolvedWatermarkLayer[],
  watermarkAssetCache: WatermarkAssetCache
) => {
  const { settings } = request;
  const outputPaths = getOutputWritePaths(inputFile.path, settings);
  const { finalOutputPath, writePath } = outputPaths;
  const image = sharp(inputFile.path, { failOn: "none" });
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`Unable to read image dimensions: ${inputFile.name}`);
  }
  const watermarkLayers = await Promise.all(
    resolvedWatermarkLayers.map(async (layer) => {
      if (!layer.watermarkMetadata.width || !layer.watermarkMetadata.height) {
        throw new Error(`Unable to read watermark dimensions: ${layer.file.name}`);
      }

      const anchorCenter = getWatermarkCenterPoint(layer.settings, metadata.width, metadata.height);
      const { rotatedWatermarkBuffer, drawWidth, drawHeight } = await getOrCreateWatermarkAsset(
        watermarkAssetCache,
        layer.watermarkBuffer,
        layer.file.path,
        metadata.width,
        metadata.height,
        layer.watermarkMetadata.width,
        layer.watermarkMetadata.height,
        layer.settings,
        layer.settings.rotation
      );
      const watermarkBufferWithOpacity = await applyOpacityToWatermarkAsset(
        rotatedWatermarkBuffer,
        layer.settings.opacity / 100
      );
      const topLeftX = Math.round(anchorCenter.x - drawWidth / 2);
      const topLeftY = Math.round(anchorCenter.y - drawHeight / 2);
      return buildPositionedWatermarkLayer(
        watermarkBufferWithOpacity,
        metadata.width,
        metadata.height,
        topLeftX,
        topLeftY
      );
    })
  );

  const density = metadata.density;
  const composite =
    watermarkLayers.some((layer) => layer.length > 0)
      ? sharp(inputFile.path, { density, failOn: "none" }).composite(
          watermarkLayers
            .filter((layer) => layer.length > 0)
            .map((layer) => ({ input: layer, blend: "over" }))
        )
      : sharp(inputFile.path, { density, failOn: "none" });

  await writeOutputSafely(outputPaths, async () => {
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
  });

  return finalOutputPath;
};
