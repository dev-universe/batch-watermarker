import type { PreviewPayload } from "../shared/types";

type PdfJsModule = typeof import("pdfjs-dist");

let pdfJsLoader: Promise<PdfJsModule> | null = null;

export const createObjectUrlFromPreview = (previewPayload: PreviewPayload) => {
  const bytes = Uint8Array.from(previewPayload.data);
  const blob = new Blob([bytes], { type: previewPayload.mimeType });
  return URL.createObjectURL(blob);
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
