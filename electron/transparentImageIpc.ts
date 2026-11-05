import { dialog, ipcMain, type WebContents } from "electron";
import { Worker } from "node:worker_threads";
import path from "node:path";
import type { CompositionRequest, TransparentExportProgress, TransparentExportRequest, TransparentExportResponse } from "../src/shared/transparentImageTypes";
import { IMAGE_EXTENSIONS, importImages, inspectImage } from "./transparentImageAssets";

export function runImageWorker<T>(kind: "preview" | "export", request: unknown, onProgress?: (progress: TransparentExportProgress) => void) {
  const worker = new Worker(path.join(__dirname, "transparentImageWorker.js"), { workerData: { kind, request } });
  const promise = new Promise<T>((resolve, reject) => {
    let settled = false;
    worker.on("message", message => {
      if (message.type === "progress") onProgress?.(message.progress);
      else if (message.type === "result") { settled = true; resolve(message.value); }
      else if (message.type === "error") { settled = true; reject(new Error(message.error)); }
    });
    worker.once("error", reject);
    worker.once("exit", code => { if (!settled) reject(new Error(`이미지 처리 작업이 종료되었습니다. (${code})`)); });
  });
  return { worker, promise };
}

export function registerTransparentImageIpc() {
  const previews = new Map<number, Worker>();
  const previewVersions = new Map<number, number>();
  const exporting = new Set<number>();
  const tracked = new Set<number>();
  const track = (sender: WebContents) => {
    if (tracked.has(sender.id)) return;
    tracked.add(sender.id);
    sender.once("destroyed", () => { previews.get(sender.id)?.terminate(); previews.delete(sender.id); previewVersions.delete(sender.id); tracked.delete(sender.id); });
  };
  ipcMain.handle("transparent:pick-images", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"], filters: [{ name: "SVG and Images", extensions: IMAGE_EXTENSIONS }] });
    return importImages(result.canceled ? [] : result.filePaths);
  });
  ipcMain.handle("transparent:normalize-images", (_event, paths: string[]) => importImages(paths));
  ipcMain.handle("transparent:inspect-image", (_event, filePath: string) => inspectImage(filePath));
  ipcMain.handle("transparent:preview", async (event, request: CompositionRequest) => {
    track(event.sender);
    const version = (previewVersions.get(event.sender.id) ?? 0) + 1;
    previewVersions.set(event.sender.id, version);
    await previews.get(event.sender.id)?.terminate();
    if (previewVersions.get(event.sender.id) !== version || event.sender.isDestroyed()) return new Uint8Array();
    const task = runImageWorker<Uint8Array>("preview", request);
    previews.set(event.sender.id, task.worker);
    try { return await task.promise; }
    catch (error) {
      // Superseded previews are normal while dragging, not export or render errors.
      if (previewVersions.get(event.sender.id) !== version || event.sender.isDestroyed()) return new Uint8Array();
      throw error;
    }
    finally { if (previews.get(event.sender.id) === task.worker) previews.delete(event.sender.id); }
  });
  ipcMain.handle("transparent:export", async (event, request: TransparentExportRequest) => {
    if (exporting.has(event.sender.id)) throw new Error("이미 내보내기 중입니다.");
    exporting.add(event.sender.id);
    try {
      return await runImageWorker<TransparentExportResponse>("export", request, progress => {
        if (!event.sender.isDestroyed()) event.sender.send("transparent:progress", progress);
      }).promise;
    } finally { exporting.delete(event.sender.id); }
  });
}
