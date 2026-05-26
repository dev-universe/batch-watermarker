import { describe, expect, it } from "vitest";
import {
  canStartWatermarkTransform,
  canClearWatermarkSelection,
  getInteractionActivity,
  getKeyboardNudgeSnapshot,
  getKeyboardNudgeStep
} from "./watermarkInteractionHelpers";
import type { EditableStateSnapshot } from "../shared/history";

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

describe("canClearWatermarkSelection", () => {
  it("allows clearing when selected and idle", () => {
    expect(
      canClearWatermarkSelection(true, {
        hasDrag: false,
        hasResize: false,
        hasRotate: false
      })
    ).toBe(true);
  });

  it("prevents clearing while an interaction is active", () => {
    expect(
      canClearWatermarkSelection(true, {
        hasDrag: true,
        hasResize: false,
        hasRotate: false
      })
    ).toBe(false);
  });
});

describe("getInteractionActivity", () => {
  it("maps active refs into interaction activity flags", () => {
    expect(
      getInteractionActivity({
        drag: {},
        resize: null,
        rotate: undefined
      })
    ).toEqual({
      hasDrag: true,
      hasResize: false,
      hasRotate: false
    });
  });
});

describe("canStartWatermarkTransform", () => {
  it("allows transforms when preview and watermark sizes are available", () => {
    expect(
      canStartWatermarkTransform({
        previewCoordinateSize: { width: 600, height: 900 },
        watermarkNaturalSize: { width: 1200, height: 600 }
      })
    ).toBe(true);
  });

  it("prevents transforms when preview or watermark sizes are missing", () => {
    expect(
      canStartWatermarkTransform({
        previewCoordinateSize: { width: 0, height: 900 },
        watermarkNaturalSize: { width: 1200, height: 600 }
      })
    ).toBe(false);
  });
});

describe("getKeyboardNudgeStep", () => {
  it("returns 1px by default and 10px with shift", () => {
    expect(getKeyboardNudgeStep(false)).toBe(1);
    expect(getKeyboardNudgeStep(true)).toBe(10);
  });
});

describe("getKeyboardNudgeSnapshot", () => {
  it("moves a preset watermark and switches it into free mode", () => {
    const nextSnapshot = getKeyboardNudgeSnapshot(makeSnapshot(), 600, 900, "ArrowRight", false);

    expect(nextSnapshot.settings.placementMode).toBe("free");
    expect(nextSnapshot.settings.position).toBeNull();
    expect(nextSnapshot.settings.freeCenterXRatio).toBeCloseTo(301 / 600, 6);
    expect(nextSnapshot.settings.freeCenterYRatio).toBeCloseTo(450 / 900, 6);
  });

  it("uses the larger step when shift is pressed", () => {
    const nextSnapshot = getKeyboardNudgeSnapshot(makeSnapshot(), 600, 900, "ArrowUp", true);

    expect(nextSnapshot.settings.freeCenterXRatio).toBeCloseTo(300 / 600, 6);
    expect(nextSnapshot.settings.freeCenterYRatio).toBeCloseTo(440 / 900, 6);
  });

  it("clamps movement to the canvas bounds", () => {
    const snapshot = makeSnapshot();
    snapshot.settings.placementMode = "free";
    snapshot.settings.position = null;
    snapshot.settings.freeCenterXRatio = 0;
    snapshot.settings.freeCenterYRatio = 0;

    const nextSnapshot = getKeyboardNudgeSnapshot(snapshot, 600, 900, "ArrowLeft", false);

    expect(nextSnapshot.settings.freeCenterXRatio).toBe(0);
    expect(nextSnapshot.settings.freeCenterYRatio).toBe(0);
  });
});
