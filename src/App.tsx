import { useMemo, type ChangeEvent } from "react";
import { InputFilesPanel } from "./components/InputFilesPanel";
import { OutputPanel } from "./components/OutputPanel";
import { PreviewPane } from "./components/PreviewPane";
import { WatermarkPanel } from "./components/WatermarkPanel";
import { useEditableStateHistory } from "./hooks/useEditableStateHistory";
import { useFileSelectionActions } from "./hooks/useFileSelectionActions";
import { useProcessingState } from "./hooks/useProcessingState";
import { usePreviewState } from "./hooks/usePreviewState";
import { useWatermarkInteraction } from "./hooks/useWatermarkInteraction";
import type { WatermarkSettings } from "./shared/types";
import { getOutputSummary } from "./shared/outputSummary";
import {
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

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

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

    if (updateSettingsDuringContinuousEdit(nextSettingsPatch)) {
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
