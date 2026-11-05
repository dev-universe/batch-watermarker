import type { WatermarkSettings } from "../shared/types";
import { getWatermarkBaseSize, getWatermarkCenterPoint } from "../shared/watermarkGeometry";

interface Props {
  settings: WatermarkSettings;
  canvasSize: { width: number; height: number };
  naturalSize: { width: number; height: number };
  source?: boolean;
  locked?: boolean;
  onChange: (settings: WatermarkSettings) => void;
  begin: () => void;
  end: () => void;
}

export function ImageTransformControls({ settings, canvasSize, naturalSize, source, locked, onChange, begin, end }: Props) {
  const size = getWatermarkBaseSize(settings, naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
  const center = getWatermarkCenterPoint(settings, canvasSize.width, canvasSize.height);
  const free = { ...settings, placementMode: "free" as const, position: null,
    freeCenterXRatio: center.x / canvasSize.width, freeCenterYRatio: center.y / canvasSize.height,
    freeWidthRatio: size.width / canvasSize.width, freeHeightRatio: size.height / canvasSize.height };
  const dimension = (axis: "width" | "height", value: number) => {
    if (value <= 0) return;
    const factor = value / size[axis];
    onChange({ ...free, freeWidthRatio: (axis === "width" || settings.preserveAspectRatio ? size.width * factor : size.width) / canvasSize.width,
      freeHeightRatio: (axis === "height" || settings.preserveAspectRatio ? size.height * factor : size.height) / canvasSize.height });
  };
  const number = (label: string, value: number, change: (value: number) => void, min?: number, max?: number) => <label>
    <span>{label}</span><input type="number" value={Math.round(value * 100) / 100} min={min} max={max} step="any"
      onFocus={begin} onBlur={end} onChange={event => {
        if (event.target.value === "") return;
        const next = Number(event.target.value);
        if (Number.isFinite(next) && (min === undefined || next >= min) && (max === undefined || next <= max)) change(next);
      }} />
  </label>;
  return <fieldset className="ti-transform-controls" disabled={locked}>
    {!source && <label><span>불투명도 {Math.round(settings.opacity)}%</span><input aria-label="워터마크 불투명도" type="range" min="0" max="100" value={settings.opacity}
      onPointerDown={begin} onKeyDown={begin} onBlur={end} onChange={event => onChange({ ...settings, opacity: Number(event.target.value) })} /></label>}
    <div className="ti-two-columns">
      {number("가로 (px)", size.width, value => dimension("width", value), 1)}
      {number("세로 (px)", size.height, value => dimension("height", value), 1)}
      {number("중심 X (%)", center.x / canvasSize.width * 100, value => onChange({ ...free, freeCenterXRatio: value / 100 }))}
      {number("중심 Y (%)", center.y / canvasSize.height * 100, value => onChange({ ...free, freeCenterYRatio: value / 100 }))}
    </div>
    {number("회전 (도)", settings.rotation, value => onChange({ ...settings, rotation: ((value % 360) + 360) % 360 }))}
    {!source && <label className="ti-inline-check"><input type="checkbox" checked={settings.preserveAspectRatio} onChange={event => onChange({ ...settings, preserveAspectRatio: event.target.checked })} />가로세로 비율 유지</label>}
    {!source && <div className="position-grid">{(["NW", "N", "NE", "W", "C", "E", "SW", "S", "SE"] as const).map(position => <button key={position}
      className={settings.placementMode === "preset" && settings.position === position ? "selected" : ""}
      onClick={() => onChange({ ...settings, placementMode: "preset", position })}>{position}</button>)}</div>}
  </fieldset>;
}
