import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { flushSync } from "react-dom";
import type { EditableStateSnapshot } from "../shared/history";
import type { WatermarkSettings } from "../shared/types";
import {
  getAngleFromPoint,
  getWatermarkBaseSize,
  getWatermarkCenterPoint,
  isCornerResizeHandle,
  normalizeRotationDegrees,
  resizeRotatedWatermarkBoxFromHandle,
  snapRotationDegrees,
  type ResizeHandle
} from "../shared/watermarkGeometry";
import { snapWatermarkCenterPoint } from "../shared/watermarkSnap";

interface Size {
  width: number;
  height: number;
}

interface UseWatermarkInteractionParams {
  settings: WatermarkSettings;
  setSettings: React.Dispatch<React.SetStateAction<WatermarkSettings>>;
  currentSnapshotRef: MutableRefObject<EditableStateSnapshot>;
  commitSnapshot: (updater: (current: EditableStateSnapshot) => EditableStateSnapshot) => void;
  beginContinuousEdit: () => void;
  endContinuousEdit: () => void;
  undo: () => void;
  redo: () => void;
  previewCoordinateSize: Size;
  previewDisplaySize: Size;
  watermarkNaturalSize: Size;
  previewImageRef: MutableRefObject<HTMLImageElement | null>;
}

export function useWatermarkInteraction({
  settings,
  setSettings,
  currentSnapshotRef,
  commitSnapshot,
  beginContinuousEdit,
  endContinuousEdit,
  undo,
  redo,
  previewCoordinateSize,
  previewDisplaySize,
  watermarkNaturalSize,
  previewImageRef
}: UseWatermarkInteractionParams) {
  const [isWatermarkHovered, setIsWatermarkHovered] = useState(false);
  const [isWatermarkSelected, setIsWatermarkSelected] = useState(false);
  const [isWatermarkDragging, setIsWatermarkDragging] = useState(false);

  const dragStateRef = useRef<{
    pointerId: number;
    startPointerX: number;
    startPointerY: number;
    startCenterX: number;
    startCenterY: number;
  } | null>(null);
  const resizeStateRef = useRef<{
    pointerId: number;
    handle: ResizeHandle;
    startPointerX: number;
    startPointerY: number;
    startCenterX: number;
    startCenterY: number;
    startWidth: number;
    startHeight: number;
    aspectLockActive: boolean;
  } | null>(null);
  const rotationStateRef = useRef<{
    pointerId: number;
    startRotation: number;
    startPointerAngle: number;
    centerX: number;
    centerY: number;
  } | null>(null);

  const getPreviewCoordinatePointFromClient = (clientX: number, clientY: number) => {
    const previewNode = previewImageRef.current;
    if (
      !previewNode ||
      !previewDisplaySize.width ||
      !previewDisplaySize.height ||
      !previewCoordinateSize.width ||
      !previewCoordinateSize.height
    ) {
      return null;
    }

    const rect = previewNode.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / previewDisplaySize.width) * previewCoordinateSize.width,
      y: ((clientY - rect.top) / previewDisplaySize.height) * previewCoordinateSize.height
    };
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const key = event.key.toLowerCase();
      if (
        key === "escape" &&
        isWatermarkSelected &&
        !dragStateRef.current &&
        !resizeStateRef.current &&
        !rotationStateRef.current
      ) {
        event.preventDefault();
        setIsWatermarkSelected(false);
        return;
      }

      const hasModifier = isMac ? event.metaKey : event.ctrlKey;
      const wantsUndo = key === "z" && !event.shiftKey;
      const wantsRedo = (key === "z" && event.shiftKey) || (!isMac && key === "y");
      if ((!wantsUndo && !wantsRedo) || !hasModifier) {
        const isArrowKey =
          key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright";
        if (
          !isArrowKey ||
          !isWatermarkSelected ||
          !previewCoordinateSize.width ||
          !previewCoordinateSize.height ||
          dragStateRef.current ||
          resizeStateRef.current ||
          rotationStateRef.current
        ) {
          return;
        }

        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const currentCenter = getWatermarkCenterPoint(
          currentSnapshotRef.current.settings,
          previewCoordinateSize.width,
          previewCoordinateSize.height
        );
        const nextCenter = {
          x:
            key === "arrowleft"
              ? Math.max(0, currentCenter.x - step)
              : key === "arrowright"
                ? Math.min(previewCoordinateSize.width, currentCenter.x + step)
                : currentCenter.x,
          y:
            key === "arrowup"
              ? Math.max(0, currentCenter.y - step)
              : key === "arrowdown"
                ? Math.min(previewCoordinateSize.height, currentCenter.y + step)
                : currentCenter.y
        };

        commitSnapshot((current) => ({
          ...current,
          settings: {
            ...current.settings,
            placementMode: "free",
            position: null,
            freeCenterXRatio: nextCenter.x / previewCoordinateSize.width,
            freeCenterYRatio: nextCenter.y / previewCoordinateSize.height
          }
        }));
        return;
      }

      event.preventDefault();
      if (wantsUndo) {
        undo();
        return;
      }

      redo();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [commitSnapshot, currentSnapshotRef, isWatermarkSelected, previewCoordinateSize, redo, undo]);

  useEffect(() => {
    const onPointerEnd = () => {
      endContinuousEdit();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (
        event.key.startsWith("Arrow") ||
        event.key === "Home" ||
        event.key === "End" ||
        event.key === "PageUp" ||
        event.key === "PageDown"
      ) {
        endContinuousEdit();
      }
    };

    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onPointerEnd);

    return () => {
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onPointerEnd);
    };
  }, [endContinuousEdit]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (
        !previewDisplaySize.width ||
        !previewDisplaySize.height ||
        !previewCoordinateSize.width ||
        !previewCoordinateSize.height
      ) {
        return;
      }

      const scaleX = previewCoordinateSize.width / previewDisplaySize.width;
      const scaleY = previewCoordinateSize.height / previewDisplaySize.height;
      const rotationState = rotationStateRef.current;
      if (rotationState && rotationState.pointerId === event.pointerId) {
        const pointerCoordinate = getPreviewCoordinatePointFromClient(event.clientX, event.clientY);
        if (!pointerCoordinate) {
          return;
        }

        const currentPointerAngle = getAngleFromPoint(
          rotationState.centerX,
          rotationState.centerY,
          pointerCoordinate.x,
          pointerCoordinate.y
        );
        const nextRotation = normalizeRotationDegrees(
          rotationState.startRotation + (currentPointerAngle - rotationState.startPointerAngle)
        );
        const nextSettings: WatermarkSettings = {
          ...currentSnapshotRef.current.settings,
          rotation: event.shiftKey ? snapRotationDegrees(nextRotation, 15) : nextRotation
        };

        currentSnapshotRef.current = {
          ...currentSnapshotRef.current,
          settings: nextSettings
        };
        flushSync(() => {
          setSettings(nextSettings);
        });
        return;
      }

      const resizeState = resizeStateRef.current;
      if (resizeState && resizeState.pointerId === event.pointerId) {
        const wantsAspectLock =
          (event.metaKey || event.ctrlKey) &&
          isCornerResizeHandle(resizeState.handle) &&
          resizeState.startWidth > 0 &&
          resizeState.startHeight > 0;
        if (wantsAspectLock !== resizeState.aspectLockActive) {
          const currentCenter = getWatermarkCenterPoint(
            currentSnapshotRef.current.settings,
            previewCoordinateSize.width,
            previewCoordinateSize.height
          );
          const currentBaseSize = getWatermarkBaseSize(
            currentSnapshotRef.current.settings,
            watermarkNaturalSize.width,
            watermarkNaturalSize.height,
            previewCoordinateSize.width,
            previewCoordinateSize.height
          );

          resizeStateRef.current = {
            ...resizeState,
            startPointerX: event.clientX,
            startPointerY: event.clientY,
            startCenterX: currentCenter.x,
            startCenterY: currentCenter.y,
            startWidth: currentBaseSize.width,
            startHeight: currentBaseSize.height,
            aspectLockActive: wantsAspectLock
          };
          return;
        }

        const nextBox = resizeRotatedWatermarkBoxFromHandle(
          resizeState.handle,
          resizeState.startCenterX,
          resizeState.startCenterY,
          resizeState.startWidth,
          resizeState.startHeight,
          (event.clientX - resizeState.startPointerX) * scaleX,
          (event.clientY - resizeState.startPointerY) * scaleY,
          currentSnapshotRef.current.settings.rotation,
          wantsAspectLock,
          wantsAspectLock ? resizeState.startWidth / resizeState.startHeight : 1,
          24,
          24
        );
        const nextSettings: WatermarkSettings = {
          ...currentSnapshotRef.current.settings,
          placementMode: "free",
          position: null,
          freeCenterXRatio: nextBox.centerX / previewCoordinateSize.width,
          freeCenterYRatio: nextBox.centerY / previewCoordinateSize.height,
          freeWidthRatio: nextBox.width / previewCoordinateSize.width,
          freeHeightRatio: nextBox.height / previewCoordinateSize.height
        };

        currentSnapshotRef.current = {
          ...currentSnapshotRef.current,
          settings: nextSettings
        };
        flushSync(() => {
          setSettings(nextSettings);
        });
        return;
      }

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const nextCenter = snapWatermarkCenterPoint(
        dragState.startCenterX + (event.clientX - dragState.startPointerX) * scaleX,
        dragState.startCenterY + (event.clientY - dragState.startPointerY) * scaleY,
        previewCoordinateSize.width,
        previewCoordinateSize.height,
        24
      );

      const nextSettings: WatermarkSettings = {
        ...currentSnapshotRef.current.settings,
        placementMode: "free",
        position: null,
        freeCenterXRatio: nextCenter.x / previewCoordinateSize.width,
        freeCenterYRatio: nextCenter.y / previewCoordinateSize.height
      };

      currentSnapshotRef.current = {
        ...currentSnapshotRef.current,
        settings: nextSettings
      };
      flushSync(() => {
        setSettings(nextSettings);
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      if (rotationStateRef.current && rotationStateRef.current.pointerId === event.pointerId) {
        rotationStateRef.current = null;
        setIsWatermarkDragging(false);
        return;
      }
      if (resizeStateRef.current && resizeStateRef.current.pointerId === event.pointerId) {
        resizeStateRef.current = null;
        setIsWatermarkDragging(false);
        return;
      }
      if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) {
        return;
      }

      dragStateRef.current = null;
      setIsWatermarkDragging(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [
    currentSnapshotRef,
    previewCoordinateSize,
    previewDisplaySize,
    previewImageRef,
    setSettings,
    watermarkNaturalSize
  ]);

  const clearWatermarkSelection = () => {
    if (!dragStateRef.current && !resizeStateRef.current && !rotationStateRef.current) {
      setIsWatermarkSelected(false);
    }
  };

  const onResizeHandlePointerDown = (handle: ResizeHandle, event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (
      !previewCoordinateSize.width ||
      !previewCoordinateSize.height ||
      !watermarkNaturalSize.width ||
      !watermarkNaturalSize.height
    ) {
      return;
    }

    setIsWatermarkSelected(true);
    setIsWatermarkDragging(true);
    beginContinuousEdit();
    const currentCenter = getWatermarkCenterPoint(
      currentSnapshotRef.current.settings,
      previewCoordinateSize.width,
      previewCoordinateSize.height
    );
    const currentBaseSize = getWatermarkBaseSize(
      currentSnapshotRef.current.settings,
      watermarkNaturalSize.width,
      watermarkNaturalSize.height,
      previewCoordinateSize.width,
      previewCoordinateSize.height
    );

    currentSnapshotRef.current = {
      ...currentSnapshotRef.current,
      settings: {
        ...currentSnapshotRef.current.settings,
        placementMode: "free",
        position: null,
        freeCenterXRatio: currentCenter.x / previewCoordinateSize.width,
        freeCenterYRatio: currentCenter.y / previewCoordinateSize.height,
        freeWidthRatio: currentBaseSize.width / previewCoordinateSize.width,
        freeHeightRatio: currentBaseSize.height / previewCoordinateSize.height
      }
    };
    setSettings(currentSnapshotRef.current.settings);
    resizeStateRef.current = {
      pointerId: event.pointerId,
      handle,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startCenterX: currentCenter.x,
      startCenterY: currentCenter.y,
      startWidth: currentBaseSize.width,
      startHeight: currentBaseSize.height,
      aspectLockActive: (event.metaKey || event.ctrlKey) && isCornerResizeHandle(handle)
    };
  };

  const onRotateHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (
      !previewCoordinateSize.width ||
      !previewCoordinateSize.height ||
      !watermarkNaturalSize.width ||
      !watermarkNaturalSize.height
    ) {
      return;
    }

    const currentCenter = getWatermarkCenterPoint(
      currentSnapshotRef.current.settings,
      previewCoordinateSize.width,
      previewCoordinateSize.height
    );
    const pointerCoordinate = getPreviewCoordinatePointFromClient(event.clientX, event.clientY);
    if (!pointerCoordinate) {
      return;
    }

    setIsWatermarkSelected(true);
    setIsWatermarkDragging(true);
    beginContinuousEdit();
    rotationStateRef.current = {
      pointerId: event.pointerId,
      startRotation: currentSnapshotRef.current.settings.rotation,
      startPointerAngle: getAngleFromPoint(
        currentCenter.x,
        currentCenter.y,
        pointerCoordinate.x,
        pointerCoordinate.y
      ),
      centerX: currentCenter.x,
      centerY: currentCenter.y
    };
  };

  const onWatermarkPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (
      !previewCoordinateSize.width ||
      !previewCoordinateSize.height ||
      !watermarkNaturalSize.width ||
      !watermarkNaturalSize.height
    ) {
      return;
    }

    setIsWatermarkSelected(true);
    setIsWatermarkDragging(true);
    beginContinuousEdit();
    const currentCenter = getWatermarkCenterPoint(
      currentSnapshotRef.current.settings,
      previewCoordinateSize.width,
      previewCoordinateSize.height
    );

    currentSnapshotRef.current = {
      ...currentSnapshotRef.current,
      settings: {
        ...currentSnapshotRef.current.settings,
        placementMode: "free",
        position: null,
        freeCenterXRatio: currentCenter.x / previewCoordinateSize.width,
        freeCenterYRatio: currentCenter.y / previewCoordinateSize.height
      }
    };
    setSettings(currentSnapshotRef.current.settings);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startCenterX: currentCenter.x,
      startCenterY: currentCenter.y
    };
  };

  return {
    isWatermarkHovered,
    isWatermarkSelected,
    isWatermarkDragging,
    setIsWatermarkHovered,
    clearWatermarkSelection,
    onResizeHandlePointerDown,
    onRotateHandlePointerDown,
    onWatermarkPointerDown
  };
}
