# Release Stability Check

Date: 2026-04-15

## Automated Checks

- [x] `npm run typecheck`
- [x] `npm test`
  - 7 test files passed
  - 67 tests passed
- [x] `npm run build`
- [x] `npm run dist -- --dir`
  - Generated macOS app bundle:
    - `release/mac-arm64/Batch Watermarker.app`
  - Notarization was skipped because `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
    and `APPLE_TEAM_ID` are not set.
  - The build used ad-hoc macOS signing, which matches the current README
    distribution notes.

## Documentation Smoke Check

- [x] `README.md` includes macOS build, notarization, Windows build, and release
  validation notes.
- [x] `docs/architecture.md` exists and documents renderer state, interaction,
  export pipeline, preview/export parity, and refactoring rules.

## Manual Smoke Checklist

Run with `npm run dev` before tagging or distributing a release.

- [x] PDF preview loads
- [x] PNG/image preview loads
- [x] PDF page navigation works
- [x] input file picker works
- [x] input file drag-and-drop works
- [x] watermark image picker works
- [x] watermark image drag-and-drop works
- [x] opacity, size, and rotation controls work
- [x] width/height pixel inputs work
- [x] aspect ratio toggle and reset work
- [x] position presets work
- [x] watermark hover/select/deselect works
- [x] drag works
- [x] resize works
- [x] rotate works
- [x] Cmd/Ctrl corner aspect lock works
- [x] Shift rotation snap works
- [x] keyboard nudge works
- [x] undo/redo works
- [x] PDF export matches preview
- [x] PNG/image export matches preview
- [x] output folder empty + suffix empty shows original overwrite warning
- [x] output folder empty + suffix set saves beside each source file
- [x] output folder set + suffix empty saves to the selected output folder with the original filename
- [x] output folder set + suffix set saves to the selected output folder with the suffix
- [x] conflict confirmation appears when non-overwrite planned output paths collide

## Windows Release Checklist

Run on a Windows machine before Windows distribution.

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run dist`
- [ ] NSIS installer is generated
- [ ] installer launches and installs successfully
- [ ] installed app launches
- [ ] PDF/image preview and export smoke tests pass
- [ ] SmartScreen/code-signing expectations are documented for distribution
