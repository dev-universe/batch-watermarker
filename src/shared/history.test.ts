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
  settings: {
    opacity: 7,
    sizeRatio: 280 / 842,
    rotation: 0,
    placementMode: "preset",
    position: "C",
    freeCenterXRatio: null,
    freeCenterYRatio: null,
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
      watermarkFile
    });

    const cloned = cloneSnapshot(original);

    expect(cloned).not.toBe(original);
    expect(cloned.settings).not.toBe(original.settings);
    expect(cloned.inputFiles).not.toBe(original.inputFiles);
    expect(cloned.inputFiles[0]).toBe(inputFile);
    expect(cloned.watermarkFile).toBe(watermarkFile);
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
