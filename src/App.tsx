import { useMemo } from "react";
import { InputFilesPanel } from "./components/InputFilesPanel";
import { OutputPanel } from "./components/OutputPanel";
import { PreviewPane } from "./components/PreviewPane";
import { WatermarkPanel } from "./components/WatermarkPanel";
import { useEditableStateHistory } from "./hooks/useEditableStateHistory";
import { useFileSelectionActions } from "./hooks/useFileSelectionActions";
import { useOutputSettingsActions } from "./hooks/useOutputSettingsActions";
import { useProcessingState } from "./hooks/useProcessingState";
import { usePreviewState } from "./hooks/usePreviewState";
import { useWatermarkInteraction } from "./hooks/useWatermarkInteraction";
import { useWatermarkSettingsActions } from "./hooks/useWatermarkSettingsActions";
import type { WatermarkSettings } from "./shared/types";
import { getOutputSummary } from "./shared/outputSummary";
import {
  getLongestEdge,
  getLongestEdgePxFromRatio
} from "./shared/watermarkSizing";
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

function App() {
  const {
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
  } = useEditableStateHistory(INITIAL_SETTINGS);
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
  const {
    openInputPicker,
    onDropInputFiles,
    openWatermarkPicker,
    onDropWatermarkFile,
    removeInputFile
  } = useFileSelectionActions({
    previewCoordinateSize,
    commitSnapshot
  });
  const {
    openOutputFolderPicker,
    clearOutputDirectory,
    onOutputDirectoryChange,
    onSuffixChange
  } = useOutputSettingsActions({
    commitSnapshot
  });

  const outputSummary = getOutputSummary(settings);
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
  const {
    updateNumericSetting,
    onWidthPxChange,
    onHeightPxChange,
    onTogglePreserveAspectRatio,
    onResetOriginalAspectRatio,
    onSelectPosition
  } = useWatermarkSettingsActions({
    settings,
    watermarkNaturalSize,
    previewCoordinateSize,
    renderedWatermarkSize,
    sizeControlMax,
    commitSnapshot,
    updateSettingsDuringContinuousEdit
  });

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
          onTogglePreserveAspectRatio={onTogglePreserveAspectRatio}
          onResetOriginalAspectRatio={onResetOriginalAspectRatio}
          onSelectPosition={onSelectPosition}
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
