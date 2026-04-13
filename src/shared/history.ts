import type { InputFile, WatermarkSettings } from "./types";

export interface EditableStateSnapshot {
  inputFiles: InputFile[];
  watermarkFile: InputFile | null;
  settings: WatermarkSettings;
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

export const cloneSnapshot = (snapshot: EditableStateSnapshot): EditableStateSnapshot => ({
  inputFiles: [...snapshot.inputFiles],
  watermarkFile: snapshot.watermarkFile,
  settings: { ...snapshot.settings },
  selectedPreviewPath: snapshot.selectedPreviewPath
});

export const areSnapshotsEqual = (left: EditableStateSnapshot, right: EditableStateSnapshot) =>
  areInputFilesEqual(left.inputFiles, right.inputFiles) &&
  ((left.watermarkFile === null && right.watermarkFile === null) ||
    (left.watermarkFile?.path === right.watermarkFile?.path &&
      left.watermarkFile?.name === right.watermarkFile?.name &&
      left.watermarkFile?.kind === right.watermarkFile?.kind)) &&
  areSettingsEqual(left.settings, right.settings) &&
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
