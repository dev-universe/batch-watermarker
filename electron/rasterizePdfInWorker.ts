import path from "node:path";
import { Worker } from "node:worker_threads";
import type { PdfExportProfileId } from "../src/shared/pdfExportProfiles";

export const rasterizePdfInWorker = (bytes: Uint8Array, profileId?: PdfExportProfileId): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    // Rendering and PNG encoding must not block Electron's main event loop.
    const worker = new Worker(path.join(__dirname, "rasterizePdfWorker.js"), {
      workerData: { bytes, profileId }
    });
    let receivedResult = false;
    worker.once("message", (result: { bytes?: Uint8Array; error?: string }) => {
      receivedResult = true;
      if (result.bytes) {
        resolve(result.bytes);
      } else {
        reject(new Error(result.error || "PDF 이미지 변환에 실패했습니다."));
      }
      void worker.terminate();
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (!receivedResult) {
        reject(new Error(`PDF 이미지 변환 작업이 종료되었습니다 (코드 ${code}).`));
      }
    });
  });
