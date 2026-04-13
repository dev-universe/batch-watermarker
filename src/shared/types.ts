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

export interface WatermarkSettings {
  opacity: number;
  sizePx: number;
  rotation: number;
  placementMode: WatermarkPlacementMode;
  position: AnchorPosition | null;
  freeCenterX: number | null;
  freeCenterY: number | null;
  suffix: string;
  outputDirectory: string;
  overwriteOriginal: boolean;
}

export interface ProcessRequest {
  inputFiles: InputFile[];
  watermarkPath: string;
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
