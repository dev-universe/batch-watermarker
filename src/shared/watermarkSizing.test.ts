import { describe, expect, it } from "vitest";
import {
  getCanvasLongestEdge,
  getLongestEdge,
  getLongestEdgePxFromRatio,
  getLongestEdgeRatio,
  getSizeFromLongestEdge,
  getSizeFromLongestEdgeRatio,
  resizeBoxFromHeight,
  resizeBoxFromWidth,
  resizeFromHeightPreservingAspectRatio,
  resizeFromWidthPreservingAspectRatio
} from "./watermarkSizing";

describe("getSizeFromLongestEdge", () => {
  it("uses the width as the longest edge for landscape images", () => {
    expect(getSizeFromLongestEdge(1200, 600, 300)).toEqual({
      width: 300,
      height: 150
    });
  });

  it("uses the height as the longest edge for portrait images", () => {
    expect(getSizeFromLongestEdge(600, 1200, 300)).toEqual({
      width: 150,
      height: 300
    });
  });

  it("returns zeros for non-positive longest edge values", () => {
    expect(getSizeFromLongestEdge(1200, 600, 0)).toEqual({
      width: 0,
      height: 0
    });
  });
});

describe("getLongestEdge", () => {
  it("returns the larger of width and height", () => {
    expect(getLongestEdge(320, 180)).toBe(320);
    expect(getLongestEdge(180, 320)).toBe(320);
  });
});

describe("canvas-relative sizing helpers", () => {
  it("returns the canvas longest edge", () => {
    expect(getCanvasLongestEdge(596, 842)).toBe(842);
  });

  it("converts between longest-edge pixels and ratios", () => {
    expect(getLongestEdgeRatio(280, 596, 842)).toBeCloseTo(280 / 842);
    expect(getLongestEdgePxFromRatio(280 / 842, 2520, 3564)).toBeCloseTo((280 / 842) * 3564);
  });

  it("computes rendered size from a longest-edge ratio", () => {
    expect(getSizeFromLongestEdgeRatio(1200, 600, 280 / 842, 596, 842)).toEqual({
      width: 280,
      height: 140
    });
  });
});

describe("resizeFromWidthPreservingAspectRatio", () => {
  it("updates height and sizePx from a target width", () => {
    expect(resizeFromWidthPreservingAspectRatio(1200, 600, 300)).toEqual({
      width: 300,
      height: 150,
      sizePx: 300
    });
  });
});

describe("resizeFromHeightPreservingAspectRatio", () => {
  it("updates width and sizePx from a target height", () => {
    expect(resizeFromHeightPreservingAspectRatio(1200, 600, 300)).toEqual({
      width: 600,
      height: 300,
      sizePx: 600
    });
  });
});

describe("resizeBoxFromWidth", () => {
  it("preserves the current box ratio when enabled", () => {
    expect(resizeBoxFromWidth(153, 232, 200, true)).toEqual({
      width: 200,
      height: expect.closeTo(303.26797385620915, 10)
    });
  });

  it("changes width only when aspect-ratio preservation is disabled", () => {
    expect(resizeBoxFromWidth(153, 232, 200, false)).toEqual({
      width: 200,
      height: 232
    });
  });

  it("returns zeros for non-positive target widths", () => {
    expect(resizeBoxFromWidth(153, 232, 0, true)).toEqual({
      width: 0,
      height: 0
    });
  });
});

describe("resizeBoxFromHeight", () => {
  it("preserves the current box ratio when enabled", () => {
    expect(resizeBoxFromHeight(153, 232, 300, true)).toEqual({
      width: expect.closeTo(197.8448275862069, 10),
      height: 300
    });
  });

  it("changes height only when aspect-ratio preservation is disabled", () => {
    expect(resizeBoxFromHeight(153, 232, 300, false)).toEqual({
      width: 153,
      height: 300
    });
  });

  it("returns zeros for non-positive target heights", () => {
    expect(resizeBoxFromHeight(153, 232, 0, true)).toEqual({
      width: 0,
      height: 0
    });
  });
});
