# Rust architecture

- model: validated placements, physical limits, page/group inheritance, profiles, and independent bounded undo/redo histories. Structures serialize to CLI JSON.
- assets: bounded decoding, EXIF orientation, DPI, self-contained SVG validation, resvg rendering, and Rust codecs. Fonts load once. Decoded assets cache by path/size/mtime with a 128 MiB budget.
- engine: shared preview/export compositor. Tiny-skia applies clipped premultiplied alpha transforms directly to the destination. Scaled sources have a separate 64 MiB cache; the last PDF preview base is reused during watermark edits. Large images bypass caches. Files/pages run sequentially to bound memory.
- pdf: lopdf preserves document content/resources for normal watermarking; each watermark embeds once per document. Hayro renders PDF pages entirely in Rust, including crop/rotation transforms. Explicit render contexts use checked integer dimensions to avoid float truncation. Image-only PDFs contain one opaque image XObject per page. Lossless RGB/predictor and optional 4:4:4 JPEG streams compete before embedding.
- output: preflight rejects duplicate outputs and writes over another input. Same-filesystem temporary files are synced and atomically persisted. Group exports publish via exclusive hard links and retry numbered names on races. Incomplete groups never publish.
- ui: egui/eframe native workbench with OS dialogs. A preview worker sleeps on a bounded wake channel, replaces pending requests, and rejects obsolete generations. Export runs on another worker with progress/cancellation. GUI confirmation and CLI --replace share preflight.
- cli: inspect, preview, normal batches, and groups use the same engine as the GUI.

Windowing, dialogs, graphics drivers, and installed fonts use native OS APIs. Application logic, document parsing/rendering, codecs, and composition are Rust. Packaging uses PowerShell/NSIS on Windows and system bundle tools on macOS. Electron sources remain in Git history.

CI runs format, Clippy, and tests before package jobs. Tag publishing waits for every package, verifies SHA-256 files, and publishes Windows portable/installer plus Apple Silicon/Intel DMG/ZIP assets.
