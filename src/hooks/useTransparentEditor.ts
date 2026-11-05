import { useEffect, useRef, useState, type DragEvent } from "react";
import { useTransparentProject } from "./useTransparentProject";
import type { ImageAsset, ImageBackground, ImageGroup, ImageImportResult, TransparentExportResponse, TransparentWatermark } from "../shared/transparentImageTypes";
import { DEFAULT_IMAGE_WATERMARK_SETTINGS, DEFAULT_PAGE_TRANSFORM, naturalSortAssets, resolveGroupComposition } from "../shared/transparentImageState";
import { getPdfExportProfile, type PdfExportProfileId } from "../shared/pdfExportProfiles";

export function useTransparentEditor() {
  const history = useTransparentProject();
  const { project, current, commit } = history;
  const [groupId, setGroupId] = useState(project.groups[0]?.id ?? "");
  const [pageId, setPageId] = useState("");
  const [selection, setSelection] = useState("source");
  const [outputDirectory, setOutputDirectory] = useState("");
  const [pdfExportProfile, setPdfExportProfile] = useState<PdfExportProfileId>("original");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<TransparentExportResponse | null>(null);
  const activeJob = useRef("");
  const group = project.groups.find(item => item.id === groupId) ?? project.groups[0];
  const page = group?.pages.find(item => item.id === pageId) ?? group?.pages[0];
  const resolved = group ? resolveGroupComposition(project, group) : { background: project.background, watermarks: project.watermarks };

  useEffect(() => window.transparentImageApi.onProgress(progress => {
    if (progress.jobId === activeJob.current) setStatus(`${progress.groupName} · ${progress.completedPages} / ${progress.totalPages}페이지 처리 중`);
  }), []);

  const updateGroup = (id: string, update: (group: ImageGroup) => ImageGroup) => commit(value => ({ ...value, groups: value.groups.map(item => item.id === id ? update(item) : item) }));
  const updateBackground = (value: ImageBackground | null) => {
    if (group && group.backgroundOverride !== undefined) updateGroup(group.id, item => ({ ...item, backgroundOverride: value }));
    else commit(project => ({ ...project, background: value }));
  };
  const updateWatermarks = (update: (layers: TransparentWatermark[]) => TransparentWatermark[]) => {
    // Read the current project to keep pointer and asynchronous updates independent of renders.
    const activeGroup = current.current.groups.find(item => item.id === group?.id);
    if (activeGroup?.watermarkOverride !== undefined) updateGroup(activeGroup.id, item => ({ ...item, watermarkOverride: update(item.watermarkOverride!) }));
    else commit(value => ({ ...value, watermarks: update(value.watermarks) }));
  };

  const addGroup = () => {
    const id = crypto.randomUUID();
    commit(value => ({ ...value, groups: [...value.groups, { id, name: `그룹 ${value.groups.length + 1}`, pages: [] }] }));
    setGroupId(id); setPageId(""); setSelection("source");
  };

  const importFiles = async (target: "pages" | "background" | "watermarks", paths?: string[]) => {
    if (busy || importing) return;
    const targetGroupId = group?.id;
    const localBackground = group?.backgroundOverride !== undefined;
    const localWatermarks = group?.watermarkOverride !== undefined;
    setImporting(true);
    try {
      const result: ImageImportResult = paths ? await window.transparentImageApi.normalizeDroppedImages(paths) : await window.transparentImageApi.pickImages();
      const assets = naturalSortAssets(result.assets);
      if (target === "pages" && targetGroupId && assets.length) {
        const pages = assets.map(asset => ({ id: crypto.randomUUID(), asset, transform: { ...DEFAULT_PAGE_TRANSFORM } }));
        updateGroup(targetGroupId, item => {
          const seen = new Set(item.pages.map(page => page.asset.path.toLowerCase()));
          return { ...item, pages: [...item.pages, ...pages.filter(page => !seen.has(page.asset.path.toLowerCase()))] };
        });
        setPageId(pages[0].id); setSelection("source");
      } else if (target === "background" && assets.length) {
        const background: ImageBackground = { asset: assets[0], fit: "cover" };
        if (localBackground && targetGroupId) updateGroup(targetGroupId, item => ({ ...item, backgroundOverride: background }));
        else commit(value => ({ ...value, background }));
      } else if (target === "watermarks" && assets.length) {
        const layers = assets.map((asset: ImageAsset): TransparentWatermark => ({ id: crypto.randomUUID(), label: asset.name, asset,
          settings: { ...DEFAULT_IMAGE_WATERMARK_SETTINGS }, visible: true, locked: false }));
        if (localWatermarks && targetGroupId) updateGroup(targetGroupId, item => ({ ...item, watermarkOverride: [...(item.watermarkOverride ?? []), ...layers] }));
        else commit(value => ({ ...value, watermarks: [...value.watermarks, ...layers] }));
        setSelection(layers[layers.length - 1].id);
      }
      setStatus(result.errors.length ? result.errors.join("\n") : assets.length ? `${assets.length}개 이미지를 추가했습니다.${target === "background" && assets.length > 1 ? " 배경은 첫 번째 이미지를 사용합니다." : ""}` : "");
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setImporting(false); }
  };

  const dropFiles = (target: "pages" | "background" | "watermarks", event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const paths = Array.from(event.dataTransfer.files).map(file => window.watermarkApi.getPathForFile(file)).filter(Boolean);
    if (paths.length) void importFiles(target, paths);
  };

  const pickOutput = async () => {
    try { const directory = await window.watermarkApi.pickOutputFolder(); if (directory) setOutputDirectory(directory); }
    catch (error) { setStatus(String(error)); }
  };

  const exportGroups = async () => {
    if (busy || importing) return;
    if (!project.groups.some(group => group.pages.length)) { setStatus("그룹에 입력 이미지를 추가해 주세요."); return; }
    let directory = outputDirectory;
    if (!directory) {
      try { directory = await window.watermarkApi.pickOutputFolder(); } catch (error) { setStatus(String(error)); return; }
      if (!directory) return;
      setOutputDirectory(directory);
    }
    setBusy(true); setLastResult(null); activeJob.current = crypto.randomUUID();
    const profile = getPdfExportProfile(pdfExportProfile);
    setStatus(`${profile.label} · ${profile.dpi} DPI PDF 생성을 시작합니다.`);
    try {
      const result = await window.transparentImageApi.exportGroups({ jobId: activeJob.current, project, outputDirectory: directory, pdfExportProfile });
      setLastResult(result);
      setStatus(`PDF ${result.results.length}개 저장 완료${result.errors.length ? ` · 오류 ${result.errors.length}개` : ""}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { activeJob.current = ""; setBusy(false); }
  };

  return { ...history, group, page, resolved, groupId, setGroupId, pageId, setPageId, selection, setSelection,
    outputDirectory, pdfExportProfile, setPdfExportProfile, status, busy, importing, lastResult, addGroup, updateGroup, updateBackground, updateWatermarks, importFiles, dropFiles, pickOutput, exportGroups };
}
