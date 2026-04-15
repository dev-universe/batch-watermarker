import type { EditableStateSnapshot } from "../shared/history";
import type { AnchorPosition, WatermarkSettings } from "../shared/types";
import {
  getLongestEdge,
  getLongestEdgeRatio,
  getSizeFromLongestEdge,
  resizeBoxFromHeight,
  resizeBoxFromWidth,
  resizeFromWidthPreservingAspectRatio
} from "../shared/watermarkSizing";
import { getWatermarkCenterPoint } from "../shared/watermarkGeometry";

interface Size {
  width: number;
  height: number;
}

interface UseWatermarkSettingsActionsOptions {
  settings: WatermarkSettings;
  watermarkNaturalSize: Size;
  previewCoordinateSize: Size;
  renderedWatermarkSize: Size;
  sizeControlMax: number;
  commitSnapshot: (updater: (current: EditableStateSnapshot) => EditableStateSnapshot) => void;
  updateSettingsDuringContinuousEdit: (settingsPatch: Partial<WatermarkSettings>) => boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

export function useWatermarkSettingsActions({
  settings,
  watermarkNaturalSize,
  previewCoordinateSize,
  renderedWatermarkSize,
  sizeControlMax,
  commitSnapshot,
  updateSettingsDuringContinuousEdit
}: UseWatermarkSettingsActionsOptions) {
  const updateNumericSetting = (key: "opacity" | "sizePx" | "rotation", value: string) => {
    const max = key === "opacity" ? 100 : key === "rotation" ? 360 : sizeControlMax;
    const nextValue = clamp(Number(value), 0, max);
    const currentCenter = getWatermarkCenterPoint(
      settings,
      previewCoordinateSize.width,
      previewCoordinateSize.height
    );
    const nextSettingsPatch =
      key === "sizePx"
        ? (() => {
            if (!settings.preserveAspectRatio) {
              return null;
            }

            const currentWidth = renderedWatermarkSize.width;
            const currentHeight = renderedWatermarkSize.height;
            const currentLongestEdge = getLongestEdge(currentWidth, currentHeight);
            const scaleFactor = currentLongestEdge > 0 ? nextValue / currentLongestEdge : 0;
            const nextSize =
              currentLongestEdge > 0
                ? {
                    width: currentWidth * scaleFactor,
                    height: currentHeight * scaleFactor
                  }
                : getSizeFromLongestEdge(
                    watermarkNaturalSize.width,
                    watermarkNaturalSize.height,
                    nextValue
                  );

            return {
              sizeRatio: getLongestEdgeRatio(
                nextValue,
                previewCoordinateSize.width,
                previewCoordinateSize.height
              ),
              placementMode: "free" as const,
              position: null,
              freeCenterXRatio:
                previewCoordinateSize.width > 0 ? currentCenter.x / previewCoordinateSize.width : 0,
              freeCenterYRatio:
                previewCoordinateSize.height > 0
                  ? currentCenter.y / previewCoordinateSize.height
                  : 0,
              freeWidthRatio:
                previewCoordinateSize.width > 0 ? nextSize.width / previewCoordinateSize.width : 0,
              freeHeightRatio:
                previewCoordinateSize.height > 0 ? nextSize.height / previewCoordinateSize.height : 0
            };
          })()
        : { [key]: nextValue };

    if (!nextSettingsPatch) {
      return;
    }

    if (updateSettingsDuringContinuousEdit(nextSettingsPatch)) {
      return;
    }

    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...nextSettingsPatch
      }
    }));
  };

  const onWidthPxChange = (value: string) => {
    const nextWidth = clamp(Number(value), 0, sizeControlMax);
    const currentWidth = renderedWatermarkSize.width;
    const currentHeight = renderedWatermarkSize.height;
    const resized = resizeBoxFromWidth(
      currentWidth,
      currentHeight,
      nextWidth,
      settings.preserveAspectRatio
    );
    const currentCenter = getWatermarkCenterPoint(
      settings,
      previewCoordinateSize.width,
      previewCoordinateSize.height
    );

    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        sizeRatio: getLongestEdgeRatio(
          getLongestEdge(resized.width, resized.height),
          previewCoordinateSize.width,
          previewCoordinateSize.height
        ),
        placementMode: "free",
        position: null,
        freeCenterXRatio:
          previewCoordinateSize.width > 0 ? currentCenter.x / previewCoordinateSize.width : 0,
        freeCenterYRatio:
          previewCoordinateSize.height > 0 ? currentCenter.y / previewCoordinateSize.height : 0,
        freeWidthRatio:
          previewCoordinateSize.width > 0 ? resized.width / previewCoordinateSize.width : 0,
        freeHeightRatio:
          previewCoordinateSize.height > 0 ? resized.height / previewCoordinateSize.height : 0
      }
    }));
  };

  const onHeightPxChange = (value: string) => {
    const nextHeight = clamp(Number(value), 0, sizeControlMax);
    const currentWidth = renderedWatermarkSize.width;
    const currentHeight = renderedWatermarkSize.height;
    const resized = resizeBoxFromHeight(
      currentWidth,
      currentHeight,
      nextHeight,
      settings.preserveAspectRatio
    );
    const currentCenter = getWatermarkCenterPoint(
      settings,
      previewCoordinateSize.width,
      previewCoordinateSize.height
    );

    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        sizeRatio: getLongestEdgeRatio(
          getLongestEdge(resized.width, resized.height),
          previewCoordinateSize.width,
          previewCoordinateSize.height
        ),
        placementMode: "free",
        position: null,
        freeCenterXRatio:
          previewCoordinateSize.width > 0 ? currentCenter.x / previewCoordinateSize.width : 0,
        freeCenterYRatio:
          previewCoordinateSize.height > 0 ? currentCenter.y / previewCoordinateSize.height : 0,
        freeWidthRatio:
          previewCoordinateSize.width > 0 ? resized.width / previewCoordinateSize.width : 0,
        freeHeightRatio:
          previewCoordinateSize.height > 0 ? resized.height / previewCoordinateSize.height : 0
      }
    }));
  };

  const onTogglePreserveAspectRatio = (checked: boolean) => {
    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        preserveAspectRatio: checked
      }
    }));
  };

  const onResetOriginalAspectRatio = () => {
    commitSnapshot((current) => {
      const nextSizing = resizeFromWidthPreservingAspectRatio(
        watermarkNaturalSize.width,
        watermarkNaturalSize.height,
        renderedWatermarkSize.width
      );

      return {
        ...current,
        settings: {
          ...current.settings,
          sizeRatio: getLongestEdgeRatio(
            nextSizing.sizePx,
            previewCoordinateSize.width,
            previewCoordinateSize.height
          ),
          freeWidthRatio:
            previewCoordinateSize.width > 0 ? nextSizing.width / previewCoordinateSize.width : 0,
          freeHeightRatio:
            previewCoordinateSize.height > 0 ? nextSizing.height / previewCoordinateSize.height : 0
        }
      };
    });
  };

  const onSelectPosition = (position: AnchorPosition) => {
    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        placementMode: "preset",
        position,
        freeCenterXRatio: null,
        freeCenterYRatio: null
      }
    }));
  };

  return {
    updateNumericSetting,
    onWidthPxChange,
    onHeightPxChange,
    onTogglePreserveAspectRatio,
    onResetOriginalAspectRatio,
    onSelectPosition
  };
}
