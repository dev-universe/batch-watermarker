import type { ProcessRequest, ProcessResponse } from "../src/shared/types";
import { processImageFile } from "./processImageFile";
import { processPdfFile } from "./processPdfFile";
import type { WatermarkAssetCache } from "./watermarkAssets";
import { resolveWatermarkLayers } from "./watermarkLayerAssets";

export const processWatermarkRequest = async (
  request: ProcessRequest
): Promise<ProcessResponse> => {
  const resolvedWatermarkLayers = await resolveWatermarkLayers(
    request.watermarkLayers.filter((layer) => layer.visible)
  );
  const watermarkAssetCache: WatermarkAssetCache = new Map();
  const results: ProcessResponse["results"] = [];
  const errors: string[] = [];

  for (const inputFile of request.inputFiles) {
    try {
      const outputPath =
        inputFile.kind === "pdf"
          ? await processPdfFile(inputFile, request, resolvedWatermarkLayers)
          : await processImageFile(
              inputFile,
              request,
              resolvedWatermarkLayers,
              watermarkAssetCache
            );
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
