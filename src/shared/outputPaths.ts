import type { InputFile, WatermarkSettings } from "./types";

export interface PlannedOutput {
  sourcePath: string;
  outputPath: string;
}

export interface PlannedOutputConflictOptions {
  existingPaths?: string[];
  inputPaths?: string[];
}

const splitFilePath = (filePath: string) => {
  const separatorIndex = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const directory = separatorIndex >= 0 ? filePath.slice(0, separatorIndex) : "";
  const filename = separatorIndex >= 0 ? filePath.slice(separatorIndex + 1) : filePath;
  const extensionIndex = filename.lastIndexOf(".");

  if (extensionIndex <= 0) {
    return {
      directory,
      name: filename,
      extension: ""
    };
  }

  return {
    directory,
    name: filename.slice(0, extensionIndex),
    extension: filename.slice(extensionIndex)
  };
};

const joinFilePath = (directory: string, filename: string) => {
  if (!directory) {
    return filename;
  }

  const separator = directory.includes("\\") ? "\\" : "/";
  return `${directory}${separator}${filename}`;
};

export const resolveOutputPath = (
  sourcePath: string,
  suffix: string,
  outputDirectory: string,
  overwriteOriginal: boolean
) => {
  if (overwriteOriginal) {
    return sourcePath;
  }

  const parsed = splitFilePath(sourcePath);
  const targetDirectory = outputDirectory || parsed.directory;
  return joinFilePath(targetDirectory, `${parsed.name}${suffix}${parsed.extension}`);
};

export const collectPlannedOutputs = (
  inputFiles: InputFile[],
  settings: Pick<WatermarkSettings, "suffix" | "outputDirectory" | "overwriteOriginal">
): PlannedOutput[] =>
  inputFiles.map((inputFile) => ({
    sourcePath: inputFile.path,
    outputPath: resolveOutputPath(
      inputFile.path,
      settings.suffix,
      settings.outputDirectory,
      settings.overwriteOriginal
    )
  }));

export const collectPlannedOutputConflicts = (
  plannedOutputs: PlannedOutput[],
  options: PlannedOutputConflictOptions = {}
) => {
  const duplicateOutputPaths = new Set<string>();
  const outputPathCounts = new Map<string, number>();

  for (const plannedOutput of plannedOutputs) {
    const currentCount = outputPathCounts.get(plannedOutput.outputPath) ?? 0;
    outputPathCounts.set(plannedOutput.outputPath, currentCount + 1);
    if (currentCount >= 1) {
      duplicateOutputPaths.add(plannedOutput.outputPath);
    }
  }

  const inputPathSet = new Set(options.inputPaths ?? []);
  const conflictingInputPaths = plannedOutputs
    .filter(
      (plannedOutput) =>
        plannedOutput.outputPath !== plannedOutput.sourcePath && inputPathSet.has(plannedOutput.outputPath)
    )
    .map((plannedOutput) => plannedOutput.outputPath);

  return [...new Set([...duplicateOutputPaths, ...conflictingInputPaths, ...(options.existingPaths ?? [])])];
};
