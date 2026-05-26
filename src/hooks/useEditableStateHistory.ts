import { useEffect, useRef, useState, type SetStateAction } from "react";
import type { InputFile, WatermarkLayer, WatermarkSettings } from "../shared/types";
import {
  applyRedo,
  applyUndo,
  areSnapshotsEqual,
  cloneSnapshot,
  commitContinuousEdit,
  createEmptyHistoryState,
  type EditableStateSnapshot
} from "../shared/history";

export function useEditableStateHistory(initialSettings: WatermarkSettings) {
  const [inputFiles, setInputFiles] = useState<InputFile[]>([]);
  const [watermarkFile, setWatermarkFile] = useState<InputFile | null>(null);
  const [settings, setSettingsState] = useState(initialSettings);
  const [watermarkLayers, setWatermarkLayers] = useState<WatermarkLayer[]>([]);
  const [activeWatermarkLayerId, setActiveWatermarkLayerId] = useState<string | null>(null);
  const [selectedPreviewPath, setSelectedPreviewPath] = useState("");
  const pendingContinuousEditRef = useRef<EditableStateSnapshot | null>(null);
  const historyRef = useRef(createEmptyHistoryState());
  const currentSnapshotRef = useRef<EditableStateSnapshot>({
    inputFiles: [],
    watermarkFile: null,
    settings: initialSettings,
    watermarkLayers: [],
    activeWatermarkLayerId: null,
    selectedPreviewPath: ""
  });

  const getActiveWatermarkLayer = (snapshot: EditableStateSnapshot) =>
    snapshot.activeWatermarkLayerId
      ? snapshot.watermarkLayers.find((layer) => layer.id === snapshot.activeWatermarkLayerId) ??
        null
      : null;

  const reconcileActiveLayer = (snapshot: EditableStateSnapshot): EditableStateSnapshot => {
    const activeLayer = getActiveWatermarkLayer(snapshot);
    if (!activeLayer) {
      return snapshot;
    }

    const nextWatermarkLayers = snapshot.watermarkLayers.map((layer) =>
      layer.id === activeLayer.id
        ? {
            ...layer,
            settings: { ...snapshot.settings }
          }
        : layer
    );

    return {
      ...snapshot,
      watermarkFile: activeLayer.file,
      settings: { ...snapshot.settings },
      watermarkLayers: nextWatermarkLayers,
      activeWatermarkLayerId: activeLayer.id
    };
  };

  const applySnapshot = (snapshot: EditableStateSnapshot) => {
    const nextSnapshot = reconcileActiveLayer(snapshot);
    const activeLayer = getActiveWatermarkLayer(nextSnapshot);

    setInputFiles(nextSnapshot.inputFiles);
    setWatermarkFile(activeLayer?.file ?? nextSnapshot.watermarkFile);
    setSettingsState(activeLayer ? { ...activeLayer.settings } : { ...nextSnapshot.settings });
    setWatermarkLayers(nextSnapshot.watermarkLayers);
    setActiveWatermarkLayerId(nextSnapshot.activeWatermarkLayerId);
    setSelectedPreviewPath(nextSnapshot.selectedPreviewPath);
  };

  const applyActiveLayerSettings = (nextSettings: WatermarkSettings) => {
    const nextSnapshot = reconcileActiveLayer({
      ...currentSnapshotRef.current,
      settings: nextSettings
    });

    currentSnapshotRef.current = cloneSnapshot(nextSnapshot);
    setSettingsState(nextSettings);
    setWatermarkFile(getActiveWatermarkLayer(nextSnapshot)?.file ?? null);
    setWatermarkLayers(nextSnapshot.watermarkLayers);
    setActiveWatermarkLayerId(nextSnapshot.activeWatermarkLayerId);
  };

  const syncActiveWatermarkLayer = (snapshot: EditableStateSnapshot, activeLayerId: string | null) => {
    const activeLayer = activeLayerId
      ? snapshot.watermarkLayers.find((layer) => layer.id === activeLayerId) ?? null
      : null;

    setWatermarkFile(activeLayer?.file ?? null);
    setSettingsState(activeLayer ? { ...activeLayer.settings } : { ...initialSettings });
    setActiveWatermarkLayerId(activeLayer?.id ?? null);
    currentSnapshotRef.current = cloneSnapshot({
      ...snapshot,
      watermarkFile: activeLayer?.file ?? null,
      settings: activeLayer ? { ...activeLayer.settings } : { ...initialSettings },
      activeWatermarkLayerId: activeLayer?.id ?? null
    });
  };

  const commitSnapshot = (updater: (current: EditableStateSnapshot) => EditableStateSnapshot) => {
    const current = currentSnapshotRef.current;
    const next = reconcileActiveLayer(updater(current));

    if (areSnapshotsEqual(current, next)) {
      return;
    }

    historyRef.current.past.push(cloneSnapshot(current));
    if (historyRef.current.past.length > 100) {
      historyRef.current.past.shift();
    }
    historyRef.current.future = [];
    currentSnapshotRef.current = cloneSnapshot(next);
    applySnapshot(next);
  };

  const undo = () => {
    const previous = applyUndo(historyRef.current, currentSnapshotRef.current);
    if (!previous) {
      return;
    }

    currentSnapshotRef.current = cloneSnapshot(previous);
    applySnapshot(previous);
  };

  const redo = () => {
    const next = applyRedo(historyRef.current, currentSnapshotRef.current);
    if (!next) {
      return;
    }

    currentSnapshotRef.current = cloneSnapshot(next);
    applySnapshot(next);
  };

  const beginContinuousEdit = () => {
    if (!pendingContinuousEditRef.current) {
      pendingContinuousEditRef.current = cloneSnapshot(currentSnapshotRef.current);
    }
  };

  const updateSettingsDuringContinuousEdit = (settingsPatch: Partial<WatermarkSettings>) => {
    if (!pendingContinuousEditRef.current) {
      return false;
    }

    const nextSettings = {
      ...currentSnapshotRef.current.settings,
      ...settingsPatch
    };
    applyActiveLayerSettings(nextSettings);
    return true;
  };

  const endContinuousEdit = () => {
    const pendingSnapshot = pendingContinuousEditRef.current;
    if (!pendingSnapshot) {
      return;
    }

    pendingContinuousEditRef.current = null;
    commitContinuousEdit(historyRef.current, pendingSnapshot, currentSnapshotRef.current);
  };

  const activateWatermarkLayer = (layerId: string) => {
    const current = currentSnapshotRef.current;
    syncActiveWatermarkLayer(current, layerId);
  };

  const duplicateWatermarkLayer = (layerId: string) => {
    commitSnapshot((current) => {
      const sourceIndex = current.watermarkLayers.findIndex((layer) => layer.id === layerId);
      if (sourceIndex < 0) {
        return current;
      }

      const sourceLayer = current.watermarkLayers[sourceIndex];
      const nextLayer = {
        ...sourceLayer,
        id: `watermark-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: { ...sourceLayer.file },
        settings: { ...sourceLayer.settings },
        previewPayload: {
          ...sourceLayer.previewPayload,
          data: new Uint8Array(sourceLayer.previewPayload.data)
        },
        naturalSize: { ...sourceLayer.naturalSize }
      };
      const nextLayers = [
        ...current.watermarkLayers.slice(0, sourceIndex + 1),
        nextLayer,
        ...current.watermarkLayers.slice(sourceIndex + 1)
      ];

      return {
        ...current,
        watermarkLayers: nextLayers,
        activeWatermarkLayerId: nextLayer.id,
        watermarkFile: nextLayer.file,
        settings: { ...nextLayer.settings }
      };
    });
  };

  const moveWatermarkLayer = (layerId: string, direction: -1 | 1) => {
    commitSnapshot((current) => {
      const sourceIndex = current.watermarkLayers.findIndex((layer) => layer.id === layerId);
      const targetIndex = sourceIndex + direction;
      if (
        sourceIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= current.watermarkLayers.length
      ) {
        return current;
      }

      const nextLayers = [...current.watermarkLayers];
      const [movedLayer] = nextLayers.splice(sourceIndex, 1);
      nextLayers.splice(targetIndex, 0, movedLayer);

      return {
        ...current,
        watermarkLayers: nextLayers,
        activeWatermarkLayerId: current.activeWatermarkLayerId,
        watermarkFile:
          nextLayers.find((layer) => layer.id === current.activeWatermarkLayerId)?.file ??
          current.watermarkFile,
        settings:
          nextLayers.find((layer) => layer.id === current.activeWatermarkLayerId)?.settings ??
          current.settings
      };
    });
  };

  const toggleWatermarkLayerVisibility = (layerId: string) => {
    commitSnapshot((current) => ({
      ...current,
      watermarkLayers: current.watermarkLayers.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              visible: !layer.visible
            }
          : layer
      )
    }));
  };

  const removeWatermarkLayer = (layerId: string) => {
    commitSnapshot((current) => {
      const nextLayers = current.watermarkLayers.filter((layer) => layer.id !== layerId);
      const nextActiveLayer = nextLayers.find((layer) => layer.id === current.activeWatermarkLayerId) ?? nextLayers[0] ?? null;

      return {
        ...current,
        watermarkLayers: nextLayers,
        activeWatermarkLayerId: nextActiveLayer?.id ?? null,
        watermarkFile: nextActiveLayer?.file ?? null,
        settings: nextActiveLayer ? { ...nextActiveLayer.settings } : { ...initialSettings }
      };
    });
  };

  useEffect(() => {
    currentSnapshotRef.current = cloneSnapshot(reconcileActiveLayer({
      inputFiles,
      watermarkFile,
      settings,
      watermarkLayers,
      activeWatermarkLayerId,
      selectedPreviewPath
    }));
  }, [inputFiles, watermarkFile, settings, watermarkLayers, activeWatermarkLayerId, selectedPreviewPath]);

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
  }, []);

  return {
    inputFiles,
    watermarkFile,
    settings,
    watermarkLayers,
    activeWatermarkLayerId,
    selectedPreviewPath,
    setSettings: (value: SetStateAction<WatermarkSettings>) => {
      const nextSettings =
        typeof value === "function" ? value(currentSnapshotRef.current.settings) : value;
      applyActiveLayerSettings(nextSettings);
    },
    setSelectedPreviewPath,
    setWatermarkLayers,
    setActiveWatermarkLayerId,
    currentSnapshotRef,
    commitSnapshot,
    beginContinuousEdit,
    updateSettingsDuringContinuousEdit,
    endContinuousEdit,
    activateWatermarkLayer,
    duplicateWatermarkLayer,
    moveWatermarkLayer,
    toggleWatermarkLayerVisibility,
    removeWatermarkLayer,
    undo,
    redo
  };
}
