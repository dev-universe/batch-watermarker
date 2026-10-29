/// <reference types="vite/client" />

import type { InputFile, PreviewPayload, ProcessRequest, ProcessResponse } from "./shared/types";
import type { TransparentImageApi } from "./shared/transparentImageTypes";

declare global {
  interface Window {
    transparentImageApi: TransparentImageApi;
    watermarkApi: {
      pickInputFiles: () => Promise<InputFile[]>;
      pickWatermarkFiles: () => Promise<InputFile[]>;
      pickOutputFolder: () => Promise<string>;
      normalizeDroppedFiles: (paths: string[]) => Promise<InputFile[]>;
      process: (request: ProcessRequest) => Promise<ProcessResponse>;
      readPreview: (filePath: string) => Promise<PreviewPayload>;
      findExistingPaths: (paths: string[]) => Promise<string[]>;
      toFileUrl: (filePath: string) => Promise<string>;
      getPathForFile: (file: File) => string;
    };
  }
}

export {};
