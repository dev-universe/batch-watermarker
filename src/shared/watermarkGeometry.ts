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

export const getAngleFromPoint = (
  centerX: number,
  centerY: number,
  pointX: number,
  pointY: number
) => {
  const radians = Math.atan2(pointY - centerY, pointX - centerX);
  return (radians * 180) / Math.PI;
};

export const normalizeRotationDegrees = (rotationDegrees: number) => {
  const normalized = rotationDegrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
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

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const rotateVector = (x: number, y: number, rotationDegrees: number) => {
  const radians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos
  };
};

export const resizeWatermarkBoxFromHandle = (
  handle: ResizeHandle,
  startCenterX: number,
  startCenterY: number,
  startWidth: number,
  startHeight: number,
  deltaX: number,
  deltaY: number,
  minWidth: number,
  minHeight: number
) => {
  let left = startCenterX - startWidth / 2;
  let right = startCenterX + startWidth / 2;
  let top = startCenterY - startHeight / 2;
  let bottom = startCenterY + startHeight / 2;

  if (handle.includes("w")) {
    left = Math.min(left + deltaX, right - minWidth);
  }
  if (handle.includes("e")) {
    right = Math.max(right + deltaX, left + minWidth);
  }
  if (handle.includes("n")) {
    top = Math.min(top + deltaY, bottom - minHeight);
  }
  if (handle.includes("s")) {
    bottom = Math.max(bottom + deltaY, top + minHeight);
  }

  return {
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    width: right - left,
    height: bottom - top
  };
};

export const resizeRotatedWatermarkBoxFromHandle = (
  handle: ResizeHandle,
  startCenterX: number,
  startCenterY: number,
  startWidth: number,
  startHeight: number,
  deltaX: number,
  deltaY: number,
  rotationDegrees: number,
  minWidth: number,
  minHeight: number
) => {
  const localDelta = rotateVector(deltaX, deltaY, -rotationDegrees);
  const resizedLocalBox = resizeWatermarkBoxFromHandle(
    handle,
    0,
    0,
    startWidth,
    startHeight,
    localDelta.x,
    localDelta.y,
    minWidth,
    minHeight
  );
  const centerOffset = rotateVector(
    resizedLocalBox.centerX,
    resizedLocalBox.centerY,
    rotationDegrees
  );

  return {
    centerX: startCenterX + centerOffset.x,
    centerY: startCenterY + centerOffset.y,
    width: resizedLocalBox.width,
    height: resizedLocalBox.height
  };
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
