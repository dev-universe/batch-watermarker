import type { ChangeEvent } from "react";
import type { ProcessResponse, WatermarkSettings } from "../shared/types";
import type { PdfExportProfileId } from "../shared/pdfExportProfiles";
import { PdfExportOptions } from "./PdfExportOptions";

interface OutputPanelProps {
  settings: WatermarkSettings;
  outputSummary: string;
  isProcessing: boolean;
  rasterizePdf: boolean;
  onRasterizePdfChange: (checked: boolean) => void;
  pdfExportProfile: PdfExportProfileId;
  onPdfExportProfileChange: (value: PdfExportProfileId) => void;
  statusMessage: string;
  lastResult: ProcessResponse | null;
  onOpenOutputFolderPicker: () => void;
  onClearOutputDirectory: () => void;
  onOutputDirectoryChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSuffixChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onStartProcessing: () => void;
}

export function OutputPanel({
  settings,
  outputSummary,
  isProcessing,
  rasterizePdf,
  onRasterizePdfChange,
  pdfExportProfile,
  onPdfExportProfileChange,
  statusMessage,
  lastResult,
  onOpenOutputFolderPicker,
  onClearOutputDirectory,
  onOutputDirectoryChange,
  onSuffixChange,
  onStartProcessing
}: OutputPanelProps) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>출력</h2>
        <div className="output-actions">
          <button onClick={onOpenOutputFolderPicker}>출력 폴더 지정</button>
          <button disabled={!settings.outputDirectory} onClick={onClearOutputDirectory}>
            지정 해제
          </button>
        </div>
      </div>
      <label>
        <span>출력 폴더</span>
        <input
          type="text"
          value={settings.outputDirectory}
          onChange={onOutputDirectoryChange}
          placeholder="원본 덮어쓰기면 비워둘 수 있습니다."
        />
      </label>
      <label>
        <span>접미사</span>
        <input type="text" value={settings.suffix} onChange={onSuffixChange} placeholder="_wm" />
      </label>
      <p className="subtle">{outputSummary}</p>
      <button className="primary" disabled={isProcessing} onClick={onStartProcessing}>
        {isProcessing ? "처리 중..." : "워터마크 적용 시작"}
      </button>
      <label className="pdf-raster-option">
        <input
          type="checkbox"
          checked={rasterizePdf}
          disabled={isProcessing}
          onChange={(event) => onRasterizePdfChange(event.target.checked)}
          aria-describedby="pdf-raster-description"
        />
        <span>PDF의 경우 이미지 형식으로 변환 후 PDF로 저장</span>
      </label>
      <p id="pdf-raster-description" className="subtle pdf-raster-description">
        워터마크까지 페이지마다 하나의 이미지로 합칩니다. 텍스트 인식에는 OCR이 필요합니다.
        확대 시 벡터와 차이가 있으며, 파일 크기와 처리 시간이 늘어납니다.
      </p>
      {rasterizePdf && <PdfExportOptions value={pdfExportProfile} onChange={onPdfExportProfileChange} disabled={isProcessing} />}
      <p className="status">{statusMessage}</p>
      {lastResult && (
        <div className="result-list">
          {lastResult.results.map((result) => (
            <div key={result.outputPath} className="result-item">
              <strong>{result.outputPath}</strong>
            </div>
          ))}
          {lastResult.errors.map((error) => (
            <div key={error} className="result-item error">
              {error}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
