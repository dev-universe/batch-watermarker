# Batch Watermarker

Desktop app for batch-applying image watermarks to PDF and image files on macOS and Windows.

## Features

- Drag and drop PDF and image files as inputs
- Drag and drop a watermark image
- Adjust watermark opacity, size, rotation, and 9-position placement
- Preview image and PDF files before processing
- Batch output to a selected folder or overwrite originals
- Preserve image DPI metadata when exporting supported image formats

## Tech Stack

- Electron
- React
- TypeScript
- `pdf-lib`
- `sharp`
- `pdfjs-dist`

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run dist -- --dir
```

The packaged macOS app is created under `release/mac-arm64/`.

## Notes

- If the suffix is left empty, the app warns before overwriting original files.
- macOS packaging currently uses ad-hoc signing unless Apple signing credentials are configured.
