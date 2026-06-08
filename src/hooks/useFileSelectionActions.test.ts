import { describe, expect, it } from "vitest";
import type { EditableStateSnapshot } from "../shared/history";
import type { InputFile, WatermarkLayer, WatermarkSettings } from "../shared/types";
import { addWatermarkLayersToSnapshot } from "./useFileSelectionActions";

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

const makeSnapshot = (): EditableStateSnapshot => ({
  inputFiles: [],
  watermarkFile: null,
  watermarkLayers: [],
  activeWatermarkLayerId: null,
  settings,
  selectedPreviewPath: ""
});

const makeLayer = (id: string, file: InputFile): WatermarkLayer => ({
  id,
  file,
  label: file.name,
  locked: false,
  settings: {
    ...settings,
    opacity: id === "layer-2" ? 80 : 50
  },
  visible: true,
  previewPayload: {
    kind: "image",
    data: new Uint8Array([1, 2, 3]),
    mimeType: "image/png",
    name: file.name
  },
  naturalSize: { width: 100, height: 80 }
});

describe("addWatermarkLayersToSnapshot", () => {
  it("appends multiple watermark layers and activates the last one", () => {
    const firstFile: InputFile = {
      path: "/tmp/first.png",
      name: "first.png",
      kind: "image"
    };
    const secondFile: InputFile = {
      path: "/tmp/second.png",
      name: "second.png",
      kind: "image"
    };
    const next = addWatermarkLayersToSnapshot(makeSnapshot(), [
      makeLayer("layer-1", firstFile),
      makeLayer("layer-2", secondFile)
    ]);

    expect(next.watermarkLayers.map((layer) => layer.id)).toEqual(["layer-1", "layer-2"]);
    expect(next.activeWatermarkLayerId).toBe("layer-2");
    expect(next.watermarkFile).toEqual(secondFile);
    expect(next.settings.opacity).toBe(80);
  });

  it("keeps the snapshot unchanged when there are no new layers", () => {
    const snapshot = makeSnapshot();

    expect(addWatermarkLayersToSnapshot(snapshot, [])).toBe(snapshot);
  });
});
