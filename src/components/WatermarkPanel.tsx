import type { DragEvent } from "react";
import type { AnchorPosition, InputFile, WatermarkSettings } from "../shared/types";

const POSITIONS: AnchorPosition[] = ["NW", "N", "NE", "W", "C", "E", "SW", "S", "SE"];

interface WatermarkPanelProps {
  settings: WatermarkSettings;
  watermarkFile: InputFile | null;
  onOpenWatermarkPicker: () => void;
  onDropWatermarkFile: (event: DragEvent<HTMLElement>) => Promise<void>;
  onBeginContinuousNumericEdit: () => void;
  onUpdateNumericSetting: (key: "opacity" | "scale" | "rotation", value: string) => void;
  onSelectPosition: (position: AnchorPosition) => void;
}

export function WatermarkPanel({
  settings,
  watermarkFile,
  onOpenWatermarkPicker,
  onDropWatermarkFile,
  onBeginContinuousNumericEdit,
  onUpdateNumericSetting,
  onSelectPosition
}: WatermarkPanelProps) {
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

      <div className="field-grid">
        <label>
          <span>투명도 (0~100%)</span>
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
          <span>크기 (0~1000%)</span>
          <div className="control-row">
            <input
              type="range"
              min="0"
              max="1000"
              value={settings.scale}
              onPointerDown={onBeginContinuousNumericEdit}
              onKeyDown={onRangeKeyDown}
              onChange={(event) => onUpdateNumericSetting("scale", event.target.value)}
            />
            <input
              className="number"
              type="number"
              min="0"
              max="1000"
              value={settings.scale}
              onChange={(event) => onUpdateNumericSetting("scale", event.target.value)}
            />
          </div>
        </label>

        <label>
          <span>회전 (0~360도)</span>
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
