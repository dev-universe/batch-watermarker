import { getWatermarkCenterPoint } from "../shared/watermarkGeometry";
import type { EditableStateSnapshot } from "../shared/history";
import type { WatermarkSettings } from "../shared/types";

interface InteractionActivity {
  hasDrag: boolean;
  hasResize: boolean;
  hasRotate: boolean;
}

export const canClearWatermarkSelection = (
  isWatermarkSelected: boolean,
  interactionActivity: InteractionActivity
) =>
  isWatermarkSelected &&
  !interactionActivity.hasDrag &&
  !interactionActivity.hasResize &&
  !interactionActivity.hasRotate;

export const getKeyboardNudgeStep = (shiftKey: boolean) => (shiftKey ? 10 : 1);

export const getKeyboardNudgeSnapshot = (
  snapshot: EditableStateSnapshot,
  canvasWidth: number,
  canvasHeight: number,
  key: string,
  shiftKey: boolean
) => {
  const currentCenter = getWatermarkCenterPoint(snapshot.settings, canvasWidth, canvasHeight);
  const step = getKeyboardNudgeStep(shiftKey);
  const normalizedKey = key.toLowerCase();
  const nextCenter = {
    x:
      normalizedKey === "arrowleft"
        ? Math.max(0, currentCenter.x - step)
        : normalizedKey === "arrowright"
          ? Math.min(canvasWidth, currentCenter.x + step)
          : currentCenter.x,
    y:
      normalizedKey === "arrowup"
        ? Math.max(0, currentCenter.y - step)
        : normalizedKey === "arrowdown"
          ? Math.min(canvasHeight, currentCenter.y + step)
          : currentCenter.y
  };

  return {
    ...snapshot,
    settings: {
      ...snapshot.settings,
      placementMode: "free" as WatermarkSettings["placementMode"],
      position: null,
      freeCenterXRatio: nextCenter.x / canvasWidth,
      freeCenterYRatio: nextCenter.y / canvasHeight
    }
  };
};
