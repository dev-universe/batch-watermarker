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
import {
  getActiveWatermarkLayerState,
  hydrateSnapshotFromActiveWatermarkLayer,
  persistActiveWatermarkLayerSettings
} from "../shared/watermarkLayerState";

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

  const applySnapshot = (snapshot: EditableStateSnapshot) => {
    const nextSnapshot = hydrateSnapshotFromActiveWatermarkLayer(snapshot, initialSettings);

    setInputFiles(nextSnapshot.inputFiles);
    setWatermarkFile(nextSnapshot.watermarkFile);
    setSettingsState({ ...nextSnapshot.settings });
    setWatermarkLayers(nextSnapshot.watermarkLayers);
    setActiveWatermarkLayerId(nextSnapshot.activeWatermarkLayerId);
    setSelectedPreviewPath(nextSnapshot.selectedPreviewPath);
  };

  const applyActiveLayerSettings = (nextSettings: WatermarkSettings) => {
    const nextSnapshot = persistActiveWatermarkLayerSettings({
      ...currentSnapshotRef.current,
      settings: nextSettings
    });

    currentSnapshotRef.current = cloneSnapshot(nextSnapshot);
    setSettingsState({ ...nextSnapshot.settings });
    setWatermarkFile(nextSnapshot.watermarkFile);
    setWatermarkLayers(nextSnapshot.watermarkLayers);
    setActiveWatermarkLayerId(nextSnapshot.activeWatermarkLayerId);
  };

  const syncActiveWatermarkLayer = (snapshot: EditableStateSnapshot, activeLayerId: string | null) => {
    const nextSnapshot = hydrateSnapshotFromActiveWatermarkLayer({
      ...persistActiveWatermarkLayerSettings(snapshot),
      activeWatermarkLayerId: activeLayerId
    }, initialSettings);

    setWatermarkFile(nextSnapshot.watermarkFile);
    setSettingsState({ ...nextSnapshot.settings });
    setWatermarkLayers(nextSnapshot.watermarkLayers);
    setActiveWatermarkLayerId(nextSnapshot.activeWatermarkLayerId);
    currentSnapshotRef.current = cloneSnapshot(nextSnapshot);
  };

  const commitSnapshot = (updater: (current: EditableStateSnapshot) => EditableStateSnapshot) => {
    const current = persistActiveWatermarkLayerSettings(currentSnapshotRef.current);
    const next = persistActiveWatermarkLayerSettings(updater(current));

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
        label: `${sourceLayer.label} 복제`,
        locked: sourceLayer.locked,
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

  const toggleWatermarkLayerLock = (layerId: string) => {
    commitSnapshot((current) => ({
      ...current,
      watermarkLayers: current.watermarkLayers.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              locked: !layer.locked
            }
          : layer
      )
    }));
  };

  const renameWatermarkLayer = (layerId: string, label: string) => {
    const trimmedLabel = label.trim();
    commitSnapshot((current) => ({
      ...current,
      watermarkLayers: current.watermarkLayers.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              label: trimmedLabel || layer.file.name
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
    currentSnapshotRef.current = cloneSnapshot(
      persistActiveWatermarkLayerSettings({
        inputFiles,
        watermarkFile,
        settings,
        watermarkLayers,
        activeWatermarkLayerId,
        selectedPreviewPath
      })
    );
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
    toggleWatermarkLayerLock,
    renameWatermarkLayer,
    removeWatermarkLayer,
    undo,
    redo
  };
}
