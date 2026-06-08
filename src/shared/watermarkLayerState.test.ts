import { describe, expect, it } from "vitest";
import {
  canEditActiveWatermarkLayer,
  getActiveWatermarkLayerState,
  getWatermarkLayerStatusLabels,
  getWatermarkLayerZIndex,
  hydrateSnapshotFromActiveWatermarkLayer,
  persistActiveWatermarkLayerSettings
} from "./watermarkLayerState";
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
      activeWatermarkLayerId: "layer-2",
      locked: true
    });
  });

  it("falls back to the provided defaults when the active layer is missing", () => {
    const snapshot = makeSnapshot();
    snapshot.activeWatermarkLayerId = "missing";

    expect(getActiveWatermarkLayerState(snapshot, snapshot.settings)).toEqual({
      watermarkFile: null,
      settings: snapshot.settings,
      activeWatermarkLayerId: null,
      locked: false
    });
  });
});

describe("active watermark layer snapshot sync", () => {
  it("persists top-level editing settings into the active layer", () => {
    const snapshot = makeSnapshot();
    const inactiveSettings = {
      ...snapshot.settings,
      opacity: 15
    };
    const editedSettings = {
      ...snapshot.settings,
      opacity: 82,
      placementMode: "free" as const,
      position: null,
      freeCenterXRatio: 0.2,
      freeCenterYRatio: 0.7
    };

    snapshot.settings = editedSettings;
    snapshot.watermarkLayers = [
      {
        id: "layer-1",
        file: {
          path: "/tmp/inactive.png",
          name: "inactive.png",
          kind: "image" as const
        },
        label: "inactive",
        locked: false,
        settings: inactiveSettings,
        visible: true,
        previewPayload: {
          kind: "image",
          data: new Uint8Array([1]),
          mimeType: "image/png",
          name: "inactive.png"
        },
        naturalSize: { width: 10, height: 10 }
      },
      {
        id: "layer-2",
        file: {
          path: "/tmp/active.png",
          name: "active.png",
          kind: "image" as const
        },
        label: "active",
        locked: false,
        settings: {
          ...snapshot.settings,
          opacity: 25
        },
        visible: true,
        previewPayload: {
          kind: "image",
          data: new Uint8Array([2]),
          mimeType: "image/png",
          name: "active.png"
        },
        naturalSize: { width: 20, height: 20 }
      }
    ];
    snapshot.activeWatermarkLayerId = "layer-2";

    const synced = persistActiveWatermarkLayerSettings(snapshot);

    expect(synced.watermarkLayers[0].settings).toEqual(inactiveSettings);
    expect(synced.watermarkLayers[1].settings).toEqual(editedSettings);
    expect(synced.settings).toEqual(editedSettings);
    expect(synced.watermarkFile).toEqual(snapshot.watermarkLayers[1].file);
  });

  it("hydrates top-level editing settings from the selected active layer", () => {
    const snapshot = makeSnapshot();
    const selectedSettings = {
      ...snapshot.settings,
      opacity: 33,
      rotation: 27
    };
    const selectedFile = {
      path: "/tmp/selected.png",
      name: "selected.png",
      kind: "image" as const
    };

    snapshot.settings = {
      ...snapshot.settings,
      opacity: 88
    };
    snapshot.watermarkLayers = [
      {
        id: "layer-1",
        file: selectedFile,
        label: "selected",
        locked: false,
        settings: selectedSettings,
        visible: true,
        previewPayload: {
          kind: "image",
          data: new Uint8Array([1]),
          mimeType: "image/png",
          name: "selected.png"
        },
        naturalSize: { width: 10, height: 10 }
      }
    ];
    snapshot.activeWatermarkLayerId = "layer-1";

    const hydrated = hydrateSnapshotFromActiveWatermarkLayer(snapshot, makeSnapshot().settings);

    expect(hydrated.settings).toEqual(selectedSettings);
    expect(hydrated.watermarkFile).toEqual(selectedFile);
    expect(hydrated.activeWatermarkLayerId).toBe("layer-1");
  });
});

describe("canEditActiveWatermarkLayer", () => {
  it("allows editing when an active unlocked layer exists", () => {
    const snapshot = makeSnapshot();
    snapshot.watermarkLayers = [
      {
        id: "layer-1",
        file: {
          path: "/tmp/watermark.png",
          name: "watermark.png",
          kind: "image" as const
        },
        label: "active",
        locked: false,
        settings: snapshot.settings,
        visible: true,
        previewPayload: {
          kind: "image",
          data: new Uint8Array([1, 2, 3]),
          mimeType: "image/png",
          name: "watermark.png"
        },
        naturalSize: { width: 20, height: 30 }
      }
    ];
    snapshot.activeWatermarkLayerId = "layer-1";

    const activeLayerState = getActiveWatermarkLayerState(snapshot, snapshot.settings);

    expect(canEditActiveWatermarkLayer(activeLayerState)).toBe(true);
  });

  it("blocks editing when the active layer is locked", () => {
    const snapshot = makeSnapshot();
    snapshot.watermarkLayers = [
      {
        id: "layer-1",
        file: {
          path: "/tmp/watermark.png",
          name: "watermark.png",
          kind: "image" as const
        },
        label: "active",
        locked: true,
        settings: snapshot.settings,
        visible: true,
        previewPayload: {
          kind: "image",
          data: new Uint8Array([1, 2, 3]),
          mimeType: "image/png",
          name: "watermark.png"
        },
        naturalSize: { width: 20, height: 30 }
      }
    ];
    snapshot.activeWatermarkLayerId = "layer-1";

    const activeLayerState = getActiveWatermarkLayerState(snapshot, snapshot.settings);

    expect(canEditActiveWatermarkLayer(activeLayerState)).toBe(false);
  });

  it("blocks editing when no active layer exists", () => {
    const activeLayerState = getActiveWatermarkLayerState(makeSnapshot(), makeSnapshot().settings);

    expect(canEditActiveWatermarkLayer(activeLayerState)).toBe(false);
  });
});

describe("getWatermarkLayerZIndex", () => {
  it("places the sidebar top layer above lower layers in the preview", () => {
    const layerCount = 3;

    expect(getWatermarkLayerZIndex(0, layerCount)).toBeGreaterThan(
      getWatermarkLayerZIndex(1, layerCount)
    );
    expect(getWatermarkLayerZIndex(1, layerCount)).toBeGreaterThan(
      getWatermarkLayerZIndex(2, layerCount)
    );
  });
});

describe("getWatermarkLayerStatusLabels", () => {
  it("shows active, locked, and hidden labels in priority order", () => {
    const labels = getWatermarkLayerStatusLabels({
      isActive: true,
      locked: true,
      visible: false
    });

    expect(labels).toEqual(["활성", "잠금", "숨김"]);
  });

  it("shows no labels when the layer is neither active nor hidden nor locked", () => {
    const labels = getWatermarkLayerStatusLabels({
      isActive: false,
      locked: false,
      visible: true
    });

    expect(labels).toEqual([]);
  });
});
