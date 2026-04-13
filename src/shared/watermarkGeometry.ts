import type { AnchorPosition, WatermarkSettings } from "./types";
import { getSizeFromLongestEdgeRatio } from "./watermarkSizing";

const fitWithin = (
  targetWidth: number,
  targetHeight: number,
  boxWidth: number,
  boxHeight: number
) => {
  const ratio = Math.min(boxWidth / targetWidth, boxHeight / targetHeight);
  return {
    width: targetWidth * ratio,
    height: targetHeight * ratio
  };
};

export const getRotatedBoundingBox = (width: number, height: number, rotationDegrees: number) => {
  const radians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos
  };
};

export const getWatermarkBaseSize = (
  settings: Pick<WatermarkSettings, "placementMode" | "freeWidthRatio" | "freeHeightRatio" | "sizeRatio">,
  watermarkWidth: number,
  watermarkHeight: number,
  canvasWidth: number,
  canvasHeight: number
) => {
  if (
    settings.placementMode === "free" &&
    settings.freeWidthRatio !== null &&
    settings.freeHeightRatio !== null
  ) {
    return {
      width: settings.freeWidthRatio * canvasWidth,
      height: settings.freeHeightRatio * canvasHeight
    };
  }

  return getSizeFromLongestEdgeRatio(
    watermarkWidth,
    watermarkHeight,
    settings.sizeRatio,
    canvasWidth,
    canvasHeight
  );
};

export const getWatermarkMetrics = (
  watermarkWidth: number,
  watermarkHeight: number,
  settings: Pick<WatermarkSettings, "placementMode" | "freeWidthRatio" | "freeHeightRatio" | "sizeRatio">,
  canvasWidth: number,
  canvasHeight: number,
  rotationDegrees: number
) => {
  const base = getWatermarkBaseSize(
    settings,
    watermarkWidth,
    watermarkHeight,
    canvasWidth,
    canvasHeight
  );
  const rotated = getRotatedBoundingBox(base.width, base.height, rotationDegrees);

  return {
    base: {
      width: base.width,
      height: base.height
    },
    rotated: {
      width: rotated.width,
      height: rotated.height
    }
  };
};

export const getAnchorCenterPoint = (
  position: AnchorPosition,
  canvasWidth: number,
  canvasHeight: number
) => {
  const west = canvasWidth / 6;
  const centerX = canvasWidth / 2;
  const east = (canvasWidth * 5) / 6;
  const north = canvasHeight / 6;
  const centerY = canvasHeight / 2;
  const south = (canvasHeight * 5) / 6;

  switch (position) {
    case "NW":
      return { x: west, y: north };
    case "N":
      return { x: centerX, y: north };
    case "NE":
      return { x: east, y: north };
    case "W":
      return { x: west, y: centerY };
    case "C":
      return { x: centerX, y: centerY };
    case "E":
      return { x: east, y: centerY };
    case "SW":
      return { x: west, y: south };
    case "S":
      return { x: centerX, y: south };
    case "SE":
      return { x: east, y: south };
  }
};

export const getWatermarkCenterPoint = (
  settings: Pick<WatermarkSettings, "placementMode" | "position" | "freeCenterXRatio" | "freeCenterYRatio">,
  canvasWidth: number,
  canvasHeight: number
) => {
  if (
    settings.placementMode === "free" &&
    settings.freeCenterXRatio !== null &&
    settings.freeCenterYRatio !== null
  ) {
    return {
      x: settings.freeCenterXRatio * canvasWidth,
      y: settings.freeCenterYRatio * canvasHeight
    };
  }

  return getAnchorCenterPoint(settings.position ?? "C", canvasWidth, canvasHeight);
};
