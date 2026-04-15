import { useState } from "react";
import type { InputFile, ProcessResponse, WatermarkSettings } from "../shared/types";
import { collectPlannedOutputConflicts, collectPlannedOutputs } from "../shared/outputPaths";

interface UseProcessingStateOptions {
  inputFiles: InputFile[];
  watermarkFile: InputFile | null;
  settings: WatermarkSettings;
}

const humanCount = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const formatConflictConfirmMessage = (conflicts: string[]) => {
  const previewLines = conflicts.slice(0, 6).map((conflict) => `- ${conflict}`);
  const remainingCount = conflicts.length - previewLines.length;
  const suffix =
    remainingCount > 0 ? `\n외 ${remainingCount}건이 더 있습니다.` : "";

  return [
    `출력 경로 충돌이 ${conflicts.length}건 발견되었습니다.`,
    "",
    ...previewLines,
    suffix,
    "",
    "기존 파일을 덮어쓰거나 다른 입력 파일과 경로가 충돌할 수 있습니다.",
    "계속 진행하시겠습니까?"
  ]
    .filter(Boolean)
    .join("\n");
};

export function useProcessingState({
  inputFiles,
  watermarkFile,
  settings
}: UseProcessingStateOptions) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("입력 파일과 워터마크를 넣으면 바로 처리할 수 있습니다.");
  const [lastResult, setLastResult] = useState<ProcessResponse | null>(null);

  const startProcessing = async () => {
    if (!inputFiles.length) {
      window.alert("입력 파일을 먼저 추가하세요.");
      return;
    }
    if (!watermarkFile) {
      window.alert("워터마크 이미지를 먼저 지정하세요.");
      return;
    }

    const overwriteOriginal = settings.suffix.trim() === "";
    if (overwriteOriginal) {
      const confirmed = window.confirm(
        "접미사가 비어 있어서 원본 파일에 그대로 덮어쓰게 됩니다. 계속하시겠습니까?"
      );
      if (!confirmed) {
        return;
      }
    }

    const plannedOutputs = collectPlannedOutputs(inputFiles, {
      suffix: settings.suffix,
      outputDirectory: settings.outputDirectory,
      overwriteOriginal
    });
    const existingOutputPaths = overwriteOriginal
      ? []
      : await window.watermarkApi.findExistingPaths(plannedOutputs.map((plannedOutput) => plannedOutput.outputPath));
    const pathConflicts = collectPlannedOutputConflicts(plannedOutputs, {
      existingPaths: existingOutputPaths,
      inputPaths: inputFiles.map((inputFile) => inputFile.path)
    });

    if (pathConflicts.length > 0) {
      const confirmed = window.confirm(formatConflictConfirmMessage(pathConflicts));
      if (!confirmed) {
        return;
      }
    }

    setIsProcessing(true);
    setStatusMessage("워터마크를 적용하는 중입니다.");

    try {
      const response = await window.watermarkApi.process({
        inputFiles,
        watermarkPath: watermarkFile.path,
        settings: {
          ...settings,
          suffix: settings.suffix,
          overwriteOriginal
        }
      });
      setLastResult(response);
      setStatusMessage(
        `완료: ${humanCount(response.results.length, "file")} processed, ${humanCount(
          response.errors.length,
          "error"
        )}`
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    isProcessing,
    statusMessage,
    lastResult,
    startProcessing
  };
}
