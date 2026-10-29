import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";

export const PDF_RASTER_DPI = 600;
// Reject oversized pages instead of silently reducing their resolution.
const MAX_PAGE_PIXELS = 150_000_000;
const MAX_PAGE_DIMENSION = 32_767;

export const rasterizePdf = async (sourceBytes: Uint8Array): Promise<Uint8Array> => {
  // Keep the ESM import native in the CommonJS Electron build.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // PDF.js requires forward slashes, including on Windows.
  const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json")).replace(/\\/g, "/");
  const loadingTask = getDocument({
    data: new Uint8Array(sourceBytes),
    cMapUrl: `${pdfjsRoot}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${pdfjsRoot}/standard_fonts/`,
    wasmUrl: `${pdfjsRoot}/wasm/`,
    useSystemFonts: true,
    isEvalSupported: false,
    stopAtErrors: true
  });

  try {
    const source = await loadingTask.promise;
    // A fresh document deliberately retains no source text, fonts, attachments,
    // annotations, forms, metadata, or independently removable watermark layers.
    const output = await PDFDocument.create();
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      const page = await source.getPage(pageNumber);
      const pageSize = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PDF_RASTER_DPI / 72 });
      const width = Math.ceil(viewport.width - 1e-7);
      const height = Math.ceil(viewport.height - 1e-7);
      if (width * height > MAX_PAGE_PIXELS || Math.max(width, height) > MAX_PAGE_DIMENSION) {
        throw new Error(`${pageNumber}페이지가 600 DPI 변환 한도를 초과합니다. 페이지 크기를 줄이거나 PDF 이미지 변환을 해제하세요.`);
      }

      const canvas = createCanvas(width, height);
      try {
        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          viewport,
          background: "rgb(255,255,255)"
        }).promise;
        const image = await output.embedPng(await canvas.encode("png"));
        const outputPage = output.addPage([pageSize.width, pageSize.height]);
        outputPage.drawImage(image, {
          x: 0,
          y: 0,
          width: pageSize.width,
          height: pageSize.height
        });
      } finally {
        // Only one high-resolution rendering surface is kept at a time.
        canvas.width = 1;
        canvas.height = 1;
        page.cleanup();
      }
    }
    return await output.save();
  } finally {
    await loadingTask.destroy();
  }
};
