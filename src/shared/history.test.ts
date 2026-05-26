import { describe, expect, it } from "vitest";
import type { EditableStateSnapshot } from "./history";
import {
  applyRedo,
  applyUndo,
  areSnapshotsEqual,
  cloneSnapshot,
  commitContinuousEdit,
  createEmptyHistoryState,
  pushHistorySnapshot
} from "./history";

const createSnapshot = (
  overrides: Partial<EditableStateSnapshot> = {}
): EditableStateSnapshot => ({
  inputFiles: [],
  watermarkFile: null,
  watermarkLayers: [],
  activeWatermarkLayerId: null,
  settings: {
    opacity: 7,
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
  },
  selectedPreviewPath: "",
  ...overrides
});

describe("history helpers", () => {
  it("clones settings while preserving file references", () => {
    const watermarkFile = {
      path: "/tmp/logo.png",
      name: "logo.png",
      kind: "image" as const
    };
    const inputFile = {
      path: "/tmp/song.pdf",
      name: "song.pdf",
      kind: "pdf" as const
    };
    const original = createSnapshot({
      inputFiles: [inputFile],
      watermarkFile,
      watermarkLayers: [
        {
          id: "layer-1",
          file: watermarkFile,
          settings: {
            opacity: 7,
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
          },
          visible: true,
          previewPayload: {
            kind: "image",
            mimeType: "image/png",
            name: "logo.png",
            data: new Uint8Array([1, 2, 3])
          },
          naturalSize: { width: 32, height: 32 }
        }
      ]
    });

    const cloned = cloneSnapshot(original);

    expect(cloned).not.toBe(original);
    expect(cloned.settings).not.toBe(original.settings);
    expect(cloned.inputFiles).not.toBe(original.inputFiles);
    expect(cloned.inputFiles[0]).toBe(inputFile);
    expect(cloned.watermarkFile).toBe(watermarkFile);
    expect(cloned.watermarkLayers).not.toBe(original.watermarkLayers);
    expect(cloned.watermarkLayers[0]).not.toBe(original.watermarkLayers[0]);
  });

  it("detects equal snapshots", () => {
    const snapshot = createSnapshot();
    expect(areSnapshotsEqual(snapshot, cloneSnapshot(snapshot))).toBe(true);
  });

  it("records and restores undo snapshots", () => {
    const history = createEmptyHistoryState();
    const before = createSnapshot();
    const after = createSnapshot({
      settings: {
        ...before.settings,
        sizeRatio: 700 / 842
      }
    });

    pushHistorySnapshot(history, before);
    const restored = applyUndo(history, after);

    expect(restored).toEqual(before);
    expect(history.future).toHaveLength(1);
    expect(history.future[0]).toEqual(after);
  });

  it("restores redo snapshots", () => {
    const history = createEmptyHistoryState();
    const before = createSnapshot();
    const after = createSnapshot({
      settings: {
        ...before.settings,
        rotation: 120
      }
    });

    pushHistorySnapshot(history, before);
    const undone = applyUndo(history, after);
    const redone = applyRedo(history, undone ?? before);

    expect(redone).toEqual(after);
  });

  it("commits one history entry for a continuous edit", () => {
    const history = createEmptyHistoryState();
    const before = createSnapshot();
    const after = createSnapshot({
      settings: {
        ...before.settings,
        opacity: 42
      }
    });

    const changed = commitContinuousEdit(history, before, after);

    expect(changed).toBe(true);
    expect(history.past).toEqual([before]);
    expect(history.future).toEqual([]);
  });

  it("skips continuous edit commits when nothing changed", () => {
    const history = createEmptyHistoryState();
    const snapshot = createSnapshot();

    const changed = commitContinuousEdit(history, snapshot, cloneSnapshot(snapshot));

    expect(changed).toBe(false);
    expect(history.past).toEqual([]);
  });
});
