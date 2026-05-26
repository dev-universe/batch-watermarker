import type { DragEvent } from "react";
import type { AnchorPosition, InputFile, WatermarkSettings } from "../shared/types";

const POSITIONS: AnchorPosition[] = ["NW", "N", "NE", "W", "C", "E", "SW", "S", "SE"];

interface WatermarkPanelFileProps {
  watermarkFile: InputFile | null;
  onOpenWatermarkPicker: () => void;
  onDropWatermarkFile: (event: DragEvent<HTMLElement>) => Promise<void>;
}

interface WatermarkLayerItem {
  id: string;
  name: string;
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
  onRemoveWatermarkLayer: (layerId: string) => void;
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
  onRemoveWatermarkLayer
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
          watermarkLayers.map((layer) => (
            <div key={layer.id} className={`layer-row ${layer.id === activeWatermarkLayerId ? "active" : ""}`}>
              <button className="layer-select" onClick={() => onSelectWatermarkLayer(layer.id)}>
                {layer.id === activeWatermarkLayerId ? "선택됨" : "선택"}
              </button>
              <span className="layer-name">{layer.name}</span>
              <button className="layer-remove subtle-action" onClick={() => onRemoveWatermarkLayer(layer.id)}>
                삭제
              </button>
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
              disabled={!settings.preserveAspectRatio}
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
              disabled={!settings.preserveAspectRatio}
              onChange={(event) => onUpdateNumericSetting("sizePx", event.target.value)}
            />
          </div>
        </label>

        <label>
          <span>
            <input
              type="checkbox"
              checked={settings.preserveAspectRatio}
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
          disabled={!watermarkFile}
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
            onClick={() => onSelectPosition(position)}
          >
            {position}
          </button>
        ))}
      </div>
    </section>
  );
}
