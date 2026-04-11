import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type {
  AnchorPosition,
  InputFile,
  PreviewPayload,
  ProcessResponse,
  WatermarkSettings
} from "./shared/types";
import { getAnchorCenterPoint, getWatermarkMetrics } from "./shared/watermarkGeometry";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const POSITIONS: AnchorPosition[] = ["NW", "N", "NE", "W", "C", "E", "SW", "S", "SE"];
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
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const pdfRenderTokenRef = useRef(0);

  useEffect(() => {
    void (async () => {
      if (!selectedPreviewPath) {
        setPreview(null);
        return;
      }

      const nextPreview = await window.watermarkApi.readPreview(selectedPreviewPath);
      setPreview(nextPreview);
    })();
  }, [selectedPreviewPath]);

  useEffect(() => {
    if (!preview || preview.kind !== "image") {
      setPreviewImageUrl("");
      return;
    }

    const bytes = Uint8Array.from(preview.data);
    const blob = new Blob([bytes], { type: preview.mimeType });
    const objectUrl = URL.createObjectURL(blob);
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
      const bytes = Uint8Array.from(nextPreview.data);
      const blob = new Blob([bytes], { type: nextPreview.mimeType });
      const objectUrl = URL.createObjectURL(blob);
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

  const previewTarget = useMemo(
    () => inputFiles.find((file) => file.path === selectedPreviewPath) ?? inputFiles[0] ?? null,
    [inputFiles, selectedPreviewPath]
  );

  useEffect(() => {
    if (previewTarget && previewTarget.path !== selectedPreviewPath) {
      setSelectedPreviewPath(previewTarget.path);
    }
    if (!previewTarget && selectedPreviewPath) {
      setSelectedPreviewPath("");
    }
  }, [previewTarget, selectedPreviewPath]);

  useEffect(() => {
    setPdfPreviewPage(1);
  }, [selectedPreviewPath]);

  const willOverwriteOriginal = settings.suffix.trim() === "";
  const outputSummary = willOverwriteOriginal
    ? "접미사가 비어 있으면 원본 파일에 직접 덮어씁니다."
    : settings.outputDirectory
      ? settings.outputDirectory
      : "접미사를 유지하려면 출력 폴더를 지정해야 합니다.";

  const collectDroppedPaths = async (event: React.DragEvent<HTMLElement>) => {
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

  const onDropInputFiles = async (event: React.DragEvent<HTMLElement>) => {
    const paths = await collectDroppedPaths(event);
    const normalized = await window.watermarkApi.normalizeDroppedFiles(paths);
    await addInputFiles(normalized);
  };

  const onDropWatermarkFile = async (event: React.DragEvent<HTMLElement>) => {
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

    if (!overwriteOriginal && !settings.outputDirectory) {
      window.alert("출력 폴더를 지정하세요.");
      return;
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

  const previewKind = preview?.kind ?? previewTarget?.kind ?? null;
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

        <section className="panel">
          <div className="panel-head">
            <h2>입력 파일</h2>
            <button onClick={openInputPicker}>파일 선택</button>
          </div>
          <div
            className="dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => void onDropInputFiles(event)}
          >
            PDF와 이미지 파일을 여기로 드래그하세요.
          </div>
          <div className="file-list">
            {inputFiles.map((file) => (
              <div
                key={file.path}
                className={`file-item ${previewTarget?.path === file.path ? "active" : ""}`}
              >
                <button className="file-pick" onClick={() => setSelectedPreviewPath(file.path)}>
                  <span>{file.name}</span>
                  <small>{file.kind.toUpperCase()}</small>
                </button>
                <button className="file-remove" onClick={() => removeInputFile(file.path)}>
                  제거
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>워터마크 이미지</h2>
            <button onClick={openWatermarkPicker}>이미지 선택</button>
          </div>
          <div
            className={`dropzone ${watermarkFile ? "compact" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => void onDropWatermarkFile(event)}
          >
            {watermarkFile ? watermarkFile.name : "워터마크 이미지를 여기로 드래그하세요."}
          </div>

          <div className="field-grid">
            <label>
              <span>투명도 (0~100%)</span>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.opacity}
                  onChange={(event) => updateNumericSetting("opacity", event.target.value)}
                />
                <input
                  className="number"
                  type="number"
                  min="0"
                  max="100"
                  value={settings.opacity}
                  onChange={(event) => updateNumericSetting("opacity", event.target.value)}
                />
              </div>
            </label>

            <label>
              <span>크기 (0~1000%)</span>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="1000"
                  value={settings.scale}
                  onChange={(event) => updateNumericSetting("scale", event.target.value)}
                />
                <input
                  className="number"
                  type="number"
                  min="0"
                  max="1000"
                  value={settings.scale}
                  onChange={(event) => updateNumericSetting("scale", event.target.value)}
                />
              </div>
            </label>

            <label>
              <span>회전 (0~360도)</span>
              <div className="control-row">
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={settings.rotation}
                  onChange={(event) => updateNumericSetting("rotation", event.target.value)}
                />
                <input
                  className="number"
                  type="number"
                  min="0"
                  max="360"
                  value={settings.rotation}
                  onChange={(event) => updateNumericSetting("rotation", event.target.value)}
                />
              </div>
            </label>
          </div>

          <div className="position-grid">
            {POSITIONS.map((position) => (
              <button
                key={position}
                className={settings.position === position ? "selected" : ""}
                onClick={() => setSettings((current) => ({ ...current, position }))}
              >
                {position}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>출력</h2>
            <div className="output-actions">
              <button onClick={openOutputFolderPicker}>출력 폴더 지정</button>
              <button
                disabled={!settings.outputDirectory}
                onClick={() =>
                  setSettings((current) => ({
                    ...current,
                    outputDirectory: ""
                  }))
                }
              >
                지정 해제
              </button>
            </div>
          </div>
          <label>
            <span>출력 폴더</span>
            <input
              type="text"
              value={settings.outputDirectory}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  outputDirectory: event.target.value,
                  overwriteOriginal: false
                }))
              }
              placeholder="원본 덮어쓰기면 비워둘 수 있습니다."
            />
          </label>
          <label>
            <span>접미사</span>
            <input
              type="text"
              value={settings.suffix}
              onChange={(event) => setSettings((current) => ({ ...current, suffix: event.target.value }))}
              placeholder="_wm"
            />
          </label>
          <p className="subtle">{outputSummary}</p>
          <button className="primary" disabled={isProcessing} onClick={startProcessing}>
            {isProcessing ? "처리 중..." : "워터마크 적용 시작"}
          </button>
          <p className="status">{statusMessage}</p>
          {lastResult && (
            <div className="result-list">
              {lastResult.results.map((result) => (
                <div key={result.outputPath} className="result-item">
                  <strong>{result.outputPath}</strong>
                </div>
              ))}
              {lastResult.errors.map((error) => (
                <div key={error} className="result-item error">
                  {error}
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>

      <main className="preview-pane">
        <div className="preview-sticky">
          <div className="preview-head">
            <div>
              <p className="eyebrow">Preview</p>
              <h2>{previewTarget?.name ?? "선택된 파일 없음"}</h2>
            </div>
            {previewKind === "pdf" && pdfPageCount > 0 && (
              <div className="pdf-pager">
                <button onClick={() => setPdfPreviewPage((current) => Math.max(1, current - 1))} disabled={pdfPreviewPage <= 1}>
                  이전
                </button>
                <span>
                  {pdfPreviewPage} / {pdfPageCount}
                </span>
                <button
                  onClick={() => setPdfPreviewPage((current) => Math.min(pdfPageCount, current + 1))}
                  disabled={pdfPreviewPage >= pdfPageCount}
                >
                  다음
                </button>
              </div>
            )}
          </div>

          <div className="preview-stage">
            {previewBaseUrl ? (
              <div className="preview-artboard">
                <img
                  ref={previewImageRef}
                  className="preview-image"
                  src={previewBaseUrl}
                  alt="Preview"
                  onLoad={(event) => {
                    setPreviewNaturalSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight
                    });
                    setPreviewDisplaySize({
                      width: event.currentTarget.clientWidth,
                      height: event.currentTarget.clientHeight
                    });
                  }}
                />
                {watermarkPreviewUrl && overlayStyle && overlayImageStyle && (
                  <div className="watermark-overlay" style={overlayStyle}>
                    <img
                      className="watermark-overlay-image"
                      src={watermarkPreviewUrl}
                      alt="Watermark preview"
                      style={overlayImageStyle}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-preview">미리볼 입력 파일을 선택하세요.</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
