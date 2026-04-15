import type { WatermarkSettings } from "./types";
import { shouldOverwriteOriginals } from "./outputPaths";

export const getOutputSummary = (settings: Pick<WatermarkSettings, "suffix" | "outputDirectory">) => {
  if (shouldOverwriteOriginals(settings)) {
    return "출력 폴더와 접미사가 모두 비어 있으면 원본 파일에 직접 덮어씁니다.";
  }

  return settings.outputDirectory || "출력 폴더를 비워두면 원본 파일과 같은 폴더에 저장합니다.";
};
