import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { WatermarkSettings } from "../shared/types";
import { getAngleFromPoint, getWatermarkBaseSize, getWatermarkCenterPoint, normalizeRotationDegrees, resizeRotatedWatermarkBoxFromHandle, snapRotationDegrees, type ResizeHandle } from "../shared/watermarkGeometry";
import { snapWatermarkCenterPoint } from "../shared/watermarkSnap";

interface Options {
  enabled: boolean;
  canvasRef: RefObject<HTMLDivElement | null>;
  canvasSize: { width: number; height: number };
  settings: WatermarkSettings | null;
  naturalSize: { width: number; height: number };
  locked: boolean;
  onChange: (settings: WatermarkSettings) => void;
  begin: () => void;
  end: () => void;
}

export function useImageTransformInteraction(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const gesture = useRef<{
    pointerId: number; mode: "move" | "resize" | "rotate"; handle?: ResizeHandle;
    x: number; y: number; centerX: number; centerY: number; width: number; height: number;
    settings: WatermarkSettings; startAngle: number; rectWidth: number; rectHeight: number;
  } | null>(null);
  useEffect(() => {
    if (!options.enabled) { gesture.current = null; options.end(); return; }
    const stop = () => { gesture.current = null; latest.current.end(); };
    const move = (event: PointerEvent) => {
      const start = gesture.current, value = latest.current;
      if (!start || event.pointerId !== start.pointerId || value.locked) return;
      const dx = (event.clientX - start.x) / start.rectWidth * value.canvasSize.width;
      const dy = (event.clientY - start.y) / start.rectHeight * value.canvasSize.height;
      const settings = { ...start.settings };
      if (start.mode === "move") {
        const point = snapWatermarkCenterPoint(start.centerX + dx, start.centerY + dy, value.canvasSize.width, value.canvasSize.height, 8);
        Object.assign(settings, { placementMode: "free", position: null, freeCenterXRatio: point.x / value.canvasSize.width, freeCenterYRatio: point.y / value.canvasSize.height });
      } else if (start.mode === "resize") {
        const box = resizeRotatedWatermarkBoxFromHandle(start.handle!, start.centerX, start.centerY, start.width, start.height,
          dx, dy, settings.rotation, settings.preserveAspectRatio || event.ctrlKey || event.metaKey, start.width / start.height, 1, 1);
        Object.assign(settings, { placementMode: "free", position: null, freeCenterXRatio: box.centerX / value.canvasSize.width, freeCenterYRatio: box.centerY / value.canvasSize.height,
          freeWidthRatio: box.width / value.canvasSize.width, freeHeightRatio: box.height / value.canvasSize.height });
      } else {
        const node = value.canvasRef.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const angle = getAngleFromPoint(start.centerX, start.centerY,
          (event.clientX - rect.left) / rect.width * value.canvasSize.width,
          (event.clientY - rect.top) / rect.height * value.canvasSize.height);
        const rotation = normalizeRotationDegrees(start.settings.rotation + angle - start.startAngle);
        settings.rotation = event.shiftKey ? snapRotationDegrees(rotation, 15) : rotation;
      }
      value.onChange(settings);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => { stop(); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); window.removeEventListener("blur", stop); };
  }, [options.enabled]);

  return (mode: "move" | "resize" | "rotate", event: ReactPointerEvent<HTMLElement>, handle?: ResizeHandle) => {
    event.stopPropagation();
    const value = latest.current;
    if (!value.enabled || value.locked || !value.settings || !value.canvasRef.current || event.button !== 0) return;
    event.preventDefault();
    const rect = value.canvasRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const center = getWatermarkCenterPoint(value.settings, value.canvasSize.width, value.canvasSize.height);
    const size = getWatermarkBaseSize(value.settings, value.naturalSize.width, value.naturalSize.height, value.canvasSize.width, value.canvasSize.height);
    value.begin();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { mode, handle, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      centerX: center.x, centerY: center.y, width: size.width, height: size.height,
      settings: { ...value.settings }, rectWidth: rect.width, rectHeight: rect.height,
      startAngle: getAngleFromPoint(center.x, center.y, (event.clientX - rect.left) / rect.width * value.canvasSize.width, (event.clientY - rect.top) / rect.height * value.canvasSize.height) };
  };
}
