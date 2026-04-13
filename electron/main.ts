import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import type {
  InputFile,
  PreviewPayload,
  ProcessRequest,
  ProcessResponse,
  SupportedKind
} from "../src/shared/types";
import { resolveOutputPath } from "../src/shared/outputPaths";
import { getAnchorCenterPoint, getWatermarkMetrics } from "../src/shared/watermarkGeometry";

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

const getTemporaryOutputPath = (targetPath: string) => {
  const parsed = path.parse(targetPath);
  return path.join(
    os.tmpdir(),
    `${parsed.name}-${Date.now()}-${Math.random().toString(36).slice(2)}${parsed.ext}`
  );
};

interface WatermarkAsset {
  rotatedWatermarkBuffer: Buffer;
  rotatedWidth: number;
  rotatedHeight: number;
}

type WatermarkAssetCache = Map<string, WatermarkAsset>;

const getWatermarkAssetCacheKey = (
  canvasWidth: number,
  canvasHeight: number,
  sizePx: number,
  rotation: number
) => `${canvasWidth}x${canvasHeight}:${sizePx}:${rotation}`;

const buildWatermarkAsset = async (
  watermarkBuffer: Buffer,
  canvasWidth: number,
  canvasHeight: number,
  watermarkWidth: number,
  watermarkHeight: number,
  sizePx: number,
  rotation: number
): Promise<WatermarkAsset> => {
  const metrics = getWatermarkMetrics(
    watermarkWidth,
    watermarkHeight,
    sizePx,
    rotation
  );
  const rotatedWatermarkBuffer = await sharp(watermarkBuffer)
    .resize({
      width: Math.max(1, Math.round(metrics.base.width)),
      height: Math.max(1, Math.round(metrics.base.height)),
      fit: "contain"
    })
    .rotate(rotation, {
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0
      }
    })
    .png()
    .toBuffer();
  const rotatedMetadata = await sharp(rotatedWatermarkBuffer).metadata();

  return {
    rotatedWatermarkBuffer,
    rotatedWidth: rotatedMetadata.width ?? Math.max(1, Math.round(metrics.rotated.width)),
    rotatedHeight: rotatedMetadata.height ?? Math.max(1, Math.round(metrics.rotated.height))
  };
};

const getOrCreateWatermarkAsset = async (
  cache: WatermarkAssetCache,
  watermarkBuffer: Buffer,
  canvasWidth: number,
  canvasHeight: number,
  watermarkWidth: number,
  watermarkHeight: number,
  sizePx: number,
  rotation: number
) => {
  const cacheKey = getWatermarkAssetCacheKey(canvasWidth, canvasHeight, sizePx, rotation);
  const cachedAsset = cache.get(cacheKey);
  if (cachedAsset) {
    return cachedAsset;
  }

  const asset = await buildWatermarkAsset(
    watermarkBuffer,
    canvasWidth,
    canvasHeight,
    watermarkWidth,
    watermarkHeight,
    sizePx,
    rotation
  );
  cache.set(cacheKey, asset);
  return asset;
};

const processImageFile = async (
  inputFile: InputFile,
  watermarkBuffer: Buffer,
  request: ProcessRequest,
  watermarkMetadata: sharp.Metadata,
  watermarkAssetCache: WatermarkAssetCache
) => {
  const { settings } = request;
  const finalOutputPath = resolveOutputPath(
    inputFile.path,
    settings.suffix,
    settings.outputDirectory,
    settings.overwriteOriginal
  );
  const writePath = settings.overwriteOriginal ? getTemporaryOutputPath(finalOutputPath) : finalOutputPath;
  const image = sharp(inputFile.path, { failOn: "none" });
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`Unable to read image dimensions: ${inputFile.name}`);
  }

  if (!watermarkMetadata.width || !watermarkMetadata.height) {
    throw new Error("Unable to read watermark dimensions.");
  }

  const anchorCenter = getAnchorCenterPoint(
    settings.position,
    metadata.width,
    metadata.height
  );
  const { rotatedWatermarkBuffer, rotatedWidth, rotatedHeight } = await getOrCreateWatermarkAsset(
    watermarkAssetCache,
    watermarkBuffer,
    metadata.width,
    metadata.height,
    watermarkMetadata.width,
    watermarkMetadata.height,
    settings.sizePx,
    settings.rotation
  );
  const watermarkDataUrl = `data:image/png;base64,${rotatedWatermarkBuffer.toString("base64")}`;
  const topLeftX = anchorCenter.x - rotatedWidth / 2;
  const topLeftY = anchorCenter.y - rotatedHeight / 2;
  const watermarkLayer = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${metadata.width}" height="${metadata.height}"><image href="${watermarkDataUrl}" x="${topLeftX}" y="${topLeftY}" width="${rotatedWidth}" height="${rotatedHeight}" opacity="${
      settings.opacity / 100
    }"/></svg>`
  );

  const density = metadata.density;
  const composite = sharp(inputFile.path, { density, failOn: "none" }).composite([{ input: watermarkLayer, blend: "over" }]);

  const ext = path.extname(inputFile.path).toLowerCase();
  if (ext === ".png") {
    await composite.png().withMetadata({ density }).toFile(writePath);
  } else if (ext === ".webp") {
    await composite.webp().withMetadata({ density }).toFile(writePath);
  } else if (ext === ".tif" || ext === ".tiff") {
    await composite.tiff().withMetadata({ density }).toFile(writePath);
  } else {
    await composite.jpeg({ quality: 95 }).withMetadata({ density }).toFile(writePath);
  }

  if (settings.overwriteOriginal) {
    await fs.rm(finalOutputPath, { force: true });
    await fs.rename(writePath, finalOutputPath);
  }

  return finalOutputPath;
};

const processPdfFile = async (
  inputFile: InputFile,
  watermarkBuffer: Buffer,
  request: ProcessRequest,
  watermarkMetadata: sharp.Metadata,
  watermarkAssetCache: WatermarkAssetCache
) => {
  const { settings } = request;
  const outputPath = resolveOutputPath(
    inputFile.path,
    settings.suffix,
    settings.outputDirectory,
    settings.overwriteOriginal
  );
  const sourceBytes = await fs.readFile(inputFile.path);
  const pdf = await PDFDocument.load(sourceBytes);
  if (!watermarkMetadata.width || !watermarkMetadata.height) {
    throw new Error("Unable to read watermark dimensions.");
  }
  const pageWatermarkCache = new Map<
    string,
    {
      watermarkImage: Awaited<ReturnType<typeof pdf.embedPng>>;
      rotatedWidth: number;
      rotatedHeight: number;
    }
  >();

  for (const page of pdf.getPages()) {
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const anchorCenter = getAnchorCenterPoint(
      settings.position,
      pageWidth,
      pageHeight
    );
    const pageCacheKey = getWatermarkAssetCacheKey(pageWidth, pageHeight, settings.sizePx, settings.rotation);
    let cachedWatermark = pageWatermarkCache.get(pageCacheKey);

    if (!cachedWatermark) {
      const asset = await getOrCreateWatermarkAsset(
        watermarkAssetCache,
        watermarkBuffer,
        pageWidth,
        pageHeight,
        watermarkMetadata.width,
        watermarkMetadata.height,
        settings.sizePx,
        settings.rotation
      );
      cachedWatermark = {
        watermarkImage: await pdf.embedPng(asset.rotatedWatermarkBuffer),
        rotatedWidth: asset.rotatedWidth,
        rotatedHeight: asset.rotatedHeight
      };
      pageWatermarkCache.set(pageCacheKey, cachedWatermark);
    }

    const { watermarkImage, rotatedWidth, rotatedHeight } = cachedWatermark;
    const topLeftX = anchorCenter.x - rotatedWidth / 2;
    const topLeftY = anchorCenter.y - rotatedHeight / 2;

    page.drawImage(watermarkImage, {
      x: topLeftX,
      y: pageHeight - topLeftY - rotatedHeight,
      width: rotatedWidth,
      height: rotatedHeight,
      opacity: settings.opacity / 100
    });
  }

  const outputBytes = await pdf.save();
  await fs.writeFile(outputPath, outputBytes);
  return outputPath;
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
    const uniquePaths = [...new Set(incomingPaths)];
    const existingPaths = await Promise.all(
      uniquePaths.map(async (filePath) => {
        try {
          await fs.access(filePath);
          return filePath;
        } catch {
          return null;
        }
      })
    );

    return existingPaths.filter(Boolean);
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
            ? await processPdfFile(inputFile, watermarkBuffer, request, watermarkMetadata, watermarkAssetCache)
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
