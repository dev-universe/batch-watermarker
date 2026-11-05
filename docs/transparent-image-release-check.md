# Transparent Image Editor 1.1.0 validation

Date: 2026-10-30 (Asia/Seoul)

## Automated checks

- TypeScript renderer and Electron checks pass.
- 18 Vitest files / 125 tests pass, including SVG units, raster density/orientation, transparent compositing, watermark order/opacity, rotation/clipping, page transforms, and group overrides.
- PDF assertions verify original page sizes, page order, one opaque image per page, 600 DPI dimensions, lossless Flate streams, exact RGB composition, and unchanged source bytes.
- Failure tests cover malformed/missing SVGs, excessive page sizes/margins, group-level rollback, continued processing of valid groups, empty groups, sanitized names, and concurrent output-name collisions without overwrites.
- Production renderer and Electron builds pass.
- Windows x64 NSIS installer and portable packaging pass.

## App verification

The Electron smoke test runs against development Electron and the unpacked Windows application. It only substitutes file-picker responses; composition, IPC, worker loading, native image libraries, filesystem output, and PDF creation run normally.

- Two naturally sorted SVG pages in group A and one page in group B.
- Shared background plus two simultaneously applied SVG watermark layers.
- Page margin/scale controls, watermark position and rotation controls.
- Separate group background/watermark overrides leave the shared group unchanged.
- Tab switching retains editor state.
- Direct drag and keyboard undo restore the original position.
- Group A exports two pages; group B exports one page, with no renderer exceptions.
- Poppler renders the first exported PDF page; visible score lines, labels, background, and watermark placements match the editor.

Reports, screenshots, logs, and generated PDFs are under ignored `tmp/transparent-qa/` and `tmp/transparent-packaged-qa/`. They contain synthetic fixtures, not user documents.

## Distribution

- `npm run dist:win` produces `release/Batch Watermarker Setup 1.1.0.exe` and `release/Batch Watermarker 1.1.0.exe`.
- Use the portable EXE to run without installation. An installer was built; it was not installed over the user's existing application.
- Outputs preserve physical page size and flatten SVGs, backgrounds, and watermarks into 600 DPI lossless page images.
- Projects are session-only. SVGs requiring external resources must embed them first. Installed fonts or outlined text are required for reproducible SVG typography.
- Exclusive publishing uses hard links within the selected output directory, supported by the tested NTFS filesystem. Filesystems without hard-link support report an export error without overwriting files.
