import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type SyntheticEvent
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { InputFile, PreviewPayload, WatermarkLayer } from "../shared/types";
import {
  createObjectUrlFromPreview,
  loadPdfJs,
  readImageNaturalSize
} from "./previewStateHelpers";

interface UsePreviewStateOptions {
  inputFiles: InputFile[];
  selectedPreviewPath: string;
  setSelectedPreviewPath: Dispatch<SetStateAction<string>>;
  watermarkLayers: WatermarkLayer[];
  activeWatermarkLayerId: string | null;
}

interface WatermarkLayerPreview {
  id: string;
  previewUrl: string;
  naturalSize: {
    width: number;
    height: number;
  };
}

export function usePreviewState({
  inputFiles,
  selectedPreviewPath,
  setSelectedPreviewPath,
  watermarkLayers,
  activeWatermarkLayerId
}: UsePreviewStateOptions) {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [watermarkLayerPreviews, setWatermarkLayerPreviews] = useState<WatermarkLayerPreview[]>(
    []
  );
  const [previewCoordinateSize, setPreviewCoordinateSize] = useState({ width: 0, height: 0 });
  const [previewDisplaySize, setPreviewDisplaySize] = useState({ width: 0, height: 0 });
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfPreviewPage, setPdfPreviewPage] = useState(1);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const pdfRenderTokenRef = useRef(0);

  const selectedPreviewFile = useMemo(
    () => inputFiles.find((file) => file.path === selectedPreviewPath) ?? inputFiles[0] ?? null,
    [inputFiles, selectedPreviewPath]
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!selectedPreviewFile) {
        setPreview(null);
        return;
      }

      const nextPreview = await window.watermarkApi.readPreview(selectedPreviewFile.path);
      if (!cancelled) {
        setPreview(nextPreview);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPreviewFile]);

  useEffect(() => {
    if (!preview || preview.kind !== "image") {
      setPreviewImageUrl("");
      setPreviewCoordinateSize({ width: 0, height: 0 });
      return;
    }

    const objectUrl = createObjectUrlFromPreview(preview);
    setPreviewImageUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preview]);

  useEffect(() => {
    const nextLayerPreviews = watermarkLayers.map((layer) => {
      const previewUrl = createObjectUrlFromPreview(layer.previewPayload);
      return {
        id: layer.id,
        previewUrl,
        naturalSize: { ...layer.naturalSize }
      };
    });
    setWatermarkLayerPreviews(nextLayerPreviews);

    return () => {
      for (const layerPreview of nextLayerPreviews) {
        URL.revokeObjectURL(layerPreview.previewUrl);
      }
    };
  }, [watermarkLayers]);

  useEffect(() => {
    if (selectedPreviewFile && selectedPreviewFile.path !== selectedPreviewPath) {
      setSelectedPreviewPath(selectedPreviewFile.path);
    }
    if (!selectedPreviewFile && selectedPreviewPath) {
      setSelectedPreviewPath("");
    }
  }, [selectedPreviewFile, selectedPreviewPath, setSelectedPreviewPath]);

  useEffect(() => {
    setPdfPreviewPage(1);
  }, [selectedPreviewPath]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!preview || preview.kind !== "pdf") {
        if (!cancelled) {
          setPdfDocument(null);
          setPdfPreviewUrl("");
          setPdfPageCount(0);
          setPreviewCoordinateSize({ width: 0, height: 0 });
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
      const coordinateViewport = page.getViewport({ scale: 1 });
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
      setPreviewCoordinateSize({
        width: coordinateViewport.width,
        height: coordinateViewport.height
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDocument, pdfPreviewPage]);

  const previewKind = preview?.kind ?? selectedPreviewFile?.kind ?? null;
  const previewBaseUrl =
    previewKind === "pdf" ? pdfPreviewUrl : previewKind === "image" ? previewImageUrl : "";
  const activeWatermarkLayerPreview =
    watermarkLayerPreviews.find((layer) => layer.id === activeWatermarkLayerId) ??
    watermarkLayerPreviews[0] ??
    null;
  const watermarkPreviewUrl = activeWatermarkLayerPreview?.previewUrl ?? "";
  const watermarkNaturalSize = activeWatermarkLayerPreview?.naturalSize ?? { width: 0, height: 0 };

  const onPreviewImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const nextSize = {
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight
    };
    setPreviewCoordinateSize(nextSize);
    setPreviewDisplaySize({
      width: event.currentTarget.clientWidth,
      height: event.currentTarget.clientHeight
    });
  };

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

  return {
    selectedPreviewFile,
    previewKind,
    previewBaseUrl,
    watermarkLayerPreviews,
    watermarkPreviewUrl,
    watermarkNaturalSize,
    previewCoordinateSize,
    previewDisplaySize,
    pdfPageCount,
    pdfPreviewPage,
    previewImageRef,
    onPreviewImageLoad,
    onPreviousPdfPage: () => setPdfPreviewPage((current) => Math.max(1, current - 1)),
    onNextPdfPage: () => setPdfPreviewPage((current) => Math.min(pdfPageCount, current + 1))
  };
}
