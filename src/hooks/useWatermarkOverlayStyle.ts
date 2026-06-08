import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { WatermarkSettings } from "../shared/types";
import {
  getWatermarkCenterPoint,
  getWatermarkMetrics
} from "../shared/watermarkGeometry";

interface Size {
  width: number;
  height: number;
}

interface UseWatermarkOverlayStyleOptions {
  settings: WatermarkSettings;
  watermarkNaturalSize: Size;
  previewCoordinateSize: Size;
  previewDisplaySize: Size;
}

export const createWatermarkOverlayStyle = ({
  settings,
  watermarkNaturalSize,
  previewCoordinateSize,
  previewDisplaySize
}: UseWatermarkOverlayStyleOptions): CSSProperties | undefined => {
  if (
    !previewDisplaySize.width ||
    !previewDisplaySize.height ||
    !previewCoordinateSize.width ||
    !previewCoordinateSize.height ||
    !watermarkNaturalSize.width ||
    !watermarkNaturalSize.height
  ) {
    return undefined;
  }

  const metrics = getWatermarkMetrics(
    watermarkNaturalSize.width,
    watermarkNaturalSize.height,
    settings,
    previewCoordinateSize.width,
    previewCoordinateSize.height,
    settings.rotation
  );
  const anchorCenter = getWatermarkCenterPoint(
    settings,
    previewCoordinateSize.width,
    previewCoordinateSize.height
  );
  const displayScaleX = previewDisplaySize.width / previewCoordinateSize.width;
  const displayScaleY = previewDisplaySize.height / previewCoordinateSize.height;

  return {
    width: `${metrics.rotated.width * displayScaleX}px`,
    height: `${metrics.rotated.height * displayScaleY}px`,
    left: `${(anchorCenter.x - metrics.rotated.width / 2) * displayScaleX}px`,
    top: `${(anchorCenter.y - metrics.rotated.height / 2) * displayScaleY}px`
  };
};

export const createWatermarkOverlayImageStyle = ({
  settings,
  watermarkNaturalSize,
  previewCoordinateSize,
  previewDisplaySize
}: UseWatermarkOverlayStyleOptions): CSSProperties | undefined => {
  if (
    !previewDisplaySize.width ||
    !previewDisplaySize.height ||
    !previewCoordinateSize.width ||
    !previewCoordinateSize.height ||
    !watermarkNaturalSize.width ||
    !watermarkNaturalSize.height
  ) {
    return undefined;
  }

  const metrics = getWatermarkMetrics(
    watermarkNaturalSize.width,
    watermarkNaturalSize.height,
    settings,
    previewCoordinateSize.width,
    previewCoordinateSize.height,
    settings.rotation
  );
  const displayScaleX = previewDisplaySize.width / previewCoordinateSize.width;
  const displayScaleY = previewDisplaySize.height / previewCoordinateSize.height;

  return {
    width: `${metrics.base.width * displayScaleX}px`,
    height: `${metrics.base.height * displayScaleY}px`,
    transform: `translate(-50%, -50%) rotate(${settings.rotation}deg)`,
    transformOrigin: "center center",
    left: "50%",
    top: "50%"
  };
};

export const createWatermarkOverlayRasterStyle = (
  settings: Pick<WatermarkSettings, "opacity">
): CSSProperties => ({
  opacity: settings.opacity / 100
});

export function useWatermarkOverlayStyle({
  settings,
  watermarkNaturalSize,
  previewCoordinateSize,
  previewDisplaySize
}: UseWatermarkOverlayStyleOptions) {
  const overlayStyle = useMemo<CSSProperties | undefined>(
    () =>
      createWatermarkOverlayStyle({
        settings,
        watermarkNaturalSize,
        previewCoordinateSize,
        previewDisplaySize
      }),
    [previewDisplaySize, previewCoordinateSize, settings, watermarkNaturalSize]
  );

  const overlayImageStyle = useMemo<CSSProperties | undefined>(
    () =>
      createWatermarkOverlayImageStyle({
        settings,
        watermarkNaturalSize,
        previewCoordinateSize,
        previewDisplaySize
      }),
    [previewCoordinateSize, previewDisplaySize, settings, watermarkNaturalSize]
  );

  return {
    overlayStyle,
    overlayImageStyle
  };
}
