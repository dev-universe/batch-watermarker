import { describe, expect, it, vi } from "vitest";
import type { WatermarkLayer, WatermarkSettings } from "../shared/types";
import { reconcileWatermarkLayerPreviews } from "./previewStateHelpers";

const settings: WatermarkSettings = {
  opacity: 50,
  sizeRatio: 0.3,
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

const makeLayer = (overrides: Partial<WatermarkLayer> = {}): WatermarkLayer => ({
  id: "layer-1",
  file: {
    path: "/tmp/watermark.png",
    name: "watermark.png",
    kind: "image"
  },
  label: "watermark.png",
  locked: false,
  settings,
  visible: true,
  previewPayload: {
    kind: "image",
    data: new Uint8Array([1, 2, 3]),
    mimeType: "image/png",
    name: "watermark.png"
  },
  naturalSize: { width: 100, height: 80 },
  ...overrides
});

describe("reconcileWatermarkLayerPreviews", () => {
  it("reuses object URLs when only layer settings change", () => {
    const createObjectUrl = vi.fn(() => "blob:layer-1");
    const revokeObjectUrl = vi.fn();
    const layer = makeLayer();
    const initial = reconcileWatermarkLayerPreviews(
      [layer],
      [],
      createObjectUrl,
      revokeObjectUrl
    );

    const updated = reconcileWatermarkLayerPreviews(
      [
        makeLayer({
          settings: {
            ...settings,
            opacity: 80,
            freeCenterXRatio: 0.4
          }
        })
      ],
      initial,
      createObjectUrl,
      revokeObjectUrl
    );

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    expect(updated[0].previewUrl).toBe("blob:layer-1");
  });

  it("revokes removed layer object URLs", () => {
    const createObjectUrl = vi.fn(() => "blob:layer-1");
    const revokeObjectUrl = vi.fn();
    const initial = reconcileWatermarkLayerPreviews(
      [makeLayer()],
      [],
      createObjectUrl,
      revokeObjectUrl
    );

    const updated = reconcileWatermarkLayerPreviews(
      [],
      initial,
      createObjectUrl,
      revokeObjectUrl
    );

    expect(updated).toEqual([]);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:layer-1");
  });
});
