import { describe, expect, it } from "vitest";
import {
  createWatermarkOverlayImageStyle,
  createWatermarkOverlayRasterStyle,
  createWatermarkOverlayStyle
} from "./useWatermarkOverlayStyle";
import type { WatermarkSettings } from "../shared/types";

const settings: WatermarkSettings = {
  opacity: 35,
  sizeRatio: 0.25,
  preserveAspectRatio: true,
  rotation: 0,
  placementMode: "preset",
  position: "C",
  freeCenterXRatio: null,
  freeCenterYRatio: null,
  freeWidthRatio: null,
  freeHeightRatio: null,
  suffix: "_wm",
  outputDirectory: "",
  overwriteOriginal: false
};

const sizes = {
  watermarkNaturalSize: { width: 200, height: 100 },
  previewCoordinateSize: { width: 800, height: 600 },
  previewDisplaySize: { width: 400, height: 300 }
};

describe("watermark overlay styles", () => {
  it("applies opacity only to the watermark image, not the overlay controls", () => {
    const overlayStyle = createWatermarkOverlayStyle({
      settings,
      ...sizes
    });
    const imageStyle = createWatermarkOverlayImageStyle({
      settings,
      ...sizes
    });
    const rasterStyle = createWatermarkOverlayRasterStyle(settings);

    expect(overlayStyle).not.toHaveProperty("opacity");
    expect(imageStyle).not.toHaveProperty("opacity");
    expect(rasterStyle).toHaveProperty("opacity", 0.35);
  });
});
