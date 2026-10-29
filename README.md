# Batch Watermarker

Desktop app for batch-applying image watermarks to PDF and image files on macOS and Windows.

## Features

- Drag and drop PDF and image files as inputs
- Drag and drop a watermark image
- Adjust watermark opacity, size, rotation, and 9-position placement
- Preview image and PDF files before processing
- Batch output to a selected folder, save beside the source files, or overwrite originals
- Preserve image DPI metadata when exporting supported image formats
- Optionally flatten watermarked PDFs to image-only PDFs (600 DPI, lossless compression)
- Compose grouped transparent SVG/image pages with a background and multiple watermark images
- Export each group as a separate 600 DPI lossless, image-only PDF

## Transparent Image Editor (1.1)

Open the **투명 이미지 편집** tab to assemble SVG or image pages into grouped PDFs.

1. Create and name groups. Each nonempty group becomes one PDF named after the group.
2. Add SVG, PNG, JPEG, WebP, or TIFF files to each group. New selections use natural filename order; use the page buttons to reorder, remove, or move pages between groups.
3. Optionally add a background. Choose proportional **fill** (cropped to the page) or **fit** (the entire image is visible).
4. Add any number of watermark images. Every visible watermark is applied to every page, in layer-list order; the last layer is on top. Edit position, width/height, opacity, rotation, visibility, lock, and order independently.
5. Background and watermark settings default to **전체 공통**. Select **이 그룹만** to copy the current setting into an independent group override. Returning to common resumes following the shared setting. Removing a local background does not remove other groups' backgrounds.
6. Select an input image to change its scale, margin in mm, position, or rotation. Page size stays fixed. Select an image first, then drag to move, use corner handles to resize, or use the top circle to rotate. Shift snaps rotation to 15 degrees. Arrow keys nudge by 1 document pixel, Shift + arrow keys by 10. Ctrl/Cmd + Z and redo apply to the active tab.
7. Select an output folder and choose **그룹별 PDF 저장**. Existing files are never overwritten: duplicate names get `(2)`, `(3)`, etc. Empty groups are skipped.

SVG physical units retain their printed size. Pixel/unitless dimensions and a viewBox-only size use 96 PPI; raster images use valid density metadata or 96 PPI. A group can contain differently sized pages. The composition order is white, background, input image, then watermark layers. SVG scripts and external image/style references are rejected; include external images in the SVG and use installed fonts or outlined text for portable rendering.

Output embeds one opaque, lossless 600 DPI image per page. It preserves the displayed result rather than editable SVG objects. Oversized pages fail explicitly instead of silently reducing quality. If any page fails, that group's incomplete PDF is discarded and other groups continue. Input files are never modified. Tab contents and independent undo histories survive tab switching within the session; projects are not saved between app launches.

Build both Windows x64 installers and portable executables with `npm run dist:win`:

- `release/Batch Watermarker Setup 1.1.0.exe` — installer
- `release/Batch Watermarker 1.1.0.exe` — portable app

For an end-to-end smoke test after `npm run build`, run:

```powershell
node scripts/verify-transparent-editor.cjs <folder-containing-playwright>
# Optional final argument: absolute path to release/win-unpacked/Batch Watermarker.exe
```

The smoke test uses synthetic score fixtures and the real renderer → IPC → worker → PDF pipeline. It replaces only file-picker responses and writes screenshots, sample PDFs, and a JSON report under `tmp/transparent-qa` (or `tmp/transparent-packaged-qa`).

## Tech Stack

- Electron
- React
- TypeScript
- `pdf-lib`
- `sharp`
- `pdfjs-dist`

## Requirements

- macOS or Windows
- Node.js 20+

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

## Usage

1. Add one or more PDF or image files.
2. Add a watermark image.
3. Adjust opacity, size, rotation, and position.
4. Optionally choose an output folder.
5. Set a suffix.
6. Optionally enable image-only PDF output using the checkbox below the start button.
7. Start processing.

The checkbox below the start button, `PDF의 경우 이미지 형식으로 변환 후 PDF로 저장`,
creates a fresh PDF with one flattened image per page. Text, vectors, forms,
attachments, and separate watermark objects are not copied. Text recognition
requires OCR; the page image can still be extracted or edited as an image.
Pages retain their displayed physical size and orientation. Rendering uses
600 DPI with lossless PNG compression, but rasterization cannot retain the
unlimited zoom quality of vectors. Files and processing time can grow substantially.
Oversized pages fail explicitly rather than exporting at a reduced resolution.
The option defaults to off and does not change image-file processing.

### Direct Manipulation

- Click the watermark in the preview to select it.
- Drag the watermark to move it. The center snaps near the built-in 3x3 placement points.
- Drag any edge handle to resize on a single axis.
- Drag any corner handle to resize both axes.
- Hold `Cmd` on macOS or `Ctrl` on Windows while dragging a corner handle to keep the current box aspect ratio.
- Drag the top rotation handle to rotate the watermark directly.
- Hold `Shift` while rotating to snap rotation to 15-degree steps.
- Use the arrow keys to nudge the selected watermark by 1 document pixel.
- Use `Shift + arrow keys` to nudge by 10 document pixels.
- Press `Esc` to clear the current watermark selection.
- Undo and redo are supported with:
  - macOS: `Cmd + Z`, `Shift + Cmd + Z`
  - Windows: `Ctrl + Z`, `Ctrl + Y`, `Shift + Ctrl + Z`

### Output Rules

- If both `output folder` and `suffix` are empty, the app warns before overwriting the original files.
- If `output folder` is empty and `suffix` is set, the result is saved next to each source file.
- If `output folder` is set and `suffix` is empty, the result is saved in the selected output folder with the original filename.
- If both `output folder` and `suffix` are set, the result is saved in the selected output folder with the suffix.
- Before processing starts, the app checks for planned output path conflicts and asks for confirmation if conflicts are found.

## Tests

```bash
npm test
```

To verify both PDF export modes against a real PDF and watermark after building:

```bash
npm run build:electron
node scripts/verify-raster-pdf.cjs input.pdf watermark.png output/pdf
```

This checks page sizes, image-only structure, text removal, unchanged source bytes,
and exact rendered RGB pixels at 600 DPI. It writes PDFs, preview images, and a JSON report.

## Project Notes

- Architecture and refactoring boundaries: [docs/architecture.md](/Users/fd2/dev/pdf-watermark/docs/architecture.md)
- Release validation checklist: [docs/release-stability-check.md](/Users/fd2/dev/pdf-watermark/docs/release-stability-check.md)

## Build For macOS

Create the app bundle without installer packaging:

```bash
npm run dist -- --dir
```

The packaged macOS app is created here:

- `release/mac-arm64/Batch Watermarker.app`

Create a zip file for sharing:

```bash
ditto -c -k --sequesterRsrc --keepParent "release/mac-arm64/Batch Watermarker.app" "release/mac-arm64/Batch Watermarker-mac.zip"
```

## macOS Distribution Notes

- The current default build uses ad-hoc signing.
- Without Apple code signing and notarization, Gatekeeper may block the app on another Mac.
- In that case, the recipient may need to right-click the app and choose `Open`.

### Notarization

If you want a smoother end-user install experience, configure these environment variables before building:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

The notarization hook is already wired through [scripts/notarize.cjs](/Users/fd2/dev/pdf-watermark/scripts/notarize.cjs).

## Release Signing Policy

- Internal testing or personal use can use the current ad-hoc macOS signing flow.
- Public macOS distribution should use Apple Developer ID signing and notarization.
- Public Windows distribution should use Windows code signing to reduce SmartScreen warnings.
- If code signing is not configured, communicate the expected Gatekeeper or SmartScreen warning before sharing the app.

## Windows Build Notes

- Windows packaging is configured through `electron-builder` with the `nsis` target.
- Build the Windows installer on a Windows machine for the most reliable result.

### Build On Windows

```bash
npm install
npm run dist
```

The default Windows target is `nsis`.

### Validate Before Release

- installer creation succeeds
- installer launch succeeds
- app launch succeeds after install
- input file drag and drop works
- watermark image drag and drop works
- file picker and output folder picker work
- PDF preview works
- image preview works
- PDF page navigation works
- PDF export works
- image export works
- suffix output beside the source file works
- selected output folder export works
- overwrite warning appears when output folder and suffix are both empty
- preflight conflict confirmation appears when output paths collide
- rotated watermark output matches preview
- output files open normally after export

### Windows Distribution Notes

- Without Windows code signing, SmartScreen warnings are possible on another machine.
- If you plan to distribute commercially, add Windows code signing before release.
- Confirm that the generated installer uses the expected icon from `build/icon.ico`.
- Test at least one clean machine or VM before shipping.

## Packaging Commands

Build the default distributables:

```bash
npm run dist
```

Build the unpacked app only:

```bash
npm run dist -- --dir
```

## Notes

- Icons are generated from [assets/app-icon.svg](/Users/fd2/dev/pdf-watermark/assets/app-icon.svg) through [scripts/generate-icons.mjs](/Users/fd2/dev/pdf-watermark/scripts/generate-icons.mjs).
- macOS entitlements are defined in [build/entitlements.mac.plist](/Users/fd2/dev/pdf-watermark/build/entitlements.mac.plist).
