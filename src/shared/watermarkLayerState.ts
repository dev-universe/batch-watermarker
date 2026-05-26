import type { EditableStateSnapshot } from "./history";
import type { InputFile, WatermarkSettings } from "./types";

export interface ActiveWatermarkLayerState {
  watermarkFile: InputFile | null;
  settings: WatermarkSettings;
  activeWatermarkLayerId: string | null;
  locked: boolean;
}

export const getActiveWatermarkLayerState = (
  snapshot: EditableStateSnapshot,
  fallbackSettings: WatermarkSettings
): ActiveWatermarkLayerState => {
  const activeLayer = snapshot.activeWatermarkLayerId
    ? snapshot.watermarkLayers.find((layer) => layer.id === snapshot.activeWatermarkLayerId) ?? null
    : null;

  if (!activeLayer) {
    return {
      watermarkFile: null,
      settings: { ...fallbackSettings },
      activeWatermarkLayerId: null,
      locked: false
    };
  }

  return {
    watermarkFile: activeLayer.file,
    settings: { ...activeLayer.settings },
    activeWatermarkLayerId: activeLayer.id,
    locked: activeLayer.locked
  };
};
