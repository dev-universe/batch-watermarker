import { promises as fs } from "node:fs";
import sharp from "sharp";
import type { WatermarkLayer } from "../src/shared/types";
import { getPdfWatermarkEmbedSource } from "./watermarkAssets";

export interface ResolvedWatermarkLayer extends WatermarkLayer {
  watermarkBuffer: Buffer;
  watermarkMetadata: sharp.Metadata;
  pdfEmbedSource: Awaited<ReturnType<typeof getPdfWatermarkEmbedSource>>;
}

export const resolveWatermarkLayers = async (
  layers: WatermarkLayer[]
): Promise<ResolvedWatermarkLayer[]> => {
  return Promise.all(
    layers.map(async (layer) => {
      const watermarkBuffer = await fs.readFile(layer.file.path);
      const watermarkMetadata = await sharp(watermarkBuffer).metadata();
      const pdfEmbedSource = await getPdfWatermarkEmbedSource(layer.file.path, watermarkBuffer);

      return {
        ...layer,
        watermarkBuffer,
        watermarkMetadata,
        pdfEmbedSource
      };
    })
  );
};
