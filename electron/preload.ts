import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { InputFile, PreviewPayload, ProcessRequest, ProcessResponse } from "../src/shared/types";
import type { TransparentImageApi, TransparentExportProgress } from "../src/shared/transparentImageTypes";

const transparentImageApi: TransparentImageApi = {
  pickImages: () => ipcRenderer.invoke("transparent:pick-images"),
  normalizeDroppedImages: paths => ipcRenderer.invoke("transparent:normalize-images", paths),
  inspectImage: path => ipcRenderer.invoke("transparent:inspect-image", path),
  renderPreview: request => ipcRenderer.invoke("transparent:preview", request),
  exportGroups: request => ipcRenderer.invoke("transparent:export", request),
  onProgress: callback => {
    const listener = (_event: Electron.IpcRendererEvent, progress: TransparentExportProgress) => callback(progress);
    ipcRenderer.on("transparent:progress", listener);
    return () => ipcRenderer.removeListener("transparent:progress", listener);
  }
};
contextBridge.exposeInMainWorld("transparentImageApi", transparentImageApi);

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
