import { describe, expect, it } from "vitest";
import { getActiveWatermarkLayerState } from "./watermarkLayerState";
import type { EditableStateSnapshot } from "./history";

const makeSnapshot = (): EditableStateSnapshot => ({
  inputFiles: [],
  watermarkFile: null,
  watermarkLayers: [],
  activeWatermarkLayerId: null,
  selectedPreviewPath: "",
  settings: {
    opacity: 50,
    sizeRatio: 280 / 842,
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
  }
});

describe("getActiveWatermarkLayerState", () => {
  it("derives active layer file and settings from the active layer id", () => {
    const snapshot = makeSnapshot();
    const activeFile = {
      path: "/tmp/watermark.png",
      name: "watermark.png",
      kind: "image" as const
    };
    const activeSettings = {
      ...snapshot.settings,
      opacity: 23,
      rotation: 45
    };

    snapshot.watermarkLayers = [
      {
        id: "layer-1",
        file: {
          path: "/tmp/other.png",
          name: "other.png",
          kind: "image" as const
        },
        label: "other",
        locked: false,
        settings: snapshot.settings,
        visible: true,
        previewPayload: {
          kind: "image",
          data: new Uint8Array([1, 2, 3]),
          mimeType: "image/png",
          name: "other.png"
        },
        naturalSize: { width: 10, height: 10 }
      },
      {
        id: "layer-2",
        file: activeFile,
        label: "active",
        locked: true,
        settings: activeSettings,
        visible: true,
        previewPayload: {
          kind: "image",
          data: new Uint8Array([4, 5, 6]),
          mimeType: "image/png",
          name: "watermark.png"
        },
        naturalSize: { width: 20, height: 30 }
      }
    ];
    snapshot.activeWatermarkLayerId = "layer-2";

    expect(getActiveWatermarkLayerState(snapshot, snapshot.settings)).toEqual({
      watermarkFile: activeFile,
      settings: activeSettings,
      activeWatermarkLayerId: "layer-2"
    });
  });

  it("falls back to the provided defaults when the active layer is missing", () => {
    const snapshot = makeSnapshot();
    snapshot.activeWatermarkLayerId = "missing";

    expect(getActiveWatermarkLayerState(snapshot, snapshot.settings)).toEqual({
      watermarkFile: null,
      settings: snapshot.settings,
      activeWatermarkLayerId: null
    });
  });
});
