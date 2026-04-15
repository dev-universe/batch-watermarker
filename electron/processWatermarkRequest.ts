import { promises as fs } from "node:fs";
import sharp from "sharp";
import type { ProcessRequest, ProcessResponse } from "../src/shared/types";
import { processImageFile } from "./processImageFile";
import { processPdfFile } from "./processPdfFile";
import type { WatermarkAssetCache } from "./watermarkAssets";

export const processWatermarkRequest = async (
  request: ProcessRequest
): Promise<ProcessResponse> => {
  const watermarkBuffer = await fs.readFile(request.watermarkPath);
  const watermarkMetadata = await sharp(watermarkBuffer).metadata();
  const watermarkAssetCache: WatermarkAssetCache = new Map();
  const results: ProcessResponse["results"] = [];
  const errors: string[] = [];

  for (const inputFile of request.inputFiles) {
    try {
      const outputPath =
        inputFile.kind === "pdf"
          ? await processPdfFile(inputFile, watermarkBuffer, request, watermarkMetadata)
          : await processImageFile(inputFile, watermarkBuffer, request, watermarkMetadata, watermarkAssetCache);
      results.push({
        sourcePath: inputFile.path,
        outputPath
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${inputFile.name}: ${message}`);
    }
  }

  return { results, errors };
};
