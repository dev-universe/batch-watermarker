import { getAnchorCenterPoint } from "./watermarkGeometry";
import type { AnchorPosition } from "./types";

const SNAP_POSITIONS: AnchorPosition[] = ["NW", "N", "NE", "W", "C", "E", "SW", "S", "SE"];

export const getWatermarkSnapPoints = (canvasWidth: number, canvasHeight: number) =>
  SNAP_POSITIONS.map((position) => getAnchorCenterPoint(position, canvasWidth, canvasHeight));

export const snapWatermarkCenterPoint = (
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  threshold: number
) => {
  let snappedX = x;
  let snappedY = y;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const point of getWatermarkSnapPoints(canvasWidth, canvasHeight)) {
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance;
      snappedX = point.x;
      snappedY = point.y;
    }
  }

  return {
    x: snappedX,
    y: snappedY,
    snapped: Number.isFinite(bestDistance)
  };
};
