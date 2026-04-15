import { describe, expect, it } from "vitest";
import { getWatermarkSnapPoints, snapWatermarkCenterPoint } from "./watermarkSnap";

describe("getWatermarkSnapPoints", () => {
  it("returns the 3x3 anchor centers", () => {
    const points = getWatermarkSnapPoints(600, 300);

    expect(points).toHaveLength(9);
    expect(points[0]).toEqual({ x: 100, y: 50 });
    expect(points[4]).toEqual({ x: 300, y: 150 });
    expect(points[8]).toEqual({ x: 500, y: 250 });
  });
});

describe("snapWatermarkCenterPoint", () => {
  it("snaps to the nearest anchor point within the threshold", () => {
    expect(snapWatermarkCenterPoint(292, 156, 600, 300, 16)).toEqual({
      x: 300,
      y: 150,
      snapped: true
    });
  });

  it("returns the original point when nothing is within the threshold", () => {
    expect(snapWatermarkCenterPoint(292, 156, 600, 300, 4)).toEqual({
      x: 292,
      y: 156,
      snapped: false
    });
  });

  it("chooses the closest anchor point within the threshold", () => {
    expect(snapWatermarkCenterPoint(290, 148, 600, 300, 110)).toEqual({
      x: 300,
      y: 150,
      snapped: true
    });
  });
});
