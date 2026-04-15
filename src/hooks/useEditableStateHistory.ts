import { useEffect, useRef, useState } from "react";
import type { InputFile, WatermarkSettings } from "../shared/types";
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
  const [settings, setSettings] = useState(initialSettings);
  const [selectedPreviewPath, setSelectedPreviewPath] = useState("");
  const pendingContinuousEditRef = useRef<EditableStateSnapshot | null>(null);
  const historyRef = useRef(createEmptyHistoryState());
  const currentSnapshotRef = useRef<EditableStateSnapshot>({
    inputFiles: [],
    watermarkFile: null,
    settings: initialSettings,
    selectedPreviewPath: ""
  });

  const applySnapshot = (snapshot: EditableStateSnapshot) => {
    setInputFiles(snapshot.inputFiles);
    setWatermarkFile(snapshot.watermarkFile);
    setSettings(snapshot.settings);
    setSelectedPreviewPath(snapshot.selectedPreviewPath);
  };

  const commitSnapshot = (updater: (current: EditableStateSnapshot) => EditableStateSnapshot) => {
    const current = currentSnapshotRef.current;
    const next = updater(current);

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

    currentSnapshotRef.current = {
      ...currentSnapshotRef.current,
      settings: {
        ...currentSnapshotRef.current.settings,
        ...settingsPatch
      }
    };
    setSettings((current) => ({ ...current, ...settingsPatch }));
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

  useEffect(() => {
    currentSnapshotRef.current = cloneSnapshot({
      inputFiles,
      watermarkFile,
      settings,
      selectedPreviewPath
    });
  }, [inputFiles, watermarkFile, settings, selectedPreviewPath]);

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
    selectedPreviewPath,
    setSettings,
    setSelectedPreviewPath,
    currentSnapshotRef,
    commitSnapshot,
    beginContinuousEdit,
    updateSettingsDuringContinuousEdit,
    endContinuousEdit,
    undo,
    redo
  };
}
