import type { DragEvent } from "react";
import type { AnchorPosition, InputFile, WatermarkSettings } from "../shared/types";
import { getWatermarkLayerStatusLabels } from "../shared/watermarkLayerState";

const POSITIONS: AnchorPosition[] = ["NW", "N", "NE", "W", "C", "E", "SW", "S", "SE"];

interface WatermarkPanelFileProps {
  watermarkFile: InputFile | null;
  onOpenWatermarkPicker: () => void;
  onDropWatermarkFile: (event: DragEvent<HTMLElement>) => Promise<void>;
}

interface WatermarkLayerItem {
  id: string;
  label: string;
  name: string;
  locked: boolean;
  visible: boolean;
}

interface WatermarkPanelNumericProps {
  onBeginContinuousNumericEdit: () => void;
  onUpdateNumericSetting: (key: "opacity" | "sizePx" | "rotation", value: string) => void;
}

interface WatermarkPanelSizeProps {
  sizeControlMax: number;
  displayedSizePx: number;
  renderedWidthPx: number;
  renderedHeightPx: number;
  onWidthPxChange: (value: string) => void;
  onHeightPxChange: (value: string) => void;
  onTogglePreserveAspectRatio: (checked: boolean) => void;
  onResetOriginalAspectRatio: () => void;
}

interface WatermarkPanelPositionProps {
  onSelectPosition: (position: AnchorPosition) => void;
}

interface WatermarkPanelProps {
  settings: WatermarkSettings;
  watermarkLayers: WatermarkLayerItem[];
  activeWatermarkLayerId: string | null;
  file: WatermarkPanelFileProps;
  numeric: WatermarkPanelNumericProps;
  size: WatermarkPanelSizeProps;
  position: WatermarkPanelPositionProps;
  onSelectWatermarkLayer: (layerId: string) => void;
  onDuplicateWatermarkLayer: (layerId: string) => void;
  onMoveWatermarkLayer: (layerId: string, direction: -1 | 1) => void;
  onToggleWatermarkLayerVisibility: (layerId: string) => void;
  onToggleWatermarkLayerLock: (layerId: string) => void;
  onRenameWatermarkLayer: (layerId: string, label: string) => void;
  onRemoveWatermarkLayer: (layerId: string) => void;
  isActiveWatermarkLayerLocked: boolean;
}

export function WatermarkPanel({
  settings,
  watermarkLayers,
  activeWatermarkLayerId,
  file,
  numeric,
  size,
  position,
  onSelectWatermarkLayer,
  onDuplicateWatermarkLayer,
  onMoveWatermarkLayer,
  onToggleWatermarkLayerVisibility,
  onToggleWatermarkLayerLock,
  onRenameWatermarkLayer,
  onRemoveWatermarkLayer,
  isActiveWatermarkLayerLocked
}: WatermarkPanelProps) {
  const { watermarkFile, onOpenWatermarkPicker, onDropWatermarkFile } = file;
  const { onBeginContinuousNumericEdit, onUpdateNumericSetting } = numeric;
  const {
    sizeControlMax,
    displayedSizePx,
    renderedWidthPx,
    renderedHeightPx,
    onWidthPxChange,
    onHeightPxChange,
    onTogglePreserveAspectRatio,
    onResetOriginalAspectRatio
  } = size;
  const { onSelectPosition } = position;

  const onRangeKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      event.key.startsWith("Arrow") ||
      event.key === "Home" ||
      event.key === "End" ||
      event.key === "PageUp" ||
      event.key === "PageDown"
    ) {
      onBeginContinuousNumericEdit();
    }
  };

  const isWatermarkEditingDisabled = isActiveWatermarkLayerLocked || !watermarkFile;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>워터마크 이미지</h2>
        <button onClick={onOpenWatermarkPicker}>이미지 선택</button>
      </div>
      <div
        className={`dropzone ${watermarkFile ? "compact" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => void onDropWatermarkFile(event)}
      >
        {watermarkFile ? watermarkFile.name : "워터마크 이미지를 여기로 드래그하세요."}
      </div>

      <div className="panel-hint">
        <p>워터마크를 여러 개 추가할 수 있습니다.</p>
        <p>아래 목록에서 편집할 워터마크를 선택하세요.</p>
      </div>

      <div className="layer-list">
        {watermarkLayers.length > 0 ? (
          watermarkLayers.map((layer, index) => (
            <div
              key={layer.id}
              className={`layer-row ${layer.id === activeWatermarkLayerId ? "active" : ""} ${layer.visible ? "" : "hidden"} ${layer.locked ? "locked" : ""}`}
            >
              <button className="layer-select" onClick={() => onSelectWatermarkLayer(layer.id)}>
                {layer.id === activeWatermarkLayerId ? "선택됨" : "선택"}
              </button>
              <div className="layer-texts">
                <input
                  className="layer-name-input"
                  type="text"
                  value={layer.label}
                  disabled={layer.locked}
                  onChange={(event) => onRenameWatermarkLayer(layer.id, event.target.value)}
                />
                <span className="layer-file-name">{layer.name}</span>
                <div className="layer-status-badges">
                  {getWatermarkLayerStatusLabels({
                    isActive: layer.id === activeWatermarkLayerId,
                    locked: layer.locked,
                    visible: layer.visible
                  }).map((label) => (
                    <span key={label} className="layer-status-badge">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="layer-actions">
                <button
                  className="subtle-action"
                  onClick={() => onToggleWatermarkLayerLock(layer.id)}
                >
                  {layer.locked ? "해제" : "잠금"}
                </button>
                <button
                  className="subtle-action"
                  disabled={index === 0}
                  onClick={() => onMoveWatermarkLayer(layer.id, -1)}
                >
                  위
                </button>
                <button
                  className="subtle-action"
                  onClick={() => onDuplicateWatermarkLayer(layer.id)}
                >
                  복제
                </button>
                <button
                  className="subtle-action"
                  onClick={() => onToggleWatermarkLayerVisibility(layer.id)}
                >
                  {layer.visible ? "숨김" : "표시"}
                </button>
                <button
                  className="subtle-action"
                  disabled={index === watermarkLayers.length - 1}
                  onClick={() => onMoveWatermarkLayer(layer.id, 1)}
                >
                  아래
                </button>
                <button className="layer-remove subtle-action" onClick={() => onRemoveWatermarkLayer(layer.id)}>
                  삭제
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="panel-empty">아직 추가된 워터마크가 없습니다.</p>
        )}
      </div>

      <div className="field-grid">
        <label>
          <span className="field-label">투명도 (0~100%)</span>
          <div className="control-row">
            <input
              type="range"
              min="0"
              max="100"
              value={settings.opacity}
              disabled={isWatermarkEditingDisabled}
              onPointerDown={onBeginContinuousNumericEdit}
              onKeyDown={onRangeKeyDown}
              onChange={(event) => onUpdateNumericSetting("opacity", event.target.value)}
            />
            <input
              className="number"
              type="number"
              min="0"
              max="100"
              value={settings.opacity}
              disabled={isWatermarkEditingDisabled}
              onChange={(event) => onUpdateNumericSetting("opacity", event.target.value)}
            />
          </div>
        </label>

        <label>
          <span className="field-label">크기 (px)</span>
          <div className="control-row">
            <input
              type="range"
              min="0"
              max={sizeControlMax}
              value={displayedSizePx}
              disabled={!settings.preserveAspectRatio || isWatermarkEditingDisabled}
              onPointerDown={onBeginContinuousNumericEdit}
              onKeyDown={onRangeKeyDown}
              onChange={(event) => onUpdateNumericSetting("sizePx", event.target.value)}
            />
            <input
              className="number"
              type="number"
              min="0"
              max={sizeControlMax}
              value={Math.round(displayedSizePx)}
              disabled={!settings.preserveAspectRatio || isWatermarkEditingDisabled}
              onChange={(event) => onUpdateNumericSetting("sizePx", event.target.value)}
            />
          </div>
        </label>

        <label>
          <span>
            <input
              type="checkbox"
              checked={settings.preserveAspectRatio}
              disabled={isWatermarkEditingDisabled}
              onChange={(event) => onTogglePreserveAspectRatio(event.target.checked)}
            />{" "}
            현재 가로세로 비율 유지
          </span>
        </label>

        <div className="panel-hint">
          <p>비율 유지 켜면 크기 슬라이더와 가로/세로 입력이 현재 비율을 유지</p>
          <p>비율 유지 끄면 가로와 세로를 독립적으로 조절 가능</p>
        </div>

        <button
          className="subtle-action"
          disabled={isWatermarkEditingDisabled}
          onClick={onResetOriginalAspectRatio}
        >
          원본 비율로 초기화
        </button>

        <div className="dimension-row">
          <label>
            <span>가로 (px)</span>
            <input
              className="number"
              type="number"
              min="0"
              value={Math.round(renderedWidthPx)}
              disabled={isWatermarkEditingDisabled}
              onChange={(event) => onWidthPxChange(event.target.value)}
            />
          </label>
          <label>
            <span>세로 (px)</span>
            <input
              className="number"
              type="number"
              min="0"
              value={Math.round(renderedHeightPx)}
              disabled={isWatermarkEditingDisabled}
              onChange={(event) => onHeightPxChange(event.target.value)}
            />
          </label>
        </div>

        <label>
          <span className="field-label">회전 (0~360도)</span>
          <div className="control-row">
            <input
              type="range"
              min="0"
              max="360"
              value={settings.rotation}
              disabled={isWatermarkEditingDisabled}
              onPointerDown={onBeginContinuousNumericEdit}
              onKeyDown={onRangeKeyDown}
              onChange={(event) => onUpdateNumericSetting("rotation", event.target.value)}
            />
            <input
              className="number"
              type="number"
              min="0"
              max="360"
              value={settings.rotation}
              disabled={isWatermarkEditingDisabled}
              onChange={(event) => onUpdateNumericSetting("rotation", event.target.value)}
            />
          </div>
        </label>
      </div>

      <div className="position-grid">
        {POSITIONS.map((position) => (
          <button
            key={position}
            className={settings.position === position ? "selected" : ""}
            disabled={isWatermarkEditingDisabled}
            onClick={() => onSelectPosition(position)}
          >
            {position}
          </button>
        ))}
      </div>
    </section>
  );
}
