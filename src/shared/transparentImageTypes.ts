import type { WatermarkSettings } from "./types";

export interface ImageAsset {
  path: string;
  name: string;
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
}

export interface PageTransform {
  scale: number;
  rotation: number;
  offsetXRatio: number;
  offsetYRatio: number;
  marginMm: number;
}

export interface TransparentPage {
  id: string;
  asset: ImageAsset;
  transform: PageTransform;
}

export interface TransparentWatermark {
  id: string;
  label: string;
  asset: ImageAsset;
  settings: WatermarkSettings;
  visible: boolean;
  locked: boolean;
}

export interface ImageBackground {
  asset: ImageAsset;
  fit: "cover" | "contain";
}

export interface ImageGroup {
  id: string;
  name: string;
  pages: TransparentPage[];
  // Undefined follows the common setting; null / [] explicitly removes it.
  backgroundOverride?: ImageBackground | null;
  watermarkOverride?: TransparentWatermark[];
}

export interface TransparentProject {
  groups: ImageGroup[];
  background: ImageBackground | null;
  watermarks: TransparentWatermark[];
}

export interface CompositionRequest {
  page: TransparentPage;
  background: ImageBackground | null;
  watermarks: TransparentWatermark[];
}

export interface ImageImportResult {
  assets: ImageAsset[];
  errors: string[];
}

export interface TransparentExportRequest {
  jobId: string;
  project: TransparentProject;
  outputDirectory: string;
}

export interface TransparentExportProgress {
  jobId: string;
  groupName: string;
  completedPages: number;
  totalPages: number;
}

export interface TransparentExportResponse {
  results: { groupId: string; groupName: string; outputPath: string; pageCount: number }[];
  errors: string[];
}

export interface TransparentImageApi {
  pickImages: () => Promise<ImageImportResult>;
  normalizeDroppedImages: (paths: string[]) => Promise<ImageImportResult>;
  inspectImage: (path: string) => Promise<ImageAsset>;
  renderPreview: (request: CompositionRequest) => Promise<Uint8Array>;
  exportGroups: (request: TransparentExportRequest) => Promise<TransparentExportResponse>;
  onProgress: (callback: (progress: TransparentExportProgress) => void) => () => void;
}
