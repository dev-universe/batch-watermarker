import type { DragEvent } from "react";
import type { InputFile } from "../shared/types";

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
    <section className="panel">
      <div className="panel-head">
        <h2>입력 파일</h2>
        <button onClick={onOpenInputPicker}>파일 선택</button>
      </div>
      <div
        className="dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => void onDropInputFiles(event)}
      >
        PDF와 이미지 파일을 여기로 드래그하세요.
      </div>
      <div className="file-list">
        {inputFiles.map((file) => (
          <div
            key={file.path}
            className={`file-item ${selectedPreviewPath === file.path ? "active" : ""}`}
          >
            <button className="file-pick" onClick={() => onSelectPreview(file.path)}>
              <span>{file.name}</span>
              <small>{file.kind.toUpperCase()}</small>
            </button>
            <button className="file-remove" onClick={() => onRemoveInputFile(file.path)}>
              제거
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
