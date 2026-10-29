import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useTransparentEditor } from "../hooks/useTransparentEditor";
import { useCompositionPreview } from "../hooks/useCompositionPreview";
import { useImageTransformInteraction } from "../hooks/useImageTransformInteraction";
import { applyPageSourceSettings, DEFAULT_PAGE_TRANSFORM, getPageCanvasSize, getPageSourceSettings, moveItem, setGroupSettingScope } from "../shared/transparentImageState";
import type { TransparentWatermark } from "../shared/transparentImageTypes";
import type { WatermarkSettings } from "../shared/types";
import { getWatermarkBaseSize, getWatermarkCenterPoint, type ResizeHandle } from "../shared/watermarkGeometry";
import { ImageTransformControls } from "./ImageTransformControls";
import { ImageGroupsPanel } from "./ImageGroupsPanel";

const handles: ResizeHandle[] = ["nw", "ne", "se", "sw"];

export function TransparentImageEditor({ active }: { active: boolean }) {
  const editor = useTransparentEditor();
  const { project, group, page, resolved, selection, setSelection, commit, updateGroup, updateWatermarks, begin, end, undo, redo, busy, importing } = editor;
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasSize = page ? getPageCanvasSize(page) : { width: 1, height: 1 };
  const selectedLayer = resolved.watermarks.find(layer => layer.id === selection);
  const settings = selection === "source" && page ? getPageSourceSettings(page) : selectedLayer?.settings ?? null;
  const naturalSize = selection === "source" && page ? { width: page.asset.widthPx, height: page.asset.heightPx }
    : { width: selectedLayer?.asset.widthPx ?? 1, height: selectedLayer?.asset.heightPx ?? 1 };
  const updateSettings = (settings: WatermarkSettings) => {
    if (selection === "source" && group && page) updateGroup(group.id, item => ({ ...item, pages: item.pages.map(value => value.id === page.id ? applyPageSourceSettings(value, settings) : value) }));
    else if (selectedLayer && !selectedLayer.locked) updateWatermarks(layers => layers.map(layer => layer.id === selectedLayer.id ? { ...layer, settings } : layer));
  };
  const interact = useImageTransformInteraction({ enabled: active && !busy && !importing, canvasRef, canvasSize, settings, naturalSize, locked: selectedLayer?.locked ?? false, onChange: updateSettings, begin, end });
  const request = useMemo(() => page ? { page, background: resolved.background, watermarks: resolved.watermarks } : null, [page, resolved.background, resolved.watermarks]);
  const preview = useCompositionPreview(request, active && !busy);
  const latest = useRef({ settings, selectedLayer, updateSettings, selection });
  latest.current = { settings, selectedLayer, updateSettings, selection };

  useEffect(() => {
    if (!active || busy || importing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
        event.preventDefault();
        if (key === "y" || event.shiftKey) redo(); else undo();
      } else if (key === "escape") setSelection("");
      else if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
        const value = latest.current;
        if (!value.settings || value.selectedLayer?.locked || (value.selectedLayer && !value.selectedLayer.visible)) return;
        event.preventDefault();
        const center = getWatermarkCenterPoint(value.settings, canvasSize.width, canvasSize.height);
        const step = event.shiftKey ? 10 : 1;
        value.updateSettings({ ...value.settings, placementMode: "free", position: null,
          freeCenterXRatio: (center.x + (key === "arrowleft" ? -step : key === "arrowright" ? step : 0)) / canvasSize.width,
          freeCenterYRatio: (center.y + (key === "arrowup" ? -step : key === "arrowdown" ? step : 0)) / canvasSize.height });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, busy, importing, undo, redo, setSelection, canvasSize.width, canvasSize.height]);

  const layerAction = (id: string, update: (layer: TransparentWatermark) => TransparentWatermark) => updateWatermarks(layers => layers.map(layer => layer.id === id ? update(layer) : layer));
  const scope = (type: "background" | "watermarks") => group && <label className="ti-scope"><span>적용 범위</span><select
    aria-label={type === "background" ? "배경 적용 범위" : "워터마크 적용 범위"}
    value={(type === "background" ? group.backgroundOverride : group.watermarkOverride) === undefined ? "common" : "group"}
    onChange={event => { commit(value => setGroupSettingScope(value, group.id, type, event.target.value === "group")); setSelection("source"); }}>
    <option value="common">전체 공통</option><option value="group">이 그룹만</option></select></label>;

  const overlayStyle = (settings: WatermarkSettings, width: number, height: number): CSSProperties => {
    const center = getWatermarkCenterPoint(settings, canvasSize.width, canvasSize.height);
    const size = getWatermarkBaseSize(settings, width, height, canvasSize.width, canvasSize.height);
    return { left: `${center.x / canvasSize.width * 100}%`, top: `${center.y / canvasSize.height * 100}%`,
      width: `${size.width / canvasSize.width * 100}%`, height: `${size.height / canvasSize.height * 100}%`,
      transform: `translate(-50%, -50%) rotate(${settings.rotation}deg)` };
  };
  const outline = settings && (selection === "source" || selectedLayer?.visible) && <div className={`ti-transform-outline ${selectedLayer?.locked ? "locked" : ""}`} style={overlayStyle(settings, naturalSize.width, naturalSize.height)}>
    {!selectedLayer?.locked && <><div className="ti-rotation-stem" /><div role="button" aria-label="회전 핸들" className="ti-rotation-handle" onPointerDown={event => interact("rotate", event)} />
      {handles.map(handle => <div role="button" aria-label={`${handle} 크기 조절`} key={handle} className={`ti-resize-handle ${handle}`} onPointerDown={event => interact("resize", event, handle)} />)}</>}
  </div>;

  return <div className="shell ti-shell">
    <aside className="sidebar ti-sidebar">
      <div className="hero"><h1>투명 이미지 편집</h1><p className="subtle">여러 페이지에 배경과 워터마크를 한 번에.</p></div>
      <fieldset className="ti-editor-fields" disabled={busy || importing}>
        <ImageGroupsPanel project={project} group={group} pageId={page?.id} selectGroup={id => { end(); editor.setGroupId(id); editor.setPageId(""); setSelection("source"); }}
          selectPage={id => { end(); editor.setPageId(id); setSelection("source"); }} addGroup={editor.addGroup} commit={commit} updateGroup={updateGroup}
          addFiles={() => void editor.importFiles("pages")} dropFiles={event => editor.dropFiles("pages", event)} />
        <section className="panel">
          <div className="panel-head"><h2>배경 이미지</h2><button onClick={() => void editor.importFiles("background")}>배경 선택</button></div>
          {scope("background")}
          <div className="dropzone compact" onDragOver={event => event.preventDefault()} onDrop={event => editor.dropFiles("background", event)}>{resolved.background?.asset.name ?? "배경 이미지를 드래그하세요. (선택 사항)"}</div>
          {resolved.background && <div className="ti-toolbar"><select aria-label="배경 맞춤" value={resolved.background.fit} onChange={event => editor.updateBackground({ ...resolved.background!, fit: event.target.value as "cover" | "contain" })}>
            <option value="cover">비율 유지 · 페이지 채우기</option><option value="contain">비율 유지 · 이미지 전체 보기</option></select><button onClick={() => editor.updateBackground(null)}>배경 제거</button></div>}
          <p className="panel-hint">공통 설정은 공통을 사용하는 모든 그룹에 적용됩니다.</p>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>워터마크 레이어</h2><button onClick={() => void editor.importFiles("watermarks")}>이미지 추가</button></div>
          {scope("watermarks")}
          <div className="dropzone compact" onDragOver={event => event.preventDefault()} onDrop={event => editor.dropFiles("watermarks", event)}>여러 워터마크를 드래그하면 모두 함께 적용됩니다.</div>
          <div className="ti-watermarks">{resolved.watermarks.map((layer, index) => <div key={layer.id} className={`ti-watermark-row ${selection === layer.id ? "active" : ""}`}>
            <div className="ti-layer-title"><button aria-label={`${layer.label} 선택`} onClick={() => setSelection(layer.id)}>{selection === layer.id ? "선택됨" : "선택"}</button><input aria-label="워터마크 이름" value={layer.label} disabled={layer.locked}
              onChange={event => layerAction(layer.id, value => ({ ...value, label: event.target.value }))} /></div>
            <div className="ti-layer-actions"><button onClick={() => layerAction(layer.id, value => ({ ...value, visible: !value.visible }))}>{layer.visible ? "숨기기" : "표시하기"}</button>
              <button onClick={() => layerAction(layer.id, value => ({ ...value, locked: !value.locked }))}>{layer.locked ? "잠금 해제" : "잠금"}</button>
              <button aria-label={`${layer.label} 아래 레이어로`} disabled={index === 0} onClick={() => updateWatermarks(layers => moveItem(layers, index, -1))}>↓</button>
              <button aria-label={`${layer.label} 위 레이어로`} disabled={index === resolved.watermarks.length - 1} onClick={() => updateWatermarks(layers => moveItem(layers, index, 1))}>↑</button>
              <button onClick={() => { const id = crypto.randomUUID(); updateWatermarks(layers => [...layers, { ...layer, id, settings: { ...layer.settings }, label: `${layer.label} 복사` }]); setSelection(id); }}>복제</button>
              <button className="ti-delete" onClick={() => { updateWatermarks(layers => layers.filter(value => value.id !== layer.id)); if (selection === layer.id) setSelection("source"); }}>삭제</button>
            </div>
          </div>)}</div>
          {!resolved.watermarks.length && <p className="panel-empty">워터마크 없이도 PDF를 만들 수 있습니다.</p>}
        </section>
        {page && <section className="panel">
          <div className="panel-head"><h2>{selection === "source" ? "입력 이미지 배치" : selectedLayer ? "워터마크 배치" : "이미지 배치"}</h2><button onClick={() => setSelection("source")}>입력 이미지 선택</button></div>
          {selection === "source" && <div className="ti-two-columns">
            <label><span>배율 (%)</span><input type="number" min="0.1" step="1" value={Math.round(page.transform.scale * 10000) / 100} onFocus={begin} onBlur={end}
              onChange={event => { const scale = Number(event.target.value) / 100; if (Number.isFinite(scale) && scale > 0) updateGroup(group!.id, item => ({ ...item, pages: item.pages.map(value => value.id === page.id ? { ...value, transform: { ...value.transform, scale } } : value) })); }} /></label>
            <label><span>여백 (mm)</span><input type="number" min="0" step="1" value={page.transform.marginMm} onFocus={begin} onBlur={end}
              onChange={event => { const marginMm = Number(event.target.value); if (Number.isFinite(marginMm) && marginMm >= 0) updateGroup(group!.id, item => ({ ...item, pages: item.pages.map(value => value.id === page.id ? { ...value, transform: { ...value.transform, marginMm } } : value) })); }} /></label>
          </div>}
          {settings ? <ImageTransformControls settings={settings} canvasSize={canvasSize} naturalSize={naturalSize} source={selection === "source"} locked={selectedLayer?.locked} onChange={updateSettings} begin={begin} end={end} /> : <p className="panel-empty">편집할 이미지를 선택하세요.</p>}
          {selection === "source" && <button onClick={() => updateGroup(group!.id, item => ({ ...item, pages: item.pages.map(value => value.id === page.id ? { ...value, transform: { ...DEFAULT_PAGE_TRANSFORM } } : value) }))}>입력 이미지 배치 초기화</button>}
        </section>}
      </fieldset>
      <section className="panel ti-export-panel">
        <div className="panel-head"><h2>PDF 내보내기</h2><span className="ti-badge">600 DPI</span></div>
        <p className="subtle">원본 페이지 크기 · 무손실 이미지형 PDF</p>
        <button disabled={busy || importing} onClick={() => void editor.pickOutput()}>저장 폴더 선택</button>
        <p className="ti-output-path">{editor.outputDirectory || "내보낼 때 저장 폴더를 선택합니다."}</p>
        <button className="ti-primary" disabled={busy || importing || !project.groups.some(group => group.pages.length)} onClick={() => void editor.exportGroups()}>{busy ? "PDF 생성 중…" : importing ? "이미지 불러오는 중…" : `그룹별 PDF 저장 (${project.groups.filter(group => group.pages.length).length}개)`}</button>
        <p className="ti-status" role="status">{editor.status}</p>
        {editor.lastResult && <div className="ti-export-results">{editor.lastResult.results.map(result => <p key={result.outputPath}>{result.groupName} · {result.pageCount}페이지<br /><small>{result.outputPath}</small></p>)}
          {editor.lastResult.errors.map((error, index) => <p className="ti-error" key={index}>{error}</p>)}</div>}
      </section>
    </aside>
    <main className="ti-preview-pane">
      <div className="ti-preview-header"><div><span className="ti-eyebrow">LIVE COMPOSITION</span><h2>{page?.asset.name ?? "투명 이미지를 추가해 시작하세요"}</h2><p className="subtle">{group?.name ?? "그룹 없음"}{page ? ` · ${group!.pages.findIndex(value => value.id === page.id) + 1} / ${group!.pages.length}페이지 · ${(page.asset.widthPt * 25.4 / 72).toFixed(1)} × ${(page.asset.heightPt * 25.4 / 72).toFixed(1)} mm` : ""}</p></div>
        <div className="ti-history"><button disabled={!editor.canUndo || busy} onClick={undo}>실행 취소</button><button disabled={!editor.canRedo || busy} onClick={redo}>다시 실행</button></div>
      </div>
      <div className="ti-stage" onPointerDown={() => setSelection("")}>
        {page ? <div ref={canvasRef} className={`ti-canvas ${busy || importing ? "ti-disabled-canvas" : ""}`} style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}`, width: `min(100%, calc((100vh - 290px) * ${canvasSize.width / canvasSize.height}))` }}>
          {preview.url && <img className="ti-composed-image" alt="배경과 워터마크가 합성된 페이지 미리보기" src={preview.url} draggable={false} />}
          <div className="ti-hit-layers"><div className="ti-hitbox ti-source-hitbox" style={overlayStyle(getPageSourceSettings(page), page.asset.widthPx, page.asset.heightPx)} onPointerDown={event => { if (selection !== "source") { event.stopPropagation(); setSelection("source"); } else interact("move", event); }} />
            {resolved.watermarks.filter(layer => layer.visible).map(layer => <div key={layer.id} className="ti-hitbox" title={layer.label} style={overlayStyle(layer.settings, layer.asset.widthPx, layer.asset.heightPx)}
              onPointerDown={event => { if (selection !== layer.id) { event.stopPropagation(); setSelection(layer.id); } else interact("move", event); }} />)}</div>
          {outline}
        </div> : <div className="ti-empty-state"><div className="ti-empty-icon">▧</div><h3>그룹에 이미지를 넣어보세요</h3><p>투명 SVG 위에 배경과 워터마크를 더해<br />여러 페이지 PDF로 저장할 수 있습니다.</p></div>}
        {preview.loading && page && <span className="ti-preview-indicator">미리보기 업데이트 중…</span>}
      </div>
      {preview.error && page && <p role="alert" className="ti-error ti-preview-error">{preview.error}</p>}
      <footer className="ti-preview-footer"><span>선택 후 드래그: 이동 · 모서리: 크기 · 위쪽 원: 회전</span><span>Shift + 회전: 15° · 방향키: 1px · Shift + 방향키: 10px · Ctrl + Z: 실행 취소</span></footer>
    </main>
  </div>;
}
