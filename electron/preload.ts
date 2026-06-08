import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { InputFile, PreviewPayload, ProcessRequest, ProcessResponse } from "../src/shared/types";

contextBridge.exposeInMainWorld("watermarkApi", {
  pickInputFiles: () => ipcRenderer.invoke("dialog:pick-input-files") as Promise<InputFile[]>,
  pickWatermarkFiles: () => ipcRenderer.invoke("dialog:pick-watermark-files") as Promise<InputFile[]>,
  pickOutputFolder: () => ipcRenderer.invoke("dialog:pick-output-folder") as Promise<string>,
  normalizeDroppedFiles: (paths: string[]) =>
    ipcRenderer.invoke("files:normalize-dropped", paths) as Promise<InputFile[]>,
  process: (request: ProcessRequest) =>
    ipcRenderer.invoke("watermark:process", request) as Promise<ProcessResponse>,
  readPreview: (filePath: string) =>
    ipcRenderer.invoke("preview:read", filePath) as Promise<PreviewPayload>,
  findExistingPaths: (paths: string[]) =>
    ipcRenderer.invoke("paths:existing", paths) as Promise<string[]>,
  toFileUrl: (filePath: string) => ipcRenderer.invoke("util:file-url", filePath) as Promise<string>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
});
