import type { DragEvent } from "react";
import type { EditableStateSnapshot } from "../shared/history";
import type { InputFile, WatermarkLayer, WatermarkSettings } from "../shared/types";
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

const createLayerId = () =>
  `watermark-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createWatermarkLayerSettings = (
  currentSettings: WatermarkSettings,
  previewCoordinateSize: UseFileSelectionActionsOptions["previewCoordinateSize"],
  naturalSize: { width: number; height: number }
) => {
  const longestEdgePx = getLongestEdge(naturalSize.width, naturalSize.height);
  const canvasLongestEdge =
    getCanvasLongestEdge(previewCoordinateSize.width, previewCoordinateSize.height) || longestEdgePx;
  const sizeRatio = getLongestEdgeRatio(longestEdgePx, canvasLongestEdge, canvasLongestEdge);

  return {
    ...currentSettings,
    opacity: 50,
    sizeRatio,
    placementMode: "preset" as const,
    position: "C" as const,
    freeCenterXRatio: null,
    freeCenterYRatio: null,
    freeWidthRatio: null,
    freeHeightRatio: null
  };
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
      const layerId = createLayerId();
      const layerSettings = createWatermarkLayerSettings(
        {
          opacity: 50,
          sizeRatio: 0,
          preserveAspectRatio: true,
          rotation: 0,
          placementMode: "preset",
          position: "C",
          freeCenterXRatio: null,
          freeCenterYRatio: null,
          freeWidthRatio: null,
          freeHeightRatio: null,
          suffix: "_wm",
          outputDirectory: "",
          overwriteOriginal: false
        },
        previewCoordinateSize,
        naturalSize
      );
      const watermarkLayer: WatermarkLayer = {
        id: layerId,
        file,
        label: file.name,
        settings: layerSettings,
        visible: true,
        previewPayload,
        naturalSize
      };

      commitSnapshot((current) => ({
        ...current,
        watermarkFile: file,
        settings: layerSettings,
        watermarkLayers: [...current.watermarkLayers, watermarkLayer],
        activeWatermarkLayerId: layerId
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
