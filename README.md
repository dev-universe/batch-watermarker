# Batch Watermarker

Native Rust desktop workbench for batch watermarking PDFs and images on Windows and macOS. Both editors, preview rendering, compositing, PDF processing, image codecs, and the CLI are implemented in Rust. The application ships without Electron, Node.js, a browser, PDFium, Sharp, or JavaScript.

## Download

Get packages from [GitHub Releases](https://github.com/dev-universe/batch-watermarker/releases/latest).

- Windows x64: portable ZIP (GUI and CLI) or per-user Setup EXE.
- macOS Apple Silicon / Intel: DMG (app and CLI) or ZIP (app).

Windows packages are unsigned. macOS apps are ad-hoc signed, without Apple notarization. OS distribution warnings can occur. Document processing requires no network connection.

## Watermark editor

1. Add PDFs, PNG, JPEG, WebP, TIFF, or SVG images. Drop files into the source or preview area to import them; drop images onto the right settings panel to add watermark layers.
2. Add watermark images. Adjust visibility, lock, order, name, opacity, size, rotation, and nine placement presets. Duplicate and remove layers independently.
3. Select a watermark in the preview. Drag to move, use edge/corner handles to resize, or use the round handle to rotate. Ctrl/Cmd + corner drag preserves the box aspect ratio; Shift snaps rotation to 15°. Arrow keys move by one document pixel, Shift + arrow by ten. Escape clears selection.
4. Choose an output folder and filename suffix. An empty folder saves beside the source. Empty suffix and folder replace the original **after confirmation**. Existing outputs also require confirmation. Duplicate planned outputs and writes over another input are rejected.
5. Export with original PDF text/vectors, or enable image-only PDF export. Image-only output contains one opaque image per page, without source text, vectors, attachments, or separate watermark objects.

SVG sources in this editor export as PNG. Raster formats retain their file type; PNG, JPEG, TIFF, and WebP retain DPI. JPEG uses quality 95 and 4:4:4 sampling. PNG/WebP/TIFF retain alpha. PDF crop boxes, rotation, displayed dimensions, inherited resources, and watermark alpha are handled explicitly.

Ctrl/Cmd + Z undoes; Ctrl + Y or Ctrl/Cmd + Shift + Z redoes. Slider gestures form one undo entry. Both tabs retain their state, profiles, and independent histories during the session.

## Transparent image editor

Create named groups and import SVG or raster pages. Imports use natural filename order; reorder pages or move them between groups. A group may contain different physical page sizes.

Add a proportional fill/fit background and watermark layers. Backgrounds and watermarks follow common settings by default. Enable **이 그룹만** to copy the effective setting into an independent override; disable it to resume inheritance. An empty local background or layer list clears that setting only for the group.

Select the source image to edit scale, margin in mm, position, or rotation. Direct dragging, resizing, rotation, and keyboard nudging retain page size. Composition order is white → background → source → visible watermark layers. Each nonempty group exports to a separate image-only PDF. Existing outputs are never replaced; collisions use (2), (3), etc. A failed page discards its entire group while other groups continue. Cancel stops before publishing the active incomplete file/group.

SVG physical dimensions retain print size. Pixel/unitless and viewBox dimensions use 96 PPI; raster inputs use density metadata or 96 PPI. SVG scripts, event handlers, foreign objects, external images, external CSS URLs, and document/entity declarations are rejected. Embed images and use installed fonts or outlined text. GUI projects remain in memory for the session; CLI project JSON can be saved separately.

## PDF profiles

| Profile | Resolution | Encoding |
| --- | --- | --- |
| Original / 원본 보존 | 600 DPI | Exact lossless RGB |
| Quality / 고화질 | 450 DPI | JPEG quality 95 or smaller lossless stream |
| Distribution / 배포용 | 300 DPI | JPEG quality 90 or smaller lossless stream |

The encoder compares plain RGB Deflate and adaptive PNG row predictors. JPEG uses 4:4:4 sampling. Profiles preserve physical page dimensions, but lower resolutions and JPEG change raster quality. Pages exceeding 150 million pixels or 32767px on either edge fail explicitly; quality is never silently reduced. Encrypted PDFs are unsupported. Hayro's [renderer limitations](https://docs.rs/hayro/0.9.0/hayro/) apply to unusual PDF features.

## Build and verify

Install [Rust](https://rustup.rs/) (MSVC Build Tools on Windows; Xcode command line tools on macOS). The locked dependencies require Rust 1.92 or newer.

~~~sh
cargo run --release
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked --all-targets
cargo build --release --locked --bins
~~~

Linux development also needs libxkbcommon-dev, libwayland-dev, libxcb-shape0-dev, libxcb-xfixes0-dev, and libegl1-mesa-dev. Linux is tested in CI; published desktop packages target Windows and macOS.

~~~powershell
# Windows ZIP and NSIS installer (install NSIS or supply -NsisPath)
./scripts/package-windows.ps1
~~~

~~~sh
# macOS DMG and app ZIP
cargo build --release --locked --bins --target aarch64-apple-darwin
bash scripts/package-macos.sh aarch64-apple-darwin
~~~

Packages and SHA-256 files are written to release/rust/. CI validates Windows, macOS, and Linux, builds both Mac architectures and Windows x64, and publishes verified assets after a v2.* tag passes the complete workflow.

## CLI

~~~sh
watermark-cli watermark input.pdf image.png --watermark logo.png --output exports
watermark-cli watermark input.pdf --watermark logo.png --flatten --profile distribution
watermark-cli watermark input.pdf --watermark logo.png --suffix "" --replace
watermark-cli preview input.pdf preview.png --page 2 --edge 1400
watermark-cli inspect score.svg
watermark-cli batch batch.json
watermark-cli groups project.json --output exports --profile original
~~~

The CLI prints JSON and exits nonzero on any file error. Replacement requires --replace. Batch and project JSON match the public structures in [src/model.rs](src/model.rs). A null group layers value inherits; [] clears. Group background uses "inherit", null, or a background object. See [architecture](docs/architecture.md), [validation](docs/rust-validation.md), and [release notes](docs/release-2.0.0.md).

~~~sh
cargo run --release --example benchmark -- tmp/rust-benchmark
~~~

The synthetic A4 benchmark writes comparison PDFs/report.json, verifies cached preview pixels, and exercises group export. Performance depends on the document and machine. [Third-party notices](THIRD_PARTY_NOTICES.md) ship with packages.
