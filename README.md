# Batch Watermarker

Desktop app for batch-applying image watermarks to PDF and image files on macOS and Windows.

## Features

- Drag and drop PDF and image files as inputs
- Drag and drop a watermark image
- Adjust watermark opacity, size, rotation, and 9-position placement
- Preview image and PDF files before processing
- Batch output to a selected folder, save beside the source files, or overwrite originals
- Preserve image DPI metadata when exporting supported image formats

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
6. Start processing.

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

- If `suffix` is empty, the app warns before overwriting the original files.
- If `suffix` is set and `output folder` is empty, the result is saved next to each source file.
- If `suffix` is set and `output folder` is set, the result is saved in the selected output folder.
- Before processing starts, the app checks for planned output path conflicts and asks for confirmation if conflicts are found.

## Tests

```bash
npm test
```

## Project Notes

- Architecture and refactoring boundaries: [docs/architecture.md](/Users/fd2/dev/pdf-watermark/docs/architecture.md)
- Release validation checklist: [docs/release-stability-check.md](/Users/fd2/dev/pdf-watermark/docs/release-stability-check.md)

## Build For macOS

Create the app bundle without installer packaging:

```bash
npm run dist -- --dir
```

The packaged macOS app is created here:

- `release/mac-arm64/PDF Watermark.app`

Create a zip file for sharing:

```bash
ditto -c -k --sequesterRsrc --keepParent "release/mac-arm64/PDF Watermark.app" "release/mac-arm64/PDF Watermark-mac.zip"
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
- overwrite warning appears when suffix is empty
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
