import { useMemo, type CSSProperties } from "react";
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
import {
  createWatermarkOverlayImageStyle,
  createWatermarkOverlayStyle
} from "./hooks/useWatermarkOverlayStyle";
import { useWatermarkSettingsActions } from "./hooks/useWatermarkSettingsActions";
import type { WatermarkSettings } from "./shared/types";
import { getOutputSummary } from "./shared/outputSummary";
import {
  getLongestEdge,
  getLongestEdgePxFromRatio
} from "./shared/watermarkSizing";
import {
  getWatermarkBaseSize
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
    watermarkLayers,
    activeWatermarkLayerId,
    selectedPreviewPath,
    setSettings,
    setSelectedPreviewPath,
    currentSnapshotRef,
    commitSnapshot,
    beginContinuousEdit,
    updateSettingsDuringContinuousEdit,
    endContinuousEdit,
    activateWatermarkLayer,
    duplicateWatermarkLayer,
    moveWatermarkLayer,
    toggleWatermarkLayerVisibility,
    renameWatermarkLayer,
    removeWatermarkLayer,
    undo,
    redo
  } = useEditableStateHistory(INITIAL_SETTINGS);
  const {
    selectedPreviewFile,
    previewKind,
    previewBaseUrl,
    watermarkLayerPreviews,
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
    watermarkLayers,
    activeWatermarkLayerId
  });
  const {
    isProcessing,
    statusMessage,
    lastResult,
    startProcessing
  } = useProcessingState({
    inputFiles,
    watermarkLayers,
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
    removeInputFile,
    selectPreviewFile
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
  const onWatermarkPointerEnter = () => setIsWatermarkHovered(true);
  const onWatermarkPointerLeave = () => setIsWatermarkHovered(false);
  const renderedWatermarkLayers = useMemo(
    () =>
      watermarkLayers
        .map((layer, index) => {
          const layerPreview = watermarkLayerPreviews.find((preview) => preview.id === layer.id);
          if (!layerPreview) {
            return null;
          }

          const overlayStyle = createWatermarkOverlayStyle({
            settings: layer.settings,
            watermarkNaturalSize: layerPreview.naturalSize,
            previewCoordinateSize,
            previewDisplaySize
          });
          const overlayImageStyle = createWatermarkOverlayImageStyle({
            settings: layer.settings,
            watermarkNaturalSize: layerPreview.naturalSize,
            previewCoordinateSize,
            previewDisplaySize
          });
          if (!overlayStyle || !overlayImageStyle) {
            return null;
          }

          return {
            id: layer.id,
            name: layer.file.name,
            previewUrl: layerPreview.previewUrl,
            overlayStyle,
            overlayImageStyle,
            isActive: layer.id === activeWatermarkLayerId,
            zIndex: index + 1,
            visible: layer.visible
          };
        })
        .filter(
          (
            layer
          ): layer is {
            id: string;
            name: string;
            previewUrl: string;
            overlayStyle: CSSProperties;
            overlayImageStyle: CSSProperties;
            isActive: boolean;
            zIndex: number;
            visible: boolean;
          } => layer !== null
        ),
    [
      activeWatermarkLayerId,
      previewCoordinateSize,
      previewDisplaySize,
      watermarkLayerPreviews,
      watermarkLayers
    ]
  );
  const inputFilesPanelProps = {
    inputFiles,
    selectedPreviewPath: selectedPreviewFile?.path ?? "",
    onOpenInputPicker: openInputPicker,
    onDropInputFiles,
    onSelectPreview: selectPreviewFile,
    onRemoveInputFile: removeInputFile
  };
  const watermarkPanelProps = {
    settings,
    watermarkLayers: watermarkLayers.map((layer) => ({
      id: layer.id,
      label: layer.label,
      name: layer.file.name,
      visible: layer.visible
    })),
    activeWatermarkLayerId,
    file: {
      watermarkFile,
      onOpenWatermarkPicker: openWatermarkPicker,
      onDropWatermarkFile
    },
    numeric: {
      onBeginContinuousNumericEdit: beginContinuousEdit,
      onUpdateNumericSetting: updateNumericSetting
    },
    size: {
      sizeControlMax,
      displayedSizePx,
      renderedWidthPx: renderedWatermarkSize.width,
      renderedHeightPx: renderedWatermarkSize.height,
      onWidthPxChange,
      onHeightPxChange,
      onTogglePreserveAspectRatio,
      onResetOriginalAspectRatio
    },
    position: {
      onSelectPosition
    },
    onSelectWatermarkLayer: activateWatermarkLayer,
    onDuplicateWatermarkLayer: duplicateWatermarkLayer,
    onMoveWatermarkLayer: moveWatermarkLayer,
    onToggleWatermarkLayerVisibility: toggleWatermarkLayerVisibility,
    onRenameWatermarkLayer: renameWatermarkLayer,
    onRemoveWatermarkLayer: removeWatermarkLayer
  };
  const outputPanelProps = {
    settings,
    outputSummary,
    isProcessing,
    statusMessage,
    lastResult,
    onOpenOutputFolderPicker: openOutputFolderPicker,
    onClearOutputDirectory: clearOutputDirectory,
    onOutputDirectoryChange,
    onSuffixChange,
    onStartProcessing: startProcessing
  };
  const previewPaneProps = {
    preview: {
      selectedFileName: selectedPreviewFile?.name ?? "선택된 파일 없음",
      previewKind,
      previewBaseUrl
    },
    pager: {
      pdfPageCount,
      pdfPreviewPage,
      onPreviousPdfPage,
      onNextPdfPage
    },
    image: {
      previewImageRef,
      onPreviewImageLoad
    },
    overlay: {
      isWatermarkHovered,
      isWatermarkSelected,
      isWatermarkDragging
    },
    interaction: {
      onClearWatermarkSelection: clearWatermarkSelection,
      onSelectWatermarkLayer: activateWatermarkLayer,
      onWatermarkPointerEnter,
      onWatermarkPointerLeave,
      onResizeHandlePointerDown,
      onRotateHandlePointerDown,
      onWatermarkPointerDown
    },
    watermarkLayers: renderedWatermarkLayers
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="hero">
          <h1>Batch Watermarker</h1>
          <p className="subtle">
            PDF와 이미지에 워터마크를 추가합니다.
          </p>
        </div>

        <InputFilesPanel {...inputFilesPanelProps} />

        <WatermarkPanel {...watermarkPanelProps} />

        <OutputPanel {...outputPanelProps} />
      </aside>

      <PreviewPane {...previewPaneProps} />
    </div>
  );
}

export default App;
