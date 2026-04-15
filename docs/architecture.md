# Architecture Notes

This document records the current module boundaries and refactoring rules for
Batch Watermarker. Keep it short and update it when responsibility boundaries
change.

## Renderer State

`src/App.tsx` composes hooks and panel props. It should not own long-running
workflows or direct manipulation algorithms.

- `useEditableStateHistory` owns editable app state, undo/redo, and continuous
  edit grouping.
- `usePreviewState` owns selected preview resolution, preview payload loading,
  object URLs, PDF page rendering, preview dimensions, and watermark preview
  dimensions.
- `useProcessingState` owns process submission state, validation, overwrite
  confirmation, conflict preflight, and process API orchestration.
- `useFileSelectionActions` owns input/watermark file picker and drop actions.
- `useOutputSettingsActions` owns output folder and suffix updates.
- `useWatermarkSettingsActions` owns WatermarkPanel setting changes.
- `useWatermarkOverlayStyle` owns preview overlay CSS calculations.
- Panel components receive grouped UI props and should stay focused on rendering.

## Interaction Hook

`useWatermarkInteraction` owns pointer and keyboard event orchestration for
direct manipulation.

- The hook owns transient interaction refs for drag, resize, and rotation.
- Shared geometry helpers own coordinate, rotation, resize, and anchor math.
- `watermarkInteractionHelpers` owns hook-level decisions that translate user
  input into editable snapshots or guard interaction state.
- Keep DOM-dependent coordinate reads inside the hook, because they depend on
  refs and rendered preview dimensions.

When adding direct manipulation state:

- Keep transient pointer state in refs, not shared domain types.
- Commit one undo step for continuous drag, resize, rotate, and keyboard edits.
- Preserve preview/export parity by storing normalized canvas-relative ratios in
  `WatermarkSettings`.
- Add or update tests before moving geometry or interaction calculations.

## Export Pipeline

Electron IPC handlers should stay thin.

- `electron/main.ts` owns app lifecycle, window setup, and IPC registration.
- `electron/outputPlanning.ts` owns output path planning and conflict checks.
- `electron/processWatermarkRequest.ts` owns process request orchestration,
  watermark loading, per-file dispatch, and per-file error formatting.
- `electron/processPdfFile.ts` owns PDF output processing.
- `electron/processImageFile.ts` owns image output processing.
- `electron/watermarkAssets.ts` owns output watermark asset preparation,
  opacity, padding, oversampling, and export-specific asset variants.

PDF and image processors should receive prepared request data and return output
paths. They should not own UI validation or user confirmation.

## Preview / Export Parity

Preview and export must interpret watermark settings the same way.

- Canvas-relative ratios are the source of truth for free position and free size.
- Preset placement and free placement must use the same geometry helpers where
  possible.
- Preview overlay calculations and export placement should both derive from
  shared sizing and geometry rules.
- Changing size, rotation, snapping, or aspect-ratio behavior requires tests for
  both the calculation helper and a manual PDF/PNG parity check.

## Refactoring Rules

- SRP: A module should have one reason to change. Prefer hooks for renderer
  workflows, shared helpers for pure calculations, and Electron modules for
  filesystem/export workflows.
- ISP: Component props should be grouped by UI responsibility, not passed as one
  large flat interface.
- DRY: Repeated calculation rules belong in shared helpers. Repeated hook
  decisions belong in hook-local helpers.
- KISS: Do not add abstractions before there are at least two concrete callers
  or a clear responsibility boundary.
- YAGNI: Avoid generic plugin-style layers until PDF/image behavior actually
  needs extension points.

## When To Add Shared Helpers

Add a shared helper when:

- The calculation is pure and reused by preview, interaction, export, or tests.
- The calculation defines a user-visible rule such as snapping, aspect-ratio
  locking, normalized rotation, or canvas-relative sizing.
- Moving it reduces duplication without forcing UI or Electron dependencies into
  shared code.

Keep logic inside a hook or component when:

- It depends on DOM refs, browser events, transient pointer state, or React state
  lifecycles.
- It is only a one-off wiring concern for a single panel.
