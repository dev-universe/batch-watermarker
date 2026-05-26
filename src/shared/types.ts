export type AnchorPosition =
  | "NW"
  | "N"
  | "NE"
  | "W"
  | "C"
  | "E"
  | "SW"
  | "S"
  | "SE";

export type SupportedKind = "pdf" | "image";
export type WatermarkPlacementMode = "preset" | "free";

export interface InputFile {
  path: string;
  name: string;
  kind: SupportedKind;
}

export interface WatermarkLayer {
  id: string;
  file: InputFile;
  settings: WatermarkSettings;
  visible: boolean;
  previewPayload: PreviewPayload;
  naturalSize: {
    width: number;
    height: number;
  };
}

export interface WatermarkSettings {
  opacity: number;
  sizeRatio: number;
  preserveAspectRatio: boolean;
  rotation: number;
  placementMode: WatermarkPlacementMode;
  position: AnchorPosition | null;
  freeCenterXRatio: number | null;
  freeCenterYRatio: number | null;
  freeWidthRatio: number | null;
  freeHeightRatio: number | null;
  suffix: string;
  outputDirectory: string;
  overwriteOriginal: boolean;
}

export interface ProcessRequest {
  inputFiles: InputFile[];
  watermarkLayers: WatermarkLayer[];
  settings: WatermarkSettings;
}

export interface ProcessResult {
  sourcePath: string;
  outputPath: string;
}

export interface ProcessResponse {
  results: ProcessResult[];
  errors: string[];
}

export interface PreviewPayload {
  kind: SupportedKind;
  data: Uint8Array;
  mimeType: string;
  name: string;
}
