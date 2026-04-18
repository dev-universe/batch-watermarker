import { promises as fs } from "node:fs";
import type { OutputWritePaths } from "./outputPlanning";

export const removeTemporaryOutput = async ({ finalOutputPath, writePath }: OutputWritePaths) => {
  if (writePath === finalOutputPath) {
    return;
  }

  await fs.rm(writePath, { force: true });
};

export const commitOutputWrite = async (paths: OutputWritePaths) => {
  const { finalOutputPath, writePath, shouldReplaceOriginal } = paths;

  if (!shouldReplaceOriginal) {
    return;
  }

  try {
    await fs.rename(writePath, finalOutputPath);
  } catch (error) {
    await removeTemporaryOutput(paths).catch(() => undefined);
    throw error;
  }
};

export const writeOutputSafely = async (paths: OutputWritePaths, writeOutput: () => Promise<void>) => {
  try {
    await writeOutput();
    await commitOutputWrite(paths);
  } catch (error) {
    await removeTemporaryOutput(paths).catch(() => undefined);
    throw error;
  }
};

export const writeOutputBufferSafely = async (paths: OutputWritePaths, data: Uint8Array) => {
  await writeOutputSafely(paths, () => fs.writeFile(paths.writePath, data));
};
