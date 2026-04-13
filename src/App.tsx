import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type SyntheticEvent } from "react";
import { InputFilesPanel } from "./components/InputFilesPanel";
import { OutputPanel } from "./components/OutputPanel";
import { PreviewPane } from "./components/PreviewPane";
import { WatermarkPanel } from "./components/WatermarkPanel";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type {
  InputFile,
  PreviewPayload,
  ProcessResponse,
  WatermarkSettings
} from "./shared/types";
import { collectPlannedOutputConflicts, collectPlannedOutputs } from "./shared/outputPaths";
import { getAnchorCenterPoint, getWatermarkMetrics } from "./shared/watermarkGeometry";

const INITIAL_SETTINGS: WatermarkSettings = {
  opacity: 7,
  scale: 100,
  rotation: 0,
  position: "C",
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

const humanCount = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const createObjectUrlFromPreview = (previewPayload: PreviewPayload) => {
  const bytes = Uint8Array.from(previewPayload.data);
  const blob = new Blob([bytes], { type: previewPayload.mimeType });
  return URL.createObjectURL(blob);
};

const formatConflictConfirmMessage = (conflicts: string[]) => {
  const previewLines = conflicts.slice(0, 6).map((conflict) => `- ${conflict}`);
  const remainingCount = conflicts.length - previewLines.length;
  const suffix =
    remainingCount > 0 ? `\n외 ${remainingCount}건이 더 있습니다.` : "";

  return [
    `출력 경로 충돌이 ${conflicts.length}건 발견되었습니다.`,
    "",
    ...previewLines,
    suffix,
    "",
    "기존 파일을 덮어쓰거나 다른 입력 파일과 경로가 충돌할 수 있습니다.",
    "계속 진행하시겠습니까?"
  ]
    .filter(Boolean)
    .join("\n");
};

type PdfJsModule = typeof import("pdfjs-dist");

let pdfJsLoader: Promise<PdfJsModule> | null = null;

const loadPdfJs = async () => {
  if (!pdfJsLoader) {
    pdfJsLoader = (async () => {
      const [pdfjsLib, pdfWorkerModule] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.mjs?url")
      ]);
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerModule.default;
      return pdfjsLib;
    })();
  }

  return pdfJsLoader;
};

function App() {
  const [inputFiles, setInputFiles] = useState<InputFile[]>([]);
  const [watermarkFile, setWatermarkFile] = useState<InputFile | null>(null);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [selectedPreviewPath, setSelectedPreviewPath] = useState("");
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [watermarkPreviewUrl, setWatermarkPreviewUrl] = useState("");
  const [watermarkNaturalSize, setWatermarkNaturalSize] = useState({ width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("입력 파일과 워터마크를 넣으면 바로 처리할 수 있습니다.");
  const [lastResult, setLastResult] = useState<ProcessResponse | null>(null);
  const [previewNaturalSize, setPreviewNaturalSize] = useState({ width: 0, height: 0 });
  const [previewDisplaySize, setPreviewDisplaySize] = useState({ width: 0, height: 0 });
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfPreviewPage, setPdfPreviewPage] = useState(1);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const pdfRenderTokenRef = useRef(0);
  const selectedPreviewFile = useMemo(
    () => inputFiles.find((file) => file.path === selectedPreviewPath) ?? inputFiles[0] ?? null,
    [inputFiles, selectedPreviewPath]
  );

  useEffect(() => {
    void (async () => {
      if (!selectedPreviewFile) {
        setPreview(null);
        return;
      }

      const nextPreview = await window.watermarkApi.readPreview(selectedPreviewFile.path);
      setPreview(nextPreview);
    })();
  }, [selectedPreviewFile]);

  useEffect(() => {
    if (!preview || preview.kind !== "image") {
      setPreviewImageUrl("");
      setPreviewNaturalSize({ width: 0, height: 0 });
      return;
    }

    const objectUrl = createObjectUrlFromPreview(preview);
    setPreviewImageUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preview]);

  useEffect(() => {
    void (async () => {
      if (!watermarkFile) {
        setWatermarkPreviewUrl("");
        setWatermarkNaturalSize({ width: 0, height: 0 });
        return;
      }
      const nextPreview = await window.watermarkApi.readPreview(watermarkFile.path);
      const objectUrl = createObjectUrlFromPreview(nextPreview);
      setWatermarkPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return objectUrl;
      });
    })();
  }, [watermarkFile]);

  useEffect(() => {
    return () => {
      if (watermarkPreviewUrl) {
        URL.revokeObjectURL(watermarkPreviewUrl);
      }
    };
  }, [watermarkPreviewUrl]);

  useEffect(() => {
    if (!watermarkPreviewUrl) {
      setWatermarkNaturalSize({ width: 0, height: 0 });
      return;
    }

    const image = new Image();
    image.onload = () =>
      setWatermarkNaturalSize({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    image.src = watermarkPreviewUrl;
  }, [watermarkPreviewUrl]);

  useEffect(() => {
    if (selectedPreviewFile && selectedPreviewFile.path !== selectedPreviewPath) {
      setSelectedPreviewPath(selectedPreviewFile.path);
    }
    if (!selectedPreviewFile && selectedPreviewPath) {
      setSelectedPreviewPath("");
    }
  }, [selectedPreviewFile, selectedPreviewPath]);

  useEffect(() => {
    setPdfPreviewPage(1);
  }, [selectedPreviewPath]);

  const willOverwriteOriginal = settings.suffix.trim() === "";
  const outputSummary = willOverwriteOriginal
    ? "접미사가 비어 있으면 원본 파일에 직접 덮어씁니다."
    : settings.outputDirectory
      ? settings.outputDirectory
      : "출력 폴더를 비워두면 원본 파일과 같은 폴더에 저장합니다.";

  const collectDroppedPaths = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    return Array.from(event.dataTransfer.files)
      .map((file) => window.watermarkApi.getPathForFile(file))
      .filter(Boolean);
  };

  const addInputFiles = async (incoming: InputFile[]) => {
    setInputFiles((current) => uniqueByPath([...current, ...incoming]));
    if (!selectedPreviewPath && incoming[0]) {
      setSelectedPreviewPath(incoming[0].path);
    }
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
    setWatermarkFile(imageFile);
  };

  const openInputPicker = async () => {
    const files = await window.watermarkApi.pickInputFiles();
    await addInputFiles(files);
  };

  const openWatermarkPicker = async () => {
    const file = await window.watermarkApi.pickWatermarkFile();
    if (file?.kind === "image") {
      setWatermarkFile(file);
    }
  };

  const openOutputFolderPicker = async () => {
    const folder = await window.watermarkApi.pickOutputFolder();
    if (folder) {
      setSettings((current) => ({ ...current, outputDirectory: folder, overwriteOriginal: false }));
    }
  };

  const updateNumericSetting = (key: "opacity" | "scale" | "rotation", value: string) => {
    const max = key === "opacity" ? 100 : key === "rotation" ? 360 : 1000;
    const nextValue = clamp(Number(value), 0, max);
    setSettings((current) => ({ ...current, [key]: nextValue }));
  };

  const removeInputFile = (pathToRemove: string) => {
    setInputFiles((current) => current.filter((file) => file.path !== pathToRemove));
  };

  const clearOutputDirectory = () => {
    setSettings((current) => ({
      ...current,
      outputDirectory: ""
    }));
  };

  const onOutputDirectoryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSettings((current) => ({
      ...current,
      outputDirectory: event.target.value,
      overwriteOriginal: false
    }));
  };

  const onSuffixChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSettings((current) => ({ ...current, suffix: event.target.value }));
  };

  const onPreviewImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    setPreviewNaturalSize({
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight
    });
    setPreviewDisplaySize({
      width: event.currentTarget.clientWidth,
      height: event.currentTarget.clientHeight
    });
  };

  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!preview || preview.kind !== "pdf") {
        if (!cancelled) {
          setPdfDocument(null);
          setPdfPreviewUrl("");
          setPdfPageCount(0);
          setPreviewNaturalSize({ width: 0, height: 0 });
        }
        return;
      }

      const pdfjsLib = await loadPdfJs();
      const loadingTask = pdfjsLib.getDocument({
        data: preview.data
      });
      const nextPdfDocument = await loadingTask.promise;
      if (cancelled) {
        await nextPdfDocument.destroy();
        return;
      }
      setPdfDocument(nextPdfDocument);
      setPdfPageCount(nextPdfDocument.numPages);
      setPdfPreviewPage((current) => Math.min(Math.max(current, 1), nextPdfDocument.numPages));
    })();

    return () => {
      cancelled = true;
    };
  }, [preview]);

  useEffect(() => {
    return () => {
      void pdfDocument?.destroy();
    };
  }, [pdfDocument]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!pdfDocument) {
        setPdfPreviewUrl("");
        return;
      }

      const renderToken = ++pdfRenderTokenRef.current;
      const safePage = Math.min(Math.max(pdfPreviewPage, 1), pdfDocument.numPages);
      const page = await pdfDocument.getPage(safePage);
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport, canvas }).promise;

      if (cancelled || renderToken !== pdfRenderTokenRef.current) {
        return;
      }

      setPdfPreviewUrl(canvas.toDataURL("image/png"));
      setPreviewNaturalSize({
        width: canvas.width,
        height: canvas.height
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDocument, pdfPreviewPage]);

  const startProcessing = async () => {
    if (!inputFiles.length) {
      window.alert("입력 파일을 먼저 추가하세요.");
      return;
    }
    if (!watermarkFile) {
      window.alert("워터마크 이미지를 먼저 지정하세요.");
      return;
    }

    const overwriteOriginal = settings.suffix.trim() === "";
    if (overwriteOriginal) {
      const confirmed = window.confirm(
        "접미사가 비어 있어서 원본 파일에 그대로 덮어쓰게 됩니다. 계속하시겠습니까?"
      );
      if (!confirmed) {
        return;
      }
    }

    const plannedOutputs = collectPlannedOutputs(inputFiles, {
      suffix: settings.suffix,
      outputDirectory: settings.outputDirectory,
      overwriteOriginal
    });
    const existingOutputPaths = overwriteOriginal
      ? []
      : await window.watermarkApi.findExistingPaths(plannedOutputs.map((plannedOutput) => plannedOutput.outputPath));
    const pathConflicts = collectPlannedOutputConflicts(plannedOutputs, {
      existingPaths: existingOutputPaths,
      inputPaths: inputFiles.map((inputFile) => inputFile.path)
    });

    if (pathConflicts.length > 0) {
      const confirmed = window.confirm(formatConflictConfirmMessage(pathConflicts));
      if (!confirmed) {
        return;
      }
    }

    setIsProcessing(true);
    setStatusMessage("워터마크를 적용하는 중입니다.");

    try {
      const response = await window.watermarkApi.process({
        inputFiles,
        watermarkPath: watermarkFile.path,
        settings: {
          ...settings,
          suffix: settings.suffix,
          overwriteOriginal
        }
      });
      setLastResult(response);
      setStatusMessage(
        `완료: ${humanCount(response.results.length, "file")} processed, ${humanCount(
          response.errors.length,
          "error"
        )}`
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const previewKind = preview?.kind ?? selectedPreviewFile?.kind ?? null;
  const previewBaseUrl = previewKind === "pdf" ? pdfPreviewUrl : previewKind === "image" ? previewImageUrl : "";

  useEffect(() => {
    const node = previewImageRef.current;
    if (!node) {
      setPreviewDisplaySize({ width: 0, height: 0 });
      return;
    }

    const syncPreviewDisplaySize = () =>
      setPreviewDisplaySize({
        width: node.clientWidth,
        height: node.clientHeight
      });

    syncPreviewDisplaySize();
    const observer = new ResizeObserver(syncPreviewDisplaySize);
    observer.observe(node);
    window.addEventListener("resize", syncPreviewDisplaySize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncPreviewDisplaySize);
    };
  }, [previewBaseUrl]);
  const overlayStyle = useMemo(() => {
    if (
      !previewDisplaySize.width ||
      !previewDisplaySize.height ||
      !previewNaturalSize.width ||
      !previewNaturalSize.height ||
      !watermarkNaturalSize.width ||
      !watermarkNaturalSize.height
    ) {
      return undefined;
    }

    const metrics = getWatermarkMetrics(
      previewNaturalSize.width,
      previewNaturalSize.height,
      watermarkNaturalSize.width,
      watermarkNaturalSize.height,
      settings.scale,
      settings.rotation
    );
    const anchorCenter = getAnchorCenterPoint(
      settings.position,
      previewNaturalSize.width,
      previewNaturalSize.height
    );
    const displayScaleX = previewDisplaySize.width / previewNaturalSize.width;
    const displayScaleY = previewDisplaySize.height / previewNaturalSize.height;

    return {
      width: `${metrics.rotated.width * displayScaleX}px`,
      height: `${metrics.rotated.height * displayScaleY}px`,
      left: `${(anchorCenter.x - metrics.rotated.width / 2) * displayScaleX}px`,
      top: `${(anchorCenter.y - metrics.rotated.height / 2) * displayScaleY}px`,
      opacity: settings.opacity / 100
    };
  }, [previewDisplaySize, previewNaturalSize, settings.opacity, settings.position, settings.rotation, settings.scale, watermarkNaturalSize]);

  const overlayImageStyle = useMemo(() => {
    if (
      !previewDisplaySize.width ||
      !previewDisplaySize.height ||
      !previewNaturalSize.width ||
      !previewNaturalSize.height ||
      !watermarkNaturalSize.width ||
      !watermarkNaturalSize.height
    ) {
      return undefined;
    }

    const metrics = getWatermarkMetrics(
      previewNaturalSize.width,
      previewNaturalSize.height,
      watermarkNaturalSize.width,
      watermarkNaturalSize.height,
      settings.scale,
      settings.rotation
    );
    const displayScaleX = previewDisplaySize.width / previewNaturalSize.width;
    const displayScaleY = previewDisplaySize.height / previewNaturalSize.height;

    return {
      width: `${metrics.base.width * displayScaleX}px`,
      height: `${metrics.base.height * displayScaleY}px`,
      transform: `translate(-50%, -50%) rotate(${settings.rotation}deg)`,
      transformOrigin: "center center",
      left: "50%",
      top: "50%"
    } as const;
  }, [previewDisplaySize, previewNaturalSize, settings.rotation, settings.scale, watermarkNaturalSize]);

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
          onSelectPreview={setSelectedPreviewPath}
          onRemoveInputFile={removeInputFile}
        />

        <WatermarkPanel
          settings={settings}
          watermarkFile={watermarkFile}
          onOpenWatermarkPicker={openWatermarkPicker}
          onDropWatermarkFile={onDropWatermarkFile}
          onUpdateNumericSetting={updateNumericSetting}
          onSelectPosition={(position) => setSettings((current) => ({ ...current, position }))}
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
        previewImageRef={previewImageRef}
        onPreviousPdfPage={() => setPdfPreviewPage((current) => Math.max(1, current - 1))}
        onNextPdfPage={() => setPdfPreviewPage((current) => Math.min(pdfPageCount, current + 1))}
        onPreviewImageLoad={onPreviewImageLoad}
      />
    </div>
  );
}

export default App;
