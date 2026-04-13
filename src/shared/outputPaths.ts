import type { InputFile, WatermarkSettings } from "./types";

export interface PlannedOutput {
  sourcePath: string;
  outputPath: string;
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
