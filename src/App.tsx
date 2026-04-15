import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { InputFilesPanel } from "./components/InputFilesPanel";
import { OutputPanel } from "./components/OutputPanel";
import { PreviewPane } from "./components/PreviewPane";
import { WatermarkPanel } from "./components/WatermarkPanel";
import {
  createObjectUrlFromPreview,
  readImageNaturalSize
} from "./hooks/previewStateHelpers";
import { useProcessingState } from "./hooks/useProcessingState";
import { usePreviewState } from "./hooks/usePreviewState";
import { useWatermarkInteraction } from "./hooks/useWatermarkInteraction";
import type { InputFile, WatermarkSettings } from "./shared/types";
import {
  applyRedo,
  applyUndo,
  areSnapshotsEqual,
  cloneSnapshot,
  commitContinuousEdit,
  createEmptyHistoryState,
  type EditableStateSnapshot
} from "./shared/history";
import {
  getCanvasLongestEdge,
  getLongestEdge,
  getLongestEdgePxFromRatio,
  getLongestEdgeRatio,
  getSizeFromLongestEdge,
  resizeFromWidthPreservingAspectRatio
} from "./shared/watermarkSizing";
import { resizeBoxFromHeight, resizeBoxFromWidth } from "./shared/watermarkSizing";
import {
  getWatermarkBaseSize,
  getWatermarkCenterPoint,
  getWatermarkMetrics,
  type ResizeHandle
} from "./shared/watermarkGeometry";

const INITIAL_SETTINGS: WatermarkSettings = {
  opacity: 50,
  sizeRatio: 280 / 842,
  preserveAspectRatio: true,
  rotation: 0,
  placementMode: "preset",
  position: "C",
  freeCenterXRatio: null,
  freeCenterYRatio: null,
  freeWidthRatio: null,
  freeHeightRatio: null,
  suffix: "_wm",
  outputDirectory: "",
  overwriteOriginal: false
};

const uniqueByPath = (files: InputFile[]) => {
  const map = new Map<string, InputFile>();
  for (const file of files) {
    map.set(file.path, file);
  }
  return [...map.values()];
};

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

function App() {
  const [inputFiles, setInputFiles] = useState<InputFile[]>([]);
  const [watermarkFile, setWatermarkFile] = useState<InputFile | null>(null);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [selectedPreviewPath, setSelectedPreviewPath] = useState("");
  const pendingContinuousEditRef = useRef<EditableStateSnapshot | null>(null);
  const historyRef = useRef(createEmptyHistoryState());
  const currentSnapshotRef = useRef<EditableStateSnapshot>({
    inputFiles: [],
    watermarkFile: null,
    settings: INITIAL_SETTINGS,
    selectedPreviewPath: ""
  });
  const {
    selectedPreviewFile,
    previewKind,
    previewBaseUrl,
    watermarkPreviewUrl,
    watermarkNaturalSize,
    previewCoordinateSize,
    previewDisplaySize,
    pdfPageCount,
    pdfPreviewPage,
    previewImageRef,
    onPreviewImageLoad,
    onPreviousPdfPage,
    onNextPdfPage
  } = usePreviewState({
    inputFiles,
    selectedPreviewPath,
    setSelectedPreviewPath,
    watermarkFile
  });
  const {
    isProcessing,
    statusMessage,
    lastResult,
    startProcessing
  } = useProcessingState({
    inputFiles,
    watermarkFile,
    settings
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

  const {
    isWatermarkHovered,
    isWatermarkSelected,
    isWatermarkDragging,
    setIsWatermarkHovered,
    clearWatermarkSelection,
    onResizeHandlePointerDown,
    onRotateHandlePointerDown,
    onWatermarkPointerDown
  } = useWatermarkInteraction({
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
  });

  const willOverwriteOriginal = settings.suffix.trim() === "";
  const outputSummary = willOverwriteOriginal
    ? "접미사가 비어 있으면 원본 파일에 직접 덮어씁니다."
    : settings.outputDirectory
      ? settings.outputDirectory
      : "출력 폴더를 비워두면 원본 파일과 같은 폴더에 저장합니다.";
  const renderedWatermarkSize = useMemo(
    () =>
      getWatermarkBaseSize(
        settings,
        watermarkNaturalSize.width,
        watermarkNaturalSize.height,
        previewCoordinateSize.width,
        previewCoordinateSize.height
      ),
    [previewCoordinateSize, settings, watermarkNaturalSize]
  );
  const displayedSizePx = useMemo(
    () => getLongestEdge(renderedWatermarkSize.width, renderedWatermarkSize.height),
    [renderedWatermarkSize]
  );
  const sizeControlMax = useMemo(
    () =>
      Math.max(
        1000,
        displayedSizePx,
        previewCoordinateSize.width,
        previewCoordinateSize.height,
        getLongestEdge(watermarkNaturalSize.width, watermarkNaturalSize.height)
      ),
    [displayedSizePx, previewCoordinateSize, watermarkNaturalSize]
  );

  const collectDroppedPaths = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    return Array.from(event.dataTransfer.files)
      .map((file) => window.watermarkApi.getPathForFile(file))
      .filter(Boolean);
  };

  const addInputFiles = async (incoming: InputFile[]) => {
    if (!incoming.length) {
      return;
    }

    commitSnapshot((current) => {
      const nextInputFiles = uniqueByPath([...current.inputFiles, ...incoming]);
      return {
        ...current,
        inputFiles: nextInputFiles,
        selectedPreviewPath: current.selectedPreviewPath || incoming[0]?.path || ""
      };
    });
  };

  const onDropInputFiles = async (event: DragEvent<HTMLElement>) => {
    const paths = await collectDroppedPaths(event);
    const normalized = await window.watermarkApi.normalizeDroppedFiles(paths);
    await addInputFiles(normalized);
  };

  const onDropWatermarkFile = async (event: DragEvent<HTMLElement>) => {
    const paths = await collectDroppedPaths(event);
    const normalized = await window.watermarkApi.normalizeDroppedFiles(paths);
    const imageFile = normalized.find((file) => file.kind === "image") ?? null;
    if (!imageFile) {
      return;
    }

    await selectWatermarkFile(imageFile);
  };

  const openInputPicker = async () => {
    const files = await window.watermarkApi.pickInputFiles();
    await addInputFiles(files);
  };

  const openWatermarkPicker = async () => {
    const file = await window.watermarkApi.pickWatermarkFile();
    if (file?.kind === "image") {
      await selectWatermarkFile(file);
    }
  };

  const selectWatermarkFile = async (file: InputFile) => {
    const previewPayload = await window.watermarkApi.readPreview(file.path);
    const objectUrl = createObjectUrlFromPreview(previewPayload);

    try {
      const naturalSize = await readImageNaturalSize(objectUrl);
      const longestEdgePx = getLongestEdge(naturalSize.width, naturalSize.height);
      const canvasLongestEdge =
        getCanvasLongestEdge(previewCoordinateSize.width, previewCoordinateSize.height) || longestEdgePx;
      const sizeRatio = getLongestEdgeRatio(longestEdgePx, canvasLongestEdge, canvasLongestEdge);

      commitSnapshot((current) => ({
        ...current,
        watermarkFile: file,
        settings: {
          ...current.settings,
          opacity: 50,
          sizeRatio,
          placementMode: "preset",
          position: "C",
          freeCenterXRatio: null,
          freeCenterYRatio: null,
          freeWidthRatio: null,
          freeHeightRatio: null
        }
      }));
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const openOutputFolderPicker = async () => {
    const folder = await window.watermarkApi.pickOutputFolder();
    if (folder) {
      commitSnapshot((current) => ({
        ...current,
        settings: {
          ...current.settings,
          outputDirectory: folder,
          overwriteOriginal: false
        }
      }));
    }
  };

  const updateNumericSetting = (key: "opacity" | "sizePx" | "rotation", value: string) => {
    const max = key === "opacity" ? 100 : key === "rotation" ? 360 : sizeControlMax;
    const nextValue = clamp(Number(value), 0, max);
    const currentCenter = getWatermarkCenterPoint(
      settings,
      previewCoordinateSize.width,
      previewCoordinateSize.height
    );
    const nextSettingsPatch =
      key === "sizePx"
        ? (() => {
            if (!settings.preserveAspectRatio) {
              return null;
            }

            const currentWidth = renderedWatermarkSize.width;
            const currentHeight = renderedWatermarkSize.height;
            const currentLongestEdge = getLongestEdge(currentWidth, currentHeight);
            const scaleFactor = currentLongestEdge > 0 ? nextValue / currentLongestEdge : 0;
            const nextSize =
              currentLongestEdge > 0
                ? {
                    width: currentWidth * scaleFactor,
                    height: currentHeight * scaleFactor
                  }
                : getSizeFromLongestEdge(
                    watermarkNaturalSize.width,
                    watermarkNaturalSize.height,
                    nextValue
                  );

            return {
              sizeRatio: getLongestEdgeRatio(
                nextValue,
                previewCoordinateSize.width,
                previewCoordinateSize.height
              ),
              placementMode: "free" as const,
              position: null,
              freeCenterXRatio:
                previewCoordinateSize.width > 0 ? currentCenter.x / previewCoordinateSize.width : 0,
              freeCenterYRatio:
                previewCoordinateSize.height > 0
                  ? currentCenter.y / previewCoordinateSize.height
                  : 0,
              freeWidthRatio:
                previewCoordinateSize.width > 0 ? nextSize.width / previewCoordinateSize.width : 0,
              freeHeightRatio:
                previewCoordinateSize.height > 0 ? nextSize.height / previewCoordinateSize.height : 0
            };
          })()
        : { [key]: nextValue };

    if (!nextSettingsPatch) {
      return;
    }

    if (pendingContinuousEditRef.current) {
      currentSnapshotRef.current = {
        ...currentSnapshotRef.current,
        settings: {
          ...currentSnapshotRef.current.settings,
          ...nextSettingsPatch
        }
      };
      setSettings((current) => ({ ...current, ...nextSettingsPatch }));
      return;
    }

    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...nextSettingsPatch
      }
    }));
  };

  const removeInputFile = (pathToRemove: string) => {
    commitSnapshot((current) => {
      const nextInputFiles = current.inputFiles.filter((file) => file.path !== pathToRemove);
      const nextSelectedPreviewPath =
        current.selectedPreviewPath === pathToRemove
          ? nextInputFiles[0]?.path ?? ""
          : current.selectedPreviewPath;

      return {
        ...current,
        inputFiles: nextInputFiles,
        selectedPreviewPath: nextSelectedPreviewPath
      };
    });
  };

  const onWidthPxChange = (value: string) => {
    const nextWidth = clamp(Number(value), 0, sizeControlMax);
    const currentWidth = renderedWatermarkSize.width;
    const currentHeight = renderedWatermarkSize.height;
    const resized = resizeBoxFromWidth(
      currentWidth,
      currentHeight,
      nextWidth,
      settings.preserveAspectRatio
    );
    const currentCenter = getWatermarkCenterPoint(
      settings,
      previewCoordinateSize.width,
      previewCoordinateSize.height
    );

    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        sizeRatio: getLongestEdgeRatio(
          getLongestEdge(resized.width, resized.height),
          previewCoordinateSize.width,
          previewCoordinateSize.height
        ),
        placementMode: "free",
        position: null,
        freeCenterXRatio:
          previewCoordinateSize.width > 0 ? currentCenter.x / previewCoordinateSize.width : 0,
        freeCenterYRatio:
          previewCoordinateSize.height > 0 ? currentCenter.y / previewCoordinateSize.height : 0,
        freeWidthRatio:
          previewCoordinateSize.width > 0 ? resized.width / previewCoordinateSize.width : 0,
        freeHeightRatio:
          previewCoordinateSize.height > 0 ? resized.height / previewCoordinateSize.height : 0
      }
    }));
  };

  const onHeightPxChange = (value: string) => {
    const nextHeight = clamp(Number(value), 0, sizeControlMax);
    const currentWidth = renderedWatermarkSize.width;
    const currentHeight = renderedWatermarkSize.height;
    const resized = resizeBoxFromHeight(
      currentWidth,
      currentHeight,
      nextHeight,
      settings.preserveAspectRatio
    );
    const currentCenter = getWatermarkCenterPoint(
      settings,
      previewCoordinateSize.width,
      previewCoordinateSize.height
    );

    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        sizeRatio: getLongestEdgeRatio(
          getLongestEdge(resized.width, resized.height),
          previewCoordinateSize.width,
          previewCoordinateSize.height
        ),
        placementMode: "free",
        position: null,
        freeCenterXRatio:
          previewCoordinateSize.width > 0 ? currentCenter.x / previewCoordinateSize.width : 0,
        freeCenterYRatio:
          previewCoordinateSize.height > 0 ? currentCenter.y / previewCoordinateSize.height : 0,
        freeWidthRatio:
          previewCoordinateSize.width > 0 ? resized.width / previewCoordinateSize.width : 0,
        freeHeightRatio:
          previewCoordinateSize.height > 0 ? resized.height / previewCoordinateSize.height : 0
      }
    }));
  };

  const clearOutputDirectory = () => {
    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        outputDirectory: ""
      }
    }));
  };

  const onOutputDirectoryChange = (event: ChangeEvent<HTMLInputElement>) => {
    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        outputDirectory: event.target.value,
        overwriteOriginal: false
      }
    }));
  };

  const onSuffixChange = (event: ChangeEvent<HTMLInputElement>) => {
    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        suffix: event.target.value
      }
    }));
  };

  const overlayStyle = useMemo(() => {
    if (
      !previewDisplaySize.width ||
      !previewDisplaySize.height ||
      !previewCoordinateSize.width ||
      !previewCoordinateSize.height ||
      !watermarkNaturalSize.width ||
      !watermarkNaturalSize.height
    ) {
      return undefined;
    }

    const metrics = getWatermarkMetrics(
      watermarkNaturalSize.width,
      watermarkNaturalSize.height,
      settings,
      previewCoordinateSize.width,
      previewCoordinateSize.height,
      settings.rotation
    );
    const anchorCenter = getWatermarkCenterPoint(
      settings,
      previewCoordinateSize.width,
      previewCoordinateSize.height
    );
    const displayScaleX = previewDisplaySize.width / previewCoordinateSize.width;
    const displayScaleY = previewDisplaySize.height / previewCoordinateSize.height;

    return {
      width: `${metrics.rotated.width * displayScaleX}px`,
      height: `${metrics.rotated.height * displayScaleY}px`,
      left: `${(anchorCenter.x - metrics.rotated.width / 2) * displayScaleX}px`,
      top: `${(anchorCenter.y - metrics.rotated.height / 2) * displayScaleY}px`,
      opacity: settings.opacity / 100
    };
  }, [
    previewDisplaySize,
    previewCoordinateSize,
    settings.opacity,
    settings.placementMode,
    settings.position,
    settings.freeCenterXRatio,
    settings.freeCenterYRatio,
    settings.freeWidthRatio,
    settings.freeHeightRatio,
    settings.rotation,
    settings.sizeRatio,
    watermarkNaturalSize
  ]);

  const overlayImageStyle = useMemo(() => {
    if (
      !previewDisplaySize.width ||
      !previewDisplaySize.height ||
      !previewCoordinateSize.width ||
      !previewCoordinateSize.height ||
      !watermarkNaturalSize.width ||
      !watermarkNaturalSize.height
    ) {
      return undefined;
    }

    const metrics = getWatermarkMetrics(
      watermarkNaturalSize.width,
      watermarkNaturalSize.height,
      settings,
      previewCoordinateSize.width,
      previewCoordinateSize.height,
      settings.rotation
    );
    const displayScaleX = previewDisplaySize.width / previewCoordinateSize.width;
    const displayScaleY = previewDisplaySize.height / previewCoordinateSize.height;

    return {
      width: `${metrics.base.width * displayScaleX}px`,
      height: `${metrics.base.height * displayScaleY}px`,
      transform: `translate(-50%, -50%) rotate(${settings.rotation}deg)`,
      transformOrigin: "center center",
      left: "50%",
      top: "50%"
    } as const;
  }, [
    previewCoordinateSize,
    previewDisplaySize,
    settings.rotation,
    settings.sizeRatio,
    settings.freeWidthRatio,
    settings.freeHeightRatio,
    watermarkNaturalSize
  ]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="hero">
          <h1>Batch Watermarker</h1>
          <p className="subtle">
            PDF와 이미지에 워터마크를 추가합니다.
          </p>
        </div>

        <InputFilesPanel
          inputFiles={inputFiles}
          selectedPreviewPath={selectedPreviewFile?.path ?? ""}
          onOpenInputPicker={openInputPicker}
          onDropInputFiles={onDropInputFiles}
          onSelectPreview={(path) =>
            commitSnapshot((current) => ({
              ...current,
              selectedPreviewPath: path
            }))
          }
          onRemoveInputFile={removeInputFile}
        />

        <WatermarkPanel
          settings={settings}
          watermarkFile={watermarkFile}
          sizeControlMax={sizeControlMax}
          displayedSizePx={displayedSizePx}
          renderedWidthPx={renderedWatermarkSize.width}
          renderedHeightPx={renderedWatermarkSize.height}
          onOpenWatermarkPicker={openWatermarkPicker}
          onDropWatermarkFile={onDropWatermarkFile}
          onBeginContinuousNumericEdit={beginContinuousEdit}
          onUpdateNumericSetting={updateNumericSetting}
          onWidthPxChange={onWidthPxChange}
          onHeightPxChange={onHeightPxChange}
          onTogglePreserveAspectRatio={(checked) =>
            commitSnapshot((current) => ({
              ...current,
              settings: {
                ...current.settings,
                preserveAspectRatio: checked
              }
            }))
          }
          onResetOriginalAspectRatio={() =>
            commitSnapshot((current) => {
              const nextSizing = resizeFromWidthPreservingAspectRatio(
                watermarkNaturalSize.width,
                watermarkNaturalSize.height,
                renderedWatermarkSize.width
              );

              return {
                ...current,
                settings: {
                  ...current.settings,
                  sizeRatio: getLongestEdgeRatio(
                    nextSizing.sizePx,
                    previewCoordinateSize.width,
                    previewCoordinateSize.height
                  ),
                  freeWidthRatio:
                    previewCoordinateSize.width > 0
                      ? nextSizing.width / previewCoordinateSize.width
                      : 0,
                  freeHeightRatio:
                    previewCoordinateSize.height > 0
                      ? nextSizing.height / previewCoordinateSize.height
                      : 0
                }
              };
            })
          }
          onSelectPosition={(position) =>
            commitSnapshot((current) => ({
              ...current,
              settings: {
                ...current.settings,
                placementMode: "preset",
                position,
                freeCenterXRatio: null,
                freeCenterYRatio: null
              }
            }))
          }
        />

        <OutputPanel
          settings={settings}
          outputSummary={outputSummary}
          isProcessing={isProcessing}
          statusMessage={statusMessage}
          lastResult={lastResult}
          onOpenOutputFolderPicker={openOutputFolderPicker}
          onClearOutputDirectory={clearOutputDirectory}
          onOutputDirectoryChange={onOutputDirectoryChange}
          onSuffixChange={onSuffixChange}
          onStartProcessing={startProcessing}
        />
      </aside>

      <PreviewPane
        selectedFileName={selectedPreviewFile?.name ?? "선택된 파일 없음"}
        previewKind={previewKind}
        pdfPageCount={pdfPageCount}
        pdfPreviewPage={pdfPreviewPage}
        previewBaseUrl={previewBaseUrl}
        watermarkPreviewUrl={watermarkPreviewUrl}
        overlayStyle={overlayStyle}
        overlayImageStyle={overlayImageStyle}
        isWatermarkHovered={isWatermarkHovered}
        isWatermarkSelected={isWatermarkSelected}
        isWatermarkDragging={isWatermarkDragging}
        previewImageRef={previewImageRef}
        onPreviousPdfPage={onPreviousPdfPage}
        onNextPdfPage={onNextPdfPage}
        onPreviewImageLoad={onPreviewImageLoad}
        onClearWatermarkSelection={clearWatermarkSelection}
        onWatermarkPointerEnter={() => setIsWatermarkHovered(true)}
        onWatermarkPointerLeave={() => setIsWatermarkHovered(false)}
        onResizeHandlePointerDown={onResizeHandlePointerDown}
        onRotateHandlePointerDown={onRotateHandlePointerDown}
        onWatermarkPointerDown={onWatermarkPointerDown}
      />
    </div>
  );
}

export default App;
