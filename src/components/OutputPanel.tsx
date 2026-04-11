import type { ChangeEvent } from "react";
import type { ProcessResponse, WatermarkSettings } from "../shared/types";

interface OutputPanelProps {
  settings: WatermarkSettings;
  outputSummary: string;
  isProcessing: boolean;
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
