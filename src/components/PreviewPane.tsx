import type { CSSProperties, MutableRefObject } from "react";

interface PreviewPaneProps {
  selectedFileName: string;
  previewKind: "pdf" | "image" | null;
  pdfPageCount: number;
  pdfPreviewPage: number;
  previewBaseUrl: string;
  watermarkPreviewUrl: string;
  overlayStyle?: CSSProperties;
  overlayImageStyle?: CSSProperties;
  previewImageRef: MutableRefObject<HTMLImageElement | null>;
  onPreviousPdfPage: () => void;
  onNextPdfPage: () => void;
  onPreviewImageLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void;
}

export function PreviewPane({
  selectedFileName,
  previewKind,
  pdfPageCount,
  pdfPreviewPage,
  previewBaseUrl,
  watermarkPreviewUrl,
  overlayStyle,
  overlayImageStyle,
  previewImageRef,
  onPreviousPdfPage,
  onNextPdfPage,
  onPreviewImageLoad
}: PreviewPaneProps) {
  return (
    <main className="preview-pane">
      <div className="preview-sticky">
        <div className="preview-head">
          <div>
            <p className="eyebrow">Preview</p>
            <h2>{selectedFileName}</h2>
          </div>
          {previewKind === "pdf" && pdfPageCount > 0 && (
            <div className="pdf-pager">
              <button onClick={onPreviousPdfPage} disabled={pdfPreviewPage <= 1}>
                이전
              </button>
              <span>
                {pdfPreviewPage} / {pdfPageCount}
              </span>
              <button onClick={onNextPdfPage} disabled={pdfPreviewPage >= pdfPageCount}>
                다음
              </button>
            </div>
          )}
        </div>

        <div className="preview-stage">
          {previewBaseUrl ? (
            <div className="preview-artboard">
              <img
                ref={previewImageRef}
                className="preview-image"
                src={previewBaseUrl}
                alt="Preview"
                onLoad={onPreviewImageLoad}
              />
              {watermarkPreviewUrl && overlayStyle && overlayImageStyle && (
                <div className="watermark-overlay" style={overlayStyle}>
                  <img
                    className="watermark-overlay-image"
                    src={watermarkPreviewUrl}
                    alt="Watermark preview"
                    style={overlayImageStyle}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="empty-preview">미리볼 입력 파일을 선택하세요.</div>
          )}
        </div>
      </div>
    </main>
  );
}
