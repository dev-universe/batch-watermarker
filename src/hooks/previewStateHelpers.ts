import type { PreviewPayload, WatermarkLayer } from "../shared/types";

type PdfJsModule = typeof import("pdfjs-dist");

let pdfJsLoader: Promise<PdfJsModule> | null = null;

export const createObjectUrlFromPreview = (previewPayload: PreviewPayload) => {
  const bytes = Uint8Array.from(previewPayload.data);
  const blob = new Blob([bytes], { type: previewPayload.mimeType });
  return URL.createObjectURL(blob);
};

export interface CachedWatermarkLayerPreview {
  id: string;
  sourcePath: string;
  mimeType: string;
  previewUrl: string;
  naturalSize: {
    width: number;
    height: number;
  };
}

export const reconcileWatermarkLayerPreviews = (
  layers: WatermarkLayer[],
  previousPreviews: CachedWatermarkLayerPreview[],
  createObjectUrl: (previewPayload: PreviewPayload) => string = createObjectUrlFromPreview,
  revokeObjectUrl: (objectUrl: string) => void = URL.revokeObjectURL
) => {
  const reusedPreviews = new Set<CachedWatermarkLayerPreview>();
  const nextPreviews = layers.map((layer) => {
    const previousPreview = previousPreviews.find(
      (preview) =>
        preview.id === layer.id &&
        preview.sourcePath === layer.file.path &&
        preview.mimeType === layer.previewPayload.mimeType
    );

    if (previousPreview) {
      reusedPreviews.add(previousPreview);
      return {
        ...previousPreview,
        naturalSize: { ...layer.naturalSize }
      };
    }

    return {
      id: layer.id,
      sourcePath: layer.file.path,
      mimeType: layer.previewPayload.mimeType,
      previewUrl: createObjectUrl(layer.previewPayload),
      naturalSize: { ...layer.naturalSize }
    };
  });

  for (const previousPreview of previousPreviews) {
    if (!reusedPreviews.has(previousPreview)) {
      revokeObjectUrl(previousPreview.previewUrl);
    }
  }

  return nextPreviews;
};

export const readImageNaturalSize = (objectUrl: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    image.onerror = () => reject(new Error("Unable to read image dimensions."));
    image.src = objectUrl;
  });

export const loadPdfJs = async () => {
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
