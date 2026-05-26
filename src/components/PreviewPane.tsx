import type { CSSProperties, MutableRefObject } from "react";
import type { ResizeHandle } from "../shared/watermarkGeometry";

const RESIZE_HANDLES = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

interface PreviewPanePreviewProps {
  selectedFileName: string;
  previewKind: "pdf" | "image" | null;
  previewBaseUrl: string;
}

interface PreviewPanePagerProps {
  pdfPageCount: number;
  pdfPreviewPage: number;
  onPreviousPdfPage: () => void;
  onNextPdfPage: () => void;
}

interface PreviewPaneImageProps {
  previewImageRef: MutableRefObject<HTMLImageElement | null>;
  onPreviewImageLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void;
}

interface PreviewPaneOverlayProps {
  isWatermarkHovered: boolean;
  isWatermarkSelected: boolean;
  isWatermarkDragging: boolean;
}

interface PreviewPaneWatermarkLayer {
  id: string;
  name: string;
  previewUrl: string;
  overlayStyle: CSSProperties;
  overlayImageStyle: CSSProperties;
  isActive: boolean;
  zIndex: number;
  visible: boolean;
}

interface PreviewPaneInteractionProps {
  onClearWatermarkSelection: () => void;
  onSelectWatermarkLayer: (layerId: string) => void;
  onWatermarkPointerEnter: () => void;
  onWatermarkPointerLeave: () => void;
  onResizeHandlePointerDown: (
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLDivElement>
  ) => void;
  onRotateHandlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onWatermarkPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}

interface PreviewPaneProps {
  preview: PreviewPanePreviewProps;
  pager: PreviewPanePagerProps;
  image: PreviewPaneImageProps;
  overlay: PreviewPaneOverlayProps;
  interaction: PreviewPaneInteractionProps;
  watermarkLayers: PreviewPaneWatermarkLayer[];
}

export function PreviewPane({
  preview,
  pager,
  image,
  overlay,
  interaction,
  watermarkLayers
}: PreviewPaneProps) {
  const { selectedFileName, previewKind, previewBaseUrl } = preview;
  const { pdfPageCount, pdfPreviewPage, onPreviousPdfPage, onNextPdfPage } = pager;
  const { previewImageRef, onPreviewImageLoad } = image;
  const {
    isWatermarkHovered,
    isWatermarkSelected,
    isWatermarkDragging
  } = overlay;
  const {
    onClearWatermarkSelection,
    onSelectWatermarkLayer,
    onWatermarkPointerEnter,
    onWatermarkPointerLeave,
    onResizeHandlePointerDown,
    onRotateHandlePointerDown,
    onWatermarkPointerDown
  } = interaction;

  return (
    <main className="preview-pane">
      <div className="preview-sticky">
        <div className="preview-head">
          <div>
            <p className="eyebrow">Preview</p>
            <h2>{selectedFileName}</h2>
            <div className="preview-hint">
              <p>워터마크를 클릭해 선택하고 드래그해 이동할 수 있습니다.</p>
            </div>
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
              {watermarkLayers
                .filter((layer) => layer.visible)
                .map((layer) => (
                <div
                  key={layer.id}
                  className={`watermark-overlay ${layer.isActive && isWatermarkHovered ? "hovered" : ""} ${layer.isActive && isWatermarkSelected ? "selected" : ""} ${layer.isActive && isWatermarkDragging ? "dragging" : ""}`}
                  style={{
                    ...layer.overlayStyle,
                    zIndex: layer.zIndex
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    onSelectWatermarkLayer(layer.id);
                    onWatermarkPointerDown(event);
                  }}
                  onDragStart={(event) => event.preventDefault()}
                  onPointerEnter={() => {
                    if (layer.isActive) {
                      onWatermarkPointerEnter();
                    }
                  }}
                  onPointerLeave={() => {
                    if (layer.isActive) {
                      onWatermarkPointerLeave();
                    }
                  }}
                >
                  <div className="watermark-transform-box" style={layer.overlayImageStyle}>
                    <img
                      className="watermark-overlay-image"
                      src={layer.previewUrl}
                      alt={`${layer.name} watermark preview`}
                      draggable={false}
                    />
                    {layer.isActive && (
                      <>
                        <div className="watermark-selection-outline" />
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
              ))}
            </div>
          ) : (
            <div className="empty-preview">미리볼 입력 파일을 선택하세요.</div>
          )}
        </div>

        <div className="preview-hint">
          <p>Cmd/Ctrl + 코너 핸들: 현재 비율 유지</p>
          <p>Shift + 회전 드래그: 15도 단위 스냅</p>
          <p>방향키: 1px 이동 / Shift + 방향키: 10px 이동</p>
          <p>Esc: 선택 해제</p>
        </div>
      </div>
    </main>
  );
}
