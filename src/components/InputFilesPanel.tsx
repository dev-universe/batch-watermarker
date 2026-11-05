import type { DragEvent } from "react";
import type { InputFile } from "../shared/types";
import { Icon } from "./Icon";

interface InputFilesPanelProps {
  inputFiles: InputFile[];
  selectedPreviewPath: string;
  onOpenInputPicker: () => void;
  onDropInputFiles: (event: DragEvent<HTMLElement>) => Promise<void>;
  onSelectPreview: (path: string) => void;
  onRemoveInputFile: (path: string) => void;
}

export function InputFilesPanel({
  inputFiles,
  selectedPreviewPath,
  onOpenInputPicker,
  onDropInputFiles,
  onSelectPreview,
  onRemoveInputFile
}: InputFilesPanelProps) {
  return (
    <section className="panel input-panel">
      <div className="panel-head">
        <h2>입력 파일 <span className="count">{inputFiles.length}</span></h2>
        <button className="icon-button" onClick={onOpenInputPicker} title="파일 선택" aria-label="파일 선택"><Icon name="add" /></button>
      </div>
      <div
        className={`dropzone input-dropzone ${inputFiles.length ? "compact" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => void onDropInputFiles(event)}
      >
        <Icon name="file" />
        <span>PDF와 이미지를 여기에 놓으세요.</span>
        <button onClick={onOpenInputPicker}>파일 선택</button>
      </div>
      <div className="file-list">
        {inputFiles.map((file) => (
          <div
            key={file.path}
            className={`file-item ${selectedPreviewPath === file.path ? "active" : ""}`}
          >
            <button className="file-pick" aria-pressed={selectedPreviewPath === file.path} title={file.path} onClick={() => onSelectPreview(file.path)}>
              <span>{file.name}</span>
              <small>{file.kind === "pdf" ? "PDF" : "이미지"}</small>
            </button>
            <button className="file-remove icon-button" title={`${file.name} 제거`} aria-label={`${file.name} 제거`} onClick={() => onRemoveInputFile(file.path)}>
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
