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

- [ ] PDF preview loads
- [ ] PNG/image preview loads
- [ ] PDF page navigation works
- [ ] input file picker works
- [ ] input file drag-and-drop works
- [ ] watermark image picker works
- [ ] watermark image drag-and-drop works
- [ ] opacity, size, and rotation controls work
- [ ] width/height pixel inputs work
- [ ] aspect ratio toggle and reset work
- [ ] position presets work
- [ ] watermark hover/select/deselect works
- [ ] drag works
- [ ] resize works
- [ ] rotate works
- [ ] Cmd/Ctrl corner aspect lock works
- [ ] Shift rotation snap works
- [ ] keyboard nudge works
- [ ] undo/redo works
- [ ] PDF export matches preview
- [ ] PNG/image export matches preview
- [ ] output folder empty + suffix empty shows original overwrite warning
- [ ] output folder empty + suffix set saves beside each source file
- [ ] output folder set + suffix empty saves to the selected output folder with the original filename
- [ ] output folder set + suffix set saves to the selected output folder with the suffix
- [ ] conflict confirmation appears when non-overwrite planned output paths collide

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
