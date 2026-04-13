import { describe, expect, it } from "vitest";
import { getLongestEdge, getSizeFromLongestEdge } from "./watermarkSizing";

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
