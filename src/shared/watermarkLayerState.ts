import type { EditableStateSnapshot } from "./history";
import type { InputFile, WatermarkSettings } from "./types";

export interface ActiveWatermarkLayerState {
  watermarkFile: InputFile | null;
  settings: WatermarkSettings;
  activeWatermarkLayerId: string | null;
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
      activeWatermarkLayerId: null
    };
  }

  return {
    watermarkFile: activeLayer.file,
    settings: { ...activeLayer.settings },
    activeWatermarkLayerId: activeLayer.id
  };
};
