import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { WatermarkSettings } from "../src/shared/types";
import { resolveOutputPath } from "../src/shared/outputPaths";

export interface OutputWritePaths {
  finalOutputPath: string;
  writePath: string;
  shouldReplaceOriginal: boolean;
}

export const getTemporaryOutputPath = (targetPath: string) => {
  const parsed = path.parse(targetPath);
  return path.join(
    os.tmpdir(),
    `${parsed.name}-${Date.now()}-${Math.random().toString(36).slice(2)}${parsed.ext}`
  );
};

export const getOutputWritePaths = (
  sourcePath: string,
  settings: Pick<WatermarkSettings, "suffix" | "outputDirectory" | "overwriteOriginal">
): OutputWritePaths => {
  const finalOutputPath = resolveOutputPath(
    sourcePath,
    settings.suffix,
    settings.outputDirectory,
    settings.overwriteOriginal
  );
  const shouldReplaceOriginal = settings.overwriteOriginal;

  return {
    finalOutputPath,
    writePath: shouldReplaceOriginal ? getTemporaryOutputPath(finalOutputPath) : finalOutputPath,
    shouldReplaceOriginal
  };
};

export const getExistingPaths = async (incomingPaths: string[]) => {
  const uniquePaths = [...new Set(incomingPaths)];
  const existingPaths = await Promise.all(
    uniquePaths.map(async (filePath) => {
      try {
        await fs.access(filePath);
        return filePath;
      } catch {
        return null;
      }
    })
  );

  return existingPaths.filter(Boolean);
};
