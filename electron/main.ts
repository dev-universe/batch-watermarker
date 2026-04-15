import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { getExistingPaths } from "./outputPlanning";
import { processImageFile } from "./processImageFile";
import { processPdfFile } from "./processPdfFile";
import type { WatermarkAssetCache } from "./watermarkAssets";
import type {
  InputFile,
  PreviewPayload,
  ProcessRequest,
  ProcessResponse,
  SupportedKind
} from "../src/shared/types";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".tif",
  ".tiff"
]);
const SUPPORTED_EXTENSIONS = new Set([".pdf", ...SUPPORTED_IMAGE_EXTENSIONS]);

const inferKind = (filePath: string): SupportedKind | null => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    return "pdf";
  }

  if (SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }

  return null;
};

const toInputFile = (filePath: string): InputFile | null => {
  const kind = inferKind(filePath);
  if (!kind) {
    return null;
  }

  return {
    path: filePath,
    name: path.basename(filePath),
    kind
  };
};

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1160,
    minHeight: 760,
    backgroundColor: "#f3efe7",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }
};

app.whenReady().then(() => {
  ipcMain.handle("dialog:pick-input-files", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "PDF and Images",
          extensions: ["pdf", "png", "jpg", "jpeg", "webp", "tif", "tiff"]
        }
      ]
    });

    if (result.canceled) {
      return [];
    }

    return result.filePaths.map(toInputFile).filter(Boolean);
  });

  ipcMain.handle("dialog:pick-watermark-file", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "tif", "tiff"]
        }
      ]
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    return toInputFile(result.filePaths[0]);
  });

  ipcMain.handle("dialog:pick-output-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? "" : result.filePaths[0];
  });

  ipcMain.handle(
    "files:normalize-dropped",
    async (_event, incomingPaths: string[]) =>
      incomingPaths
        .filter((filePath) => SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
        .map(toInputFile)
        .filter(Boolean)
  );

  ipcMain.handle("preview:read", async (_event, filePath: string): Promise<PreviewPayload> => {
    const kind = inferKind(filePath);
    if (!kind) {
      throw new Error("Unsupported file type.");
    }

    const data = new Uint8Array(await fs.readFile(filePath));
    const mimeType =
      kind === "pdf"
        ? "application/pdf"
        : path.extname(filePath).toLowerCase() === ".png"
          ? "image/png"
          : "image/jpeg";

    return {
      kind,
      data,
      mimeType,
      name: path.basename(filePath)
    };
  });

  ipcMain.handle("util:file-url", async (_event, filePath: string) => pathToFileURL(filePath).href);

  ipcMain.handle("paths:existing", async (_event, incomingPaths: string[]) => {
    return getExistingPaths(incomingPaths);
  });

  ipcMain.handle("watermark:process", async (_event, request: ProcessRequest): Promise<ProcessResponse> => {
    const watermarkBuffer = await fs.readFile(request.watermarkPath);
    const watermarkMetadata = await sharp(watermarkBuffer).metadata();
    const watermarkAssetCache: WatermarkAssetCache = new Map();
    const results: ProcessResponse["results"] = [];
    const errors: string[] = [];

    for (const inputFile of request.inputFiles) {
      try {
        const outputPath =
          inputFile.kind === "pdf"
            ? await processPdfFile(inputFile, watermarkBuffer, request, watermarkMetadata)
            : await processImageFile(inputFile, watermarkBuffer, request, watermarkMetadata, watermarkAssetCache);
        results.push({
          sourcePath: inputFile.path,
          outputPath
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${inputFile.name}: ${message}`);
      }
    }

    return { results, errors };
  });

  createWindow().catch((error) => {
    console.error(error);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch(console.error);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
