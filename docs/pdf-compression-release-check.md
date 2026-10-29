# PDF compression 1.2.0 validation

Date: 2026-10-30 (Asia/Seoul)

## Behaviour

- Original: 600 DPI, lossless, default. Existing 600 DPI RGB pixels are preserved.
- High quality / smaller size: 450 DPI, JPEG quality 95 with 4:4:4 sampling, or lossless if smaller.
- Distribution: 300 DPI, JPEG quality 90 with 4:4:4 sampling, or lossless if smaller.
- Both tabs have independent profile selectors. The existing watermark editor shows its selector only when image-only PDF output is enabled.
- All profiles retain physical page dimensions, one opaque page image, and combined watermarks. Normal PDF and standalone image exports retain their existing behaviour.

## Checks

- Renderer/Electron type checks and production builds pass.
- 19 Vitest files / 137 tests pass, including independent PNG predictor reversal, exact RGB comparison, PDF.js rendering of predictor streams, JPEG colour sampling, flat-colour lossless fallback, per-mode resolution and physical size.
- The grouped-editor export and legacy PDF worker both pass the packaged-app smoke test for all three profiles, using their real renderer/IPC/worker paths. Group outputs have 2 + 1 pages, and legacy outputs have two mixed-size pages.
- Group overrides, direct drag/undo, tab state retention, independent profile selection, and collision-safe filenames pass the smoke test. No renderer errors or Electron stderr errors were observed.
- Windows x64 NSIS installer and portable EXE build successfully. The installer is not installed over the user's existing application.

## Five-page comparison

Synthetic five-page 150 x 210 mm score with a textured paper background and a translucent, rotated image watermark. These are development fixtures, not the user's reported 38 MB document.

| Output | Bytes | MB (decimal) | Reduction vs previous |
| --- | ---: | ---: | ---: |
| Previous 1.1 encoder, 600 DPI | 99,941,561 | 99.94 | — |
| Original, 600 DPI lossless | 50,843,367 | 50.84 | 49.1% |
| High quality, 450 DPI | 8,237,148 | 8.24 | 91.8% |
| Distribution, 300 DPI | 3,523,319 | 3.52 | 96.5% |

Every original-mode page has the exact same RGB hash as the previous encoder's 600 DPI source raster. Poppler's first-page renders of the previous and original-mode PDFs are also byte-identical. All three profile renders were visually inspected for score lines, note shapes, labels, background colours, and watermark placement.

Savings vary with content; the smooth-background app smoke fixture used lossless encoding even for the smaller profiles, whereas all five textured pages selected JPEG in quality/distribution modes. No claim is made about the final size of an unexamined user file.

Run `node scripts/benchmark-pdf-profiles.cjs` after building to reproduce the five-page comparison. Reports and rendered previews are under ignored `tmp/compression-qa/`. The app smoke reports are under `tmp/transparent-qa/` and `tmp/transparent-packaged-qa/`.
