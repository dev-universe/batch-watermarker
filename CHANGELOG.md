# Changelog

## 2.0.0 — 2026-11-05

- Ported both desktop editors and the complete processing pipeline to Rust.
- Replaced Electron/React/TypeScript, Sharp, PDF.js, and pdf-lib with egui,
  tiny-skia, image/resvg, Hayro, and lopdf. No JavaScript runtime ships.
- Preserved layers, direct manipulation, independent undo/redo, grouped pages,
  shared/local backgrounds and watermarks, DPI, and three PDF profiles.
- Correctly maps watermark placement through PDF crop/rotation transforms while
  retaining original content and inherited resources in vector-preserving mode.
- Added bounded decode/transform caches, cached PDF preview bases, a sleeping
  preview worker with request coalescing, and fewer full-image copies.
- Added a CLI for inspect, preview, JSON batches, and grouped project exports.
- Hardened atomic output publication, overwrite preflight, cancellation, and
  group-name collision handling. SVG inputs in the normal editor export as PNG.
- Added 34 engine, CLI, native pointer, and GUI-state regression tests and a
  reproducible A4 benchmark. See docs/rust-validation.md for measured results.
- Added Windows/macOS/Linux CI, native Windows installer/portable packaging,
  Apple Silicon/Intel Mac packages, and checksum-verified release publishing.

## 1.3.0 — 2026-11-05

- Preserved the 1.2.0 transparent-image editor and PDF compression profiles.
- Rebuilt the watermark editor as a three-region desktop workbench: source files, a
  persistent document preview, and watermark/output controls.
- Applied Hallmark's Wayfind material in app scope: cool neutral surfaces,
  square controls, restrained cobalt selection, and system fonts for offline
  Korean text. Removed nested cards, decorative gradients and heavy shadows.
- Added compact labelled layer actions, file/layer counts, toolbar undo/redo,
  disclosed editing help, visible keyboard focus and named numeric controls.
- Preserved multi-layer editing, direct manipulation, history, PDF pagination,
  overwrite safeguards and both PDF export modes.
- Raised touch targets on coarse pointers and added stacked narrow layouts.
- Matched the Electron launch background to the document workspace.
- Scoped test collection to application test directories so temporary review
  checkouts and installed dependency tests are not collected.

Validation: see [the redesign plan](docs/hallmark-redesign-plan.md).
