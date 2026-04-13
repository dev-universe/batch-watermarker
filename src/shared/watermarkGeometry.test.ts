import { describe, expect, it } from "vitest";
import { getWatermarkBaseSize, resizeWatermarkBoxFromHandle } from "./watermarkGeometry";

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
