import type { DragEvent } from "react";
import type { EditableStateSnapshot } from "../shared/history";
import type { InputFile } from "../shared/types";
import {
  getCanvasLongestEdge,
  getLongestEdge,
  getLongestEdgeRatio
} from "../shared/watermarkSizing";
import {
  createObjectUrlFromPreview,
  readImageNaturalSize
} from "./previewStateHelpers";

interface UseFileSelectionActionsOptions {
  previewCoordinateSize: {
    width: number;
    height: number;
  };
  commitSnapshot: (updater: (current: EditableStateSnapshot) => EditableStateSnapshot) => void;
}

const uniqueByPath = (files: InputFile[]) => {
  const map = new Map<string, InputFile>();
  for (const file of files) {
    map.set(file.path, file);
  }
  return [...map.values()];
};

const collectDroppedPaths = async (event: DragEvent<HTMLElement>) => {
  event.preventDefault();
  return Array.from(event.dataTransfer.files)
    .map((file) => window.watermarkApi.getPathForFile(file))
    .filter(Boolean);
};

export function useFileSelectionActions({
  previewCoordinateSize,
  commitSnapshot
}: UseFileSelectionActionsOptions) {
  const addInputFiles = async (incoming: InputFile[]) => {
    if (!incoming.length) {
      return;
    }

    commitSnapshot((current) => {
      const nextInputFiles = uniqueByPath([...current.inputFiles, ...incoming]);
      return {
        ...current,
        inputFiles: nextInputFiles,
        selectedPreviewPath: current.selectedPreviewPath || incoming[0]?.path || ""
      };
    });
  };

  const selectWatermarkFile = async (file: InputFile) => {
    const previewPayload = await window.watermarkApi.readPreview(file.path);
    const objectUrl = createObjectUrlFromPreview(previewPayload);

    try {
      const naturalSize = await readImageNaturalSize(objectUrl);
      const longestEdgePx = getLongestEdge(naturalSize.width, naturalSize.height);
      const canvasLongestEdge =
        getCanvasLongestEdge(previewCoordinateSize.width, previewCoordinateSize.height) || longestEdgePx;
      const sizeRatio = getLongestEdgeRatio(longestEdgePx, canvasLongestEdge, canvasLongestEdge);

      commitSnapshot((current) => ({
        ...current,
        watermarkFile: file,
        settings: {
          ...current.settings,
          opacity: 50,
          sizeRatio,
          placementMode: "preset",
          position: "C",
          freeCenterXRatio: null,
          freeCenterYRatio: null,
          freeWidthRatio: null,
          freeHeightRatio: null
        }
      }));
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const onDropInputFiles = async (event: DragEvent<HTMLElement>) => {
    const paths = await collectDroppedPaths(event);
    const normalized = await window.watermarkApi.normalizeDroppedFiles(paths);
    await addInputFiles(normalized);
  };

  const onDropWatermarkFile = async (event: DragEvent<HTMLElement>) => {
    const paths = await collectDroppedPaths(event);
    const normalized = await window.watermarkApi.normalizeDroppedFiles(paths);
    const imageFile = normalized.find((file) => file.kind === "image") ?? null;
    if (!imageFile) {
      return;
    }

    await selectWatermarkFile(imageFile);
  };

  const openInputPicker = async () => {
    const files = await window.watermarkApi.pickInputFiles();
    await addInputFiles(files);
  };

  const openWatermarkPicker = async () => {
    const file = await window.watermarkApi.pickWatermarkFile();
    if (file?.kind === "image") {
      await selectWatermarkFile(file);
    }
  };

  const removeInputFile = (pathToRemove: string) => {
    commitSnapshot((current) => {
      const nextInputFiles = current.inputFiles.filter((file) => file.path !== pathToRemove);
      const nextSelectedPreviewPath =
        current.selectedPreviewPath === pathToRemove
          ? nextInputFiles[0]?.path ?? ""
          : current.selectedPreviewPath;

      return {
        ...current,
        inputFiles: nextInputFiles,
        selectedPreviewPath: nextSelectedPreviewPath
      };
    });
  };

  const selectPreviewFile = (path: string) => {
    commitSnapshot((current) => ({
      ...current,
      selectedPreviewPath: path
    }));
  };

  return {
    openInputPicker,
    onDropInputFiles,
    openWatermarkPicker,
    onDropWatermarkFile,
    removeInputFile,
    selectPreviewFile
  };
}
