import type { CSSProperties, MutableRefObject } from "react";
import type { ResizeHandle } from "../shared/watermarkGeometry";

const RESIZE_HANDLES = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

interface PreviewPaneProps {
  selectedFileName: string;
  previewKind: "pdf" | "image" | null;
  pdfPageCount: number;
  pdfPreviewPage: number;
  previewBaseUrl: string;
  watermarkPreviewUrl: string;
  overlayStyle?: CSSProperties;
  overlayImageStyle?: CSSProperties;
  isWatermarkHovered: boolean;
  isWatermarkSelected: boolean;
  isWatermarkDragging: boolean;
  previewImageRef: MutableRefObject<HTMLImageElement | null>;
  onPreviousPdfPage: () => void;
  onNextPdfPage: () => void;
  onPreviewImageLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  onClearWatermarkSelection: () => void;
  onWatermarkPointerEnter: () => void;
  onWatermarkPointerLeave: () => void;
  onResizeHandlePointerDown: (
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLDivElement>
  ) => void;
  onRotateHandlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onWatermarkPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
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
  isWatermarkHovered,
  isWatermarkSelected,
  isWatermarkDragging,
  previewImageRef,
  onPreviousPdfPage,
  onNextPdfPage,
  onPreviewImageLoad,
  onClearWatermarkSelection,
  onWatermarkPointerEnter,
  onWatermarkPointerLeave,
  onResizeHandlePointerDown,
  onRotateHandlePointerDown,
  onWatermarkPointerDown
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

        <div className="preview-stage" onPointerDown={onClearWatermarkSelection}>
          {previewBaseUrl ? (
            <div className="preview-artboard">
              <img
                ref={previewImageRef}
                className="preview-image"
                src={previewBaseUrl}
                alt="Preview"
                draggable={false}
                onLoad={onPreviewImageLoad}
              />
              {watermarkPreviewUrl && overlayStyle && overlayImageStyle && (
                <div
                  className={`watermark-overlay ${isWatermarkHovered ? "hovered" : ""} ${isWatermarkSelected ? "selected" : ""} ${isWatermarkDragging ? "dragging" : ""}`}
                  style={overlayStyle}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    onWatermarkPointerDown(event);
                  }}
                  onDragStart={(event) => event.preventDefault()}
                  onPointerEnter={onWatermarkPointerEnter}
                  onPointerLeave={onWatermarkPointerLeave}
                >
                  <div className="watermark-transform-box" style={overlayImageStyle}>
                    <img
                      className="watermark-overlay-image"
                      src={watermarkPreviewUrl}
                      alt="Watermark preview"
                      draggable={false}
                    />
                    <div className="watermark-selection-outline" />
                    {isWatermarkSelected && (
                      <>
                        <div className="watermark-rotate-stem" />
                        <div
                          className="watermark-rotate-handle"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            onRotateHandlePointerDown(event);
                          }}
                        />
                        {RESIZE_HANDLES.map((handle) => (
                          <div
                            key={handle}
                            className={`watermark-resize-handle ${handle}`}
                            data-handle={handle}
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              event.currentTarget.setPointerCapture(event.pointerId);
                              onResizeHandlePointerDown(handle, event);
                            }}
                          />
                        ))}
                      </>
                    )}
                  </div>
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
