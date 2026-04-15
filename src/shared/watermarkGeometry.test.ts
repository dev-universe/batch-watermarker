import { describe, expect, it } from "vitest";
import {
  getAngleFromPoint,
  getWatermarkBaseSize,
  isCornerResizeHandle,
  normalizeRotationDegrees,
  snapRotationDegrees,
  resizeRotatedWatermarkBoxFromHandle,
  resizeWatermarkBoxFromHandle
} from "./watermarkGeometry";

describe("getWatermarkBaseSize", () => {
  it("uses free width and height ratios when available", () => {
    expect(
      getWatermarkBaseSize(
        {
          placementMode: "free",
          freeWidthRatio: 0.3,
          freeHeightRatio: 0.2,
          sizeRatio: 0.4
        },
        1200,
        600,
        1000,
        800
      )
    ).toEqual({
      width: 300,
      height: 160
    });
  });

  it("still uses free width and height ratios in preset placement mode", () => {
    expect(
      getWatermarkBaseSize(
        {
          placementMode: "preset",
          freeWidthRatio: 0.3,
          freeHeightRatio: 0.2,
          sizeRatio: 0.4
        },
        1200,
        600,
        1000,
        800
      )
    ).toEqual({
      width: 300,
      height: 160
    });
  });

  it("falls back to size ratio when free dimensions are unavailable", () => {
    expect(
      getWatermarkBaseSize(
        {
          placementMode: "free",
          freeWidthRatio: null,
          freeHeightRatio: null,
          sizeRatio: 0.5
        },
        1200,
        600,
        1000,
        800
      )
    ).toEqual({
      width: 500,
      height: 250
    });
  });
});

describe("resizeWatermarkBoxFromHandle", () => {
  it("resizes width from the east handle while keeping the west edge fixed", () => {
    expect(resizeWatermarkBoxFromHandle("e", 200, 150, 100, 80, 40, 0, 24, 24)).toEqual({
      centerX: 220,
      centerY: 150,
      width: 140,
      height: 80
    });
  });

  it("resizes both dimensions from a corner handle", () => {
    expect(resizeWatermarkBoxFromHandle("se", 200, 150, 100, 80, 40, 20, 24, 24)).toEqual({
      centerX: 220,
      centerY: 160,
      width: 140,
      height: 100
    });
  });
});

describe("resizeRotatedWatermarkBoxFromHandle", () => {
  it("keeps the opposite side fixed when resizing a rotated box from the west handle", () => {
    const resized = resizeRotatedWatermarkBoxFromHandle(
      "w",
      200,
      150,
      100,
      80,
      -40,
      0,
      45,
      false,
      2,
      24,
      24
    );

    expect(resized.centerX).toBeCloseTo(190, 6);
    expect(resized.centerY).toBeCloseTo(140, 6);
    expect(resized.width).toBeCloseTo(128.2842712474619, 6);
    expect(resized.height).toBeCloseTo(80, 6);
  });

  it("keeps the original aspect ratio for corner resize when locked", () => {
    const resized = resizeRotatedWatermarkBoxFromHandle(
      "ne",
      200,
      150,
      100,
      50,
      40,
      -10,
      0,
      true,
      2,
      24,
      24
    );

    expect(resized.width / resized.height).toBeCloseTo(2, 6);
  });

  it("does not apply aspect lock to edge handles", () => {
    const resized = resizeRotatedWatermarkBoxFromHandle(
      "e",
      200,
      150,
      100,
      50,
      40,
      20,
      0,
      true,
      2,
      24,
      24
    );

    expect(resized.width / resized.height).not.toBeCloseTo(2, 6);
  });
});

describe("isCornerResizeHandle", () => {
  it("identifies corner handles only", () => {
    expect(isCornerResizeHandle("nw")).toBe(true);
    expect(isCornerResizeHandle("e")).toBe(false);
  });
});

describe("getAngleFromPoint", () => {
  it("returns 0 degrees on the positive x axis", () => {
    expect(getAngleFromPoint(100, 100, 140, 100)).toBe(0);
  });

  it("returns 90 degrees on the positive y axis", () => {
    expect(getAngleFromPoint(100, 100, 100, 140)).toBe(90);
  });
});

describe("normalizeRotationDegrees", () => {
  it("normalizes negative degrees into the 0-360 range", () => {
    expect(normalizeRotationDegrees(-44)).toBe(316);
  });

  it("normalizes degrees larger than 360", () => {
    expect(normalizeRotationDegrees(721)).toBe(1);
  });
});

describe("snapRotationDegrees", () => {
  it("snaps to the nearest step", () => {
    expect(snapRotationDegrees(22, 15)).toBe(15);
    expect(snapRotationDegrees(23, 15)).toBe(30);
  });

  it("normalizes snapped values into the 0-360 range", () => {
    expect(snapRotationDegrees(359, 15)).toBe(0);
  });

  it("falls back to normalized rotation for invalid snap steps", () => {
    expect(snapRotationDegrees(-44, 0)).toBe(316);
    expect(snapRotationDegrees(721, Number.NaN)).toBe(1);
  });
});
