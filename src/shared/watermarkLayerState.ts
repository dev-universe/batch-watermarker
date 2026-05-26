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

export const canEditActiveWatermarkLayer = (activeLayerState: ActiveWatermarkLayerState) =>
  Boolean(activeLayerState.activeWatermarkLayerId && !activeLayerState.locked);

export const getWatermarkLayerStatusLabels = ({
  isActive,
  locked,
  visible
}: {
  isActive: boolean;
  locked: boolean;
  visible: boolean;
}) => {
  const labels: string[] = [];

  if (isActive) {
    labels.push("활성");
  }

  if (locked) {
    labels.push("잠금");
  }

  if (!visible) {
    labels.push("숨김");
  }

  return labels;
};
