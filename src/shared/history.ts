import type { InputFile, WatermarkLayer, WatermarkSettings } from "./types";

export interface EditableStateSnapshot {
  inputFiles: InputFile[];
  watermarkFile: InputFile | null;
  settings: WatermarkSettings;
  watermarkLayers: WatermarkLayer[];
  activeWatermarkLayerId: string | null;
  selectedPreviewPath: string;
}

export interface HistoryState {
  past: EditableStateSnapshot[];
  future: EditableStateSnapshot[];
}

const areInputFilesEqual = (left: InputFile[], right: InputFile[]) =>
  left.length === right.length &&
  left.every(
    (file, index) =>
      file.path === right[index]?.path &&
      file.name === right[index]?.name &&
      file.kind === right[index]?.kind
  );

const areSettingsEqual = (left: WatermarkSettings, right: WatermarkSettings) =>
  left.opacity === right.opacity &&
  left.sizeRatio === right.sizeRatio &&
  left.preserveAspectRatio === right.preserveAspectRatio &&
  left.rotation === right.rotation &&
  left.placementMode === right.placementMode &&
  left.position === right.position &&
  left.freeCenterXRatio === right.freeCenterXRatio &&
  left.freeCenterYRatio === right.freeCenterYRatio &&
  left.freeWidthRatio === right.freeWidthRatio &&
  left.freeHeightRatio === right.freeHeightRatio &&
  left.suffix === right.suffix &&
  left.outputDirectory === right.outputDirectory &&
  left.overwriteOriginal === right.overwriteOriginal;

const areBytesEqual = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const arePreviewPayloadsEqual = (left: WatermarkLayer["previewPayload"], right: WatermarkLayer["previewPayload"]) =>
  left.kind === right.kind &&
  left.mimeType === right.mimeType &&
  left.name === right.name &&
  areBytesEqual(left.data, right.data);

const areWatermarkLayersEqual = (left: WatermarkLayer[], right: WatermarkLayer[]) =>
  left.length === right.length &&
  left.every((layer, index) => {
    const other = right[index];
    return (
      layer.id === other?.id &&
      layer.file.path === other?.file.path &&
      layer.file.name === other?.file.name &&
      layer.file.kind === other?.file.kind &&
      layer.label === other.label &&
      layer.locked === other.locked &&
      areSettingsEqual(layer.settings, other.settings) &&
      layer.visible === other.visible &&
      arePreviewPayloadsEqual(layer.previewPayload, other.previewPayload) &&
      layer.naturalSize.width === other.naturalSize.width &&
      layer.naturalSize.height === other.naturalSize.height
    );
  });

export const cloneSnapshot = (snapshot: EditableStateSnapshot): EditableStateSnapshot => ({
  inputFiles: [...snapshot.inputFiles],
  watermarkFile: snapshot.watermarkFile,
  settings: { ...snapshot.settings },
  watermarkLayers: snapshot.watermarkLayers.map((layer) => ({
    id: layer.id,
    file: { ...layer.file },
    label: layer.label,
    locked: layer.locked,
    settings: { ...layer.settings },
    visible: layer.visible,
    previewPayload: {
      ...layer.previewPayload,
      data: new Uint8Array(layer.previewPayload.data)
    },
    naturalSize: { ...layer.naturalSize }
  })),
  activeWatermarkLayerId: snapshot.activeWatermarkLayerId,
  selectedPreviewPath: snapshot.selectedPreviewPath
});

export const areSnapshotsEqual = (left: EditableStateSnapshot, right: EditableStateSnapshot) =>
  areInputFilesEqual(left.inputFiles, right.inputFiles) &&
  ((left.watermarkFile === null && right.watermarkFile === null) ||
    (left.watermarkFile?.path === right.watermarkFile?.path &&
      left.watermarkFile?.name === right.watermarkFile?.name &&
      left.watermarkFile?.kind === right.watermarkFile?.kind)) &&
  areSettingsEqual(left.settings, right.settings) &&
  areWatermarkLayersEqual(left.watermarkLayers, right.watermarkLayers) &&
  left.activeWatermarkLayerId === right.activeWatermarkLayerId &&
  left.selectedPreviewPath === right.selectedPreviewPath;

export const createEmptyHistoryState = (): HistoryState => ({
  past: [],
  future: []
});

export const pushHistorySnapshot = (
  history: HistoryState,
  snapshot: EditableStateSnapshot,
  limit = 100
) => {
  history.past.push(cloneSnapshot(snapshot));
  if (history.past.length > limit) {
    history.past.shift();
  }
  history.future = [];
};

export const applyUndo = (history: HistoryState, current: EditableStateSnapshot) => {
  const previous = history.past.pop();
  if (!previous) {
    return null;
  }

  history.future.unshift(cloneSnapshot(current));
  return cloneSnapshot(previous);
};

export const applyRedo = (history: HistoryState, current: EditableStateSnapshot) => {
  const next = history.future.shift();
  if (!next) {
    return null;
  }

  history.past.push(cloneSnapshot(current));
  return cloneSnapshot(next);
};

export const commitContinuousEdit = (
  history: HistoryState,
  beforeEdit: EditableStateSnapshot,
  afterEdit: EditableStateSnapshot,
  limit = 100
) => {
  if (areSnapshotsEqual(beforeEdit, afterEdit)) {
    return false;
  }

  pushHistorySnapshot(history, beforeEdit, limit);
  return true;
};
