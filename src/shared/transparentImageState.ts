import type { ImageGroup, PageTransform, TransparentPage, TransparentProject, TransparentWatermark } from "./transparentImageTypes";
import type { WatermarkSettings } from "./types";

export const DEFAULT_PAGE_TRANSFORM: PageTransform = {
  scale: 1, rotation: 0, offsetXRatio: 0, offsetYRatio: 0, marginMm: 0
};

export const DEFAULT_IMAGE_WATERMARK_SETTINGS: WatermarkSettings = {
  opacity: 50, sizeRatio: 0.3, preserveAspectRatio: true, rotation: 0,
  placementMode: "preset", position: "C", freeCenterXRatio: null,
  freeCenterYRatio: null, freeWidthRatio: null, freeHeightRatio: null,
  suffix: "", outputDirectory: "", overwriteOriginal: false
};

export const getPageCanvasSize = (page: TransparentPage) => ({ width: page.asset.widthPt * 96 / 72, height: page.asset.heightPt * 96 / 72 });

export const getPageSourceSettings = (page: TransparentPage): WatermarkSettings => {
  const canvas = getPageCanvasSize(page);
  const margin = page.transform.marginMm * 96 / 25.4;
  const fit = Math.max(0.000001, Math.min((canvas.width - 2 * margin) / page.asset.widthPx, (canvas.height - 2 * margin) / page.asset.heightPx));
  return { ...DEFAULT_IMAGE_WATERMARK_SETTINGS, opacity: 100, placementMode: "free", position: null,
    rotation: page.transform.rotation, freeCenterXRatio: 0.5 + page.transform.offsetXRatio,
    freeCenterYRatio: 0.5 + page.transform.offsetYRatio,
    freeWidthRatio: page.asset.widthPx * fit * page.transform.scale / canvas.width,
    freeHeightRatio: page.asset.heightPx * fit * page.transform.scale / canvas.height };
};

export const applyPageSourceSettings = (page: TransparentPage, settings: WatermarkSettings): TransparentPage => {
  const base = getPageSourceSettings({ ...page, transform: { ...page.transform, scale: 1 } });
  return { ...page, transform: { ...page.transform, rotation: settings.rotation,
    offsetXRatio: (settings.freeCenterXRatio ?? 0.5) - 0.5,
    offsetYRatio: (settings.freeCenterYRatio ?? 0.5) - 0.5,
    scale: Math.max(0.001, (settings.freeWidthRatio ?? base.freeWidthRatio!) / base.freeWidthRatio!) } };
};

export const resolveGroupComposition = (project: TransparentProject, group: ImageGroup) => ({
  background: group.backgroundOverride === undefined ? project.background : group.backgroundOverride,
  watermarks: group.watermarkOverride === undefined ? project.watermarks : group.watermarkOverride
});

export const cloneWatermarks = (layers: TransparentWatermark[]) => layers.map(layer => ({
  ...layer, asset: { ...layer.asset }, settings: { ...layer.settings }
}));

export const setGroupSettingScope = (
  project: TransparentProject, groupId: string, setting: "background" | "watermarks", local: boolean
): TransparentProject => ({
  ...project,
  groups: project.groups.map(group => {
    if (group.id !== groupId) return group;
    const resolved = resolveGroupComposition(project, group);
    if (setting === "background") {
      return { ...group, backgroundOverride: local
        ? resolved.background && { ...resolved.background, asset: { ...resolved.background.asset } }
        : undefined };
    }
    return { ...group, watermarkOverride: local ? cloneWatermarks(resolved.watermarks) : undefined };
  })
});

export const naturalSortAssets = <T extends { name: string }>(assets: T[]): T[] =>
  [...assets].sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" }));

export const moveItem = <T>(items: T[], index: number, direction: -1 | 1): T[] => {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export const movePageToGroup = (project: TransparentProject, sourceId: string, targetId: string, pageId: string) => {
  if (sourceId === targetId || !project.groups.some(group => group.id === targetId)) return project;
  const page = project.groups.find(group => group.id === sourceId)?.pages.find(page => page.id === pageId);
  if (!page) return project;
  return { ...project, groups: project.groups.map(group => group.id === sourceId
    ? { ...group, pages: group.pages.filter(item => item.id !== pageId) }
    : group.id === targetId ? { ...group, pages: [...group.pages, page] } : group) };
};
