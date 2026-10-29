import { describe, expect, it } from "vitest";
import type { TransparentProject, TransparentWatermark, TransparentPage } from "./transparentImageTypes";
import { applyPageSourceSettings, DEFAULT_IMAGE_WATERMARK_SETTINGS, DEFAULT_PAGE_TRANSFORM, getPageSourceSettings, moveItem, movePageToGroup, naturalSortAssets, resolveGroupComposition, setGroupSettingScope } from "./transparentImageState";

const asset = { path: "sheet.svg", name: "sheet.svg", widthPx: 96, heightPx: 192, widthPt: 72, heightPt: 144 };
const page: TransparentPage = { id: "page", asset, transform: { ...DEFAULT_PAGE_TRANSFORM } };
const layer: TransparentWatermark = { id: "wm", label: "wm", asset, settings: { ...DEFAULT_IMAGE_WATERMARK_SETTINGS }, locked: false, visible: true };
const makeProject = (): TransparentProject => ({ groups: [{ id: "a", name: "A", pages: [page] }, { id: "b", name: "B", pages: [] }], background: { asset, fit: "cover" }, watermarks: [layer] });

describe("transparent image project", () => {
  it("inherits common settings until a group gets an independent copy", () => {
    let project = makeProject();
    expect(resolveGroupComposition(project, project.groups[0]).watermarks).toBe(project.watermarks);
    project = setGroupSettingScope(project, "a", "watermarks", true);
    const local = project.groups[0].watermarkOverride!;
    expect(local).toEqual(project.watermarks);
    expect(local[0].settings).not.toBe(project.watermarks[0].settings);
    project = { ...project, watermarks: [{ ...layer, settings: { ...layer.settings, opacity: 12 } }] };
    expect(resolveGroupComposition(project, project.groups[0]).watermarks[0].settings.opacity).toBe(50);
    expect(resolveGroupComposition(project, project.groups[1]).watermarks[0].settings.opacity).toBe(12);
    project = setGroupSettingScope(project, "a", "watermarks", false);
    expect(resolveGroupComposition(project, project.groups[0]).watermarks[0].settings.opacity).toBe(12);
  });
  it("distinguishes inherited background from an explicitly removed background", () => {
    let project = setGroupSettingScope(makeProject(), "a", "background", true);
    expect(project.groups[0].backgroundOverride).toEqual(project.background);
    expect(project.groups[0].backgroundOverride?.asset).not.toBe(project.background?.asset);
    project.groups[0] = { ...project.groups[0], backgroundOverride: null, watermarkOverride: [] };
    expect(resolveGroupComposition(project, project.groups[0])).toEqual({ background: null, watermarks: [] });
    project = setGroupSettingScope(project, "a", "background", false);
    expect(resolveGroupComposition(project, project.groups[0]).background).toBe(project.background);
  });
  it("naturally sorts page numbers and moves pages without mutating history", () => {
    expect(naturalSortAssets([{ name: "10.svg" }, { name: "2.svg" }, { name: "1.svg" }]).map(item => item.name)).toEqual(["1.svg", "2.svg", "10.svg"]);
    const original = makeProject();
    const moved = movePageToGroup(original, "a", "b", "page");
    expect(moved.groups[0].pages).toHaveLength(0);
    expect(moved.groups[1].pages).toEqual([page]);
    expect(original.groups[0].pages).toEqual([page]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a"], 0, -1)).toEqual(["a"]);
  });
  it("round trips page transforms through the shared layer geometry", () => {
    const original = { ...page, transform: { scale: 0.7, rotation: 17, offsetXRatio: -0.2, offsetYRatio: 0.1, marginMm: 3 } };
    const settings = getPageSourceSettings(original);
    const result = applyPageSourceSettings(original, settings);
    expect(result.transform.scale).toBeCloseTo(0.7);
    expect(result.transform.offsetXRatio).toBeCloseTo(-0.2);
    expect(result.transform.offsetYRatio).toBeCloseTo(0.1);
    expect(result.transform.rotation).toBe(17);
    expect(result.transform.marginMm).toBe(3);
  });
});
