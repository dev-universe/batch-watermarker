# Cross-Platform Pro Tool UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh Batch Watermarker into a compact, professional, cross-platform desktop tool UI while preserving all current watermark and export behavior.

**Architecture:** Treat this as a visual shell redesign, not a feature rewrite. Most changes live in `src/styles.css`, with only small semantic class hooks in React components where CSS needs better structure. Existing watermark geometry, layer ordering, hit testing, drag, resize, rotate, export, and Electron IPC logic must remain unchanged.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, CSS.

---

## Spec Source

- `docs/superpowers/specs/2026-06-08-cross-platform-pro-tool-ui-design.md`

## File Structure

- Modify: `src/styles.css`
  - Responsibility: global design tokens, shell layout, sidebar panels, compact layer list, form controls, preview surface, watermark handle colors, responsive behavior.
- Modify: `src/App.tsx`
  - Responsibility: add shell/sidebar structure class hooks only if needed.
- Modify: `src/components/InputFilesPanel.tsx`
  - Responsibility: add panel body/list class hooks only if needed.
- Modify: `src/components/WatermarkPanel.tsx`
  - Responsibility: add compact layer toolbar/text/status class hooks only if needed. Preserve all action callbacks and current action order.
- Modify: `src/components/OutputPanel.tsx`
  - Responsibility: add output summary/action class hooks only if needed.
- Modify: `src/components/PreviewPane.tsx`
  - Responsibility: add preview chrome class hooks only if needed. Do not change `getTopmostWatermarkLayerAtPoint`.
- Create: `src/styles.design.test.ts`
  - Responsibility: lock in high-level CSS decisions so the beige/brown landing-page style does not return.

## Non-Negotiable Boundaries

- Do not modify `src/shared/watermarkGeometry.ts`.
- Do not modify `src/hooks/useWatermarkInteraction.ts`.
- Do not modify `src/hooks/useWatermarkOverlayStyle.ts`.
- Do not modify `electron/**`.
- Do not modify processing/export helpers.
- Do not add an icon package.
- Do not remove Korean labels.

## Task 1: Add CSS Design Guard Test

**Files:**
- Create: `src/styles.design.test.ts`

- [ ] **Step 1: Write the failing design guard test**

Create `src/styles.design.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("cross-platform pro tool UI CSS", () => {
  it("defines the neutral design token set", () => {
    expect(css).toContain("--color-app-bg:");
    expect(css).toContain("--color-surface:");
    expect(css).toContain("--color-surface-raised:");
    expect(css).toContain("--color-border:");
    expect(css).toContain("--color-accent:");
    expect(css).toContain("--color-danger:");
    expect(css).toContain("--radius-panel:");
    expect(css).toContain("--shadow-panel:");
  });

  it("uses a compact inspector sidebar width", () => {
    expect(css).toContain("grid-template-columns: minmax(360px, 420px) minmax(0, 1fr);");
  });

  it("keeps the old warm landing-page palette out of the root app theme", () => {
    const rootBlock = css.match(/:root\s*{[\s\S]*?}\n/)?.[0] ?? "";

    expect(rootBlock).not.toContain("#f5f0e6");
    expect(rootBlock).not.toContain("#e8ddd0");
    expect(rootBlock).not.toContain("#8c5d35");
  });

  it("keeps the watermark controls visually independent from watermark opacity", () => {
    expect(css).toContain(".watermark-overlay-image");
    expect(css).toContain(".watermark-selection-outline");
    expect(css).toContain("border: 1.5px dashed var(--color-accent);");
    expect(css).toContain("background: var(--color-surface-raised);");
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npm test -- src/styles.design.test.ts
```

Expected:

```text
FAIL src/styles.design.test.ts
```

The failure should mention missing CSS tokens or the old root palette.

- [ ] **Step 3: Commit the failing test**

Run:

```bash
git add src/styles.design.test.ts
git commit -m "test: add UI design guard"
```

Expected:

```text
[branch-name <sha>] test: add UI design guard
```

## Task 2: Establish Neutral Design Tokens And App Shell

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace the root theme and base controls**

In `src/styles.css`, replace the existing `:root` through `input[type="number"]` section with:

```css
:root {
  color: var(--color-text);
  background:
    radial-gradient(circle at 18% -10%, rgba(37, 99, 235, 0.12), transparent 28%),
    linear-gradient(135deg, #f6f7f9 0%, #eceff3 100%);
  font-family:
    "SF Pro Display",
    "Segoe UI Variable",
    "Segoe UI",
    "Helvetica Neue",
    sans-serif;
  --color-app-bg: #f4f6f8;
  --color-surface: rgba(255, 255, 255, 0.86);
  --color-surface-raised: #ffffff;
  --color-surface-muted: #eef1f5;
  --color-border: rgba(15, 23, 42, 0.12);
  --color-border-strong: rgba(15, 23, 42, 0.22);
  --color-text: #111827;
  --color-text-muted: #667085;
  --color-accent: #2563eb;
  --color-accent-soft: rgba(37, 99, 235, 0.1);
  --color-danger: #dc2626;
  --color-danger-soft: rgba(220, 38, 38, 0.1);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-panel: 18px;
  --shadow-panel: 0 18px 45px rgba(15, 23, 42, 0.08);
  --shadow-canvas: 0 24px 70px rgba(15, 23, 42, 0.18);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 1040px;
  min-height: 100vh;
}

button,
input {
  font: inherit;
}

button {
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: 0.58rem 0.78rem;
  cursor: pointer;
  background: var(--color-surface-muted);
  color: var(--color-text);
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;
}

button:hover:not(:disabled) {
  background: #e4e8ef;
}

button:active:not(:disabled) {
  transform: translateY(1px);
}

button:disabled {
  cursor: default;
  opacity: 0.45;
}

input[type="text"],
input[type="number"] {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.62rem 0.72rem;
  background: var(--color-surface-raised);
  color: var(--color-text);
  outline: none;
}

input[type="text"]:focus,
input[type="number"]:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}
```

- [ ] **Step 2: Replace shell, sidebar, hero, and panel styling**

In `src/styles.css`, replace the existing `.shell` through `.panel` rules with:

```css
.shell {
  display: grid;
  grid-template-columns: minmax(360px, 420px) minmax(0, 1fr);
  min-height: 100vh;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.3)),
    var(--color-app-bg);
}

.sidebar {
  display: grid;
  align-content: start;
  gap: 0.85rem;
  padding: 1rem;
  overflow: auto;
  border-right: 1px solid var(--color-border);
  background: rgba(248, 250, 252, 0.82);
}

.preview-pane {
  padding: 1rem;
}

.preview-sticky {
  position: sticky;
  top: 1rem;
}

.hero {
  padding: 1rem 1.05rem;
  border-radius: var(--radius-panel);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-panel);
}

.hero h1 {
  letter-spacing: -0.04em;
}

.panel {
  padding: 0.95rem;
  border-radius: var(--radius-panel);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
}
```

- [ ] **Step 3: Run the design guard test**

Run:

```bash
npm test -- src/styles.design.test.ts
```

Expected:

```text
PASS src/styles.design.test.ts
```

- [ ] **Step 4: Commit the shell styling**

Run:

```bash
git add src/styles.css
git commit -m "style: add neutral app shell"
```

Expected:

```text
[branch-name <sha>] style: add neutral app shell
```

## Task 3: Refine Panels, Inputs, Buttons, And Lists

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace shared panel headings, buttons, hints, file lists, and controls**

In `src/styles.css`, replace the current `.panel-head` through `.subtle-action` rules with:

```css
.panel-head,
.preview-head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.72rem;
}

.panel-head {
  justify-content: space-between;
}

.panel-head h2,
.preview-head h2 {
  font-size: 1rem;
  letter-spacing: -0.02em;
}

.panel-head button,
.output-actions button {
  white-space: nowrap;
}

.output-actions {
  display: flex;
  gap: 0.45rem;
}

.preview-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.eyebrow {
  margin: 0 0 0.18rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.68rem;
  font-weight: 800;
  color: var(--color-accent);
}

h1,
h2,
p {
  margin: 0;
}

.subtle,
.status {
  color: var(--color-text-muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.dropzone {
  border: 1.5px dashed var(--color-border-strong);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(248, 250, 252, 0.9));
  border-radius: var(--radius-md);
  padding: 0.9rem;
  text-align: center;
  color: var(--color-text-muted);
  min-height: 76px;
  display: grid;
  place-items: center;
}

.dropzone.compact {
  min-height: 54px;
}

.file-list,
.result-list {
  display: grid;
  gap: 0.48rem;
  margin-top: 0.75rem;
  max-height: 220px;
  overflow: auto;
}

.file-item,
.result-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  padding: 0.35rem;
  border: 1px solid transparent;
  transition:
    border-color 120ms ease,
    background-color 120ms ease,
    box-shadow 120ms ease;
}

.file-item.active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.file-pick {
  flex: 1;
  min-width: 0;
  text-align: left;
  background: transparent;
  padding: 0.52rem;
  border-radius: var(--radius-sm);
}

.file-pick span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-pick small {
  display: block;
  opacity: 0.58;
  margin-top: 0.12rem;
}

.file-remove {
  background: #e8edf4;
  border-radius: var(--radius-sm);
}

.field-grid {
  display: grid;
  gap: 0.76rem;
  margin-top: 0.9rem;
}

label {
  display: grid;
  gap: 0.38rem;
  margin-top: 0.62rem;
  color: var(--color-text);
}

.field-label {
  font-size: 0.88rem;
  font-weight: 800;
  color: var(--color-text);
}

.dimension-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.dimension-row label {
  margin-top: 0;
}

.control-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 76px;
  gap: 0.58rem;
  align-items: center;
}

.number {
  text-align: right;
}

input[type="range"] {
  accent-color: var(--color-accent);
}

.position-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.42rem;
  margin-top: 0.85rem;
}

.panel-hint,
.preview-hint {
  display: grid;
  gap: 0.16rem;
  margin-top: 0.72rem;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  line-height: 1.45;
}

.preview-hint {
  padding: 0.65rem 0.2rem 0;
}

.subtle-action {
  justify-self: start;
  padding: 0.46rem 0.62rem;
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
}
```

- [ ] **Step 2: Run typecheck and tests**

Run:

```bash
npm run typecheck
npm test
```

Expected:

```text
tsc -p tsconfig.json --noEmit
PASS
```

- [ ] **Step 3: Commit panel and control styling**

Run:

```bash
git add src/styles.css
git commit -m "style: refine inspector panels and controls"
```

Expected:

```text
[branch-name <sha>] style: refine inspector panels and controls
```

## Task 4: Compact Watermark Layer List

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace layer list styling**

In `src/styles.css`, replace the current `.layer-list` through `.layer-actions .subtle-action, .layer-remove` rules with:

```css
.layer-list {
  display: grid;
  gap: 0.48rem;
  margin-top: 0.78rem;
}

.layer-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  grid-template-areas:
    "select texts"
    "select actions";
  gap: 0.48rem 0.56rem;
  align-items: center;
  padding: 0.58rem;
  border-radius: var(--radius-md);
  background: rgba(241, 245, 249, 0.86);
  border: 1px solid transparent;
}

.layer-row.active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.layer-row.hidden {
  opacity: 0.62;
}

.layer-row.locked {
  background: rgba(226, 232, 240, 0.86);
}

.layer-select {
  grid-area: select;
  width: 64px;
  min-height: 58px;
  align-self: stretch;
  background: var(--color-text);
  color: #ffffff;
  white-space: nowrap;
  border-radius: var(--radius-md);
  font-weight: 800;
}

.layer-row.active .layer-select {
  background: var(--color-accent);
}

.layer-texts {
  grid-area: texts;
  display: grid;
  gap: 0.26rem;
  min-width: 0;
}

.layer-status-badges,
.watermark-status-badges {
  display: flex;
  gap: 0.28rem;
  flex-wrap: wrap;
}

.layer-status-badge,
.watermark-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.12rem 0.4rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.layer-row.active .layer-status-badge {
  background: rgba(37, 99, 235, 0.12);
  color: var(--color-accent);
}

.layer-name-input {
  min-width: 0;
  padding: 0.46rem 0.55rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  font-weight: 750;
}

.layer-file-name {
  font-size: 0.76rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-actions {
  grid-area: actions;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.36rem;
  width: 100%;
}

.layer-actions .subtle-action,
.layer-remove {
  width: 100%;
  min-width: 0;
  padding: 0.42rem 0.38rem;
  justify-self: stretch;
  font-size: 0.84rem;
}

.layer-remove {
  color: var(--color-danger);
  background: var(--color-danger-soft);
}
```

- [ ] **Step 2: Verify action order remains unchanged**

Open `src/components/WatermarkPanel.tsx` and confirm the buttons still render in this order:

```tsx
{layer.locked ? "해제" : "잠금"}
위
복제
{layer.visible ? "숨김" : "표시"}
아래
삭제
```

- [ ] **Step 3: Run layer behavior tests**

Run:

```bash
npm test -- src/shared/watermarkLayerState.test.ts src/components/PreviewPane.test.ts
```

Expected:

```text
PASS src/shared/watermarkLayerState.test.ts
PASS src/components/PreviewPane.test.ts
```

- [ ] **Step 4: Commit layer list styling**

Run:

```bash
git add src/styles.css
git commit -m "style: compact watermark layer list"
```

Expected:

```text
[branch-name <sha>] style: compact watermark layer list
```

## Task 5: Refresh Preview Canvas And Watermark Controls

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace preview and watermark visual styling**

In `src/styles.css`, replace the current `.position-grid button.selected, .primary` through `.empty-preview` rules with:

```css
.position-grid button.selected,
.primary {
  background: var(--color-accent);
  color: #ffffff;
}

.primary {
  width: 100%;
  margin-top: 0.9rem;
  padding: 0.82rem;
  font-weight: 850;
}

.preview-stage {
  position: relative;
  display: grid;
  place-items: center;
  min-height: calc(100vh - 7rem);
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(241, 245, 249, 0.94)),
    linear-gradient(45deg, rgba(15, 23, 42, 0.045) 25%, transparent 25%, transparent 75%, rgba(15, 23, 42, 0.045) 75%),
    linear-gradient(45deg, rgba(15, 23, 42, 0.045) 25%, transparent 25%, transparent 75%, rgba(15, 23, 42, 0.045) 75%);
  background-size: auto, 22px 22px, 22px 22px;
  background-position: 0 0, 0 0, 11px 11px;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.preview-image {
  display: block;
  max-width: calc(100vw - 500px);
  max-height: calc(100vh - 11rem);
  object-fit: contain;
  box-shadow: var(--shadow-canvas);
  border-radius: 10px;
}

.preview-artboard {
  position: relative;
  display: inline-block;
  line-height: 0;
  max-width: calc(100% - 3rem);
  max-height: calc(100vh - 11rem);
  overflow: hidden;
  border-radius: 10px;
}

.pdf-pager {
  display: flex;
  align-items: center;
  gap: 0.48rem;
  justify-self: end;
}

.pdf-pager span {
  min-width: 68px;
  text-align: center;
  color: var(--color-text-muted);
}

.pdf-pager button:disabled {
  opacity: 0.45;
  cursor: default;
}

.watermark-overlay {
  position: absolute;
  pointer-events: none;
  overflow: visible;
  cursor: grab;
  user-select: none;
  -webkit-user-drag: none;
  touch-action: none;
}

.watermark-overlay.locked {
  cursor: default;
}

.watermark-overlay.hovered .watermark-selection-outline,
.watermark-overlay.selected .watermark-selection-outline {
  opacity: 1;
}

.watermark-overlay.dragging {
  cursor: grabbing;
}

.watermark-selection-outline {
  position: absolute;
  inset: 0;
  border: 1.5px dashed var(--color-accent);
  border-radius: 7px;
  opacity: 0;
  transition: opacity 120ms ease;
  pointer-events: none;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.75) inset,
    0 10px 24px rgba(37, 99, 235, 0.12);
}

.watermark-transform-box {
  position: absolute;
}

.watermark-status-badges {
  position: absolute;
  left: 0;
  top: -1.55rem;
  pointer-events: none;
}

.watermark-rotate-stem {
  position: absolute;
  left: 50%;
  top: 1px;
  width: 2px;
  height: 26px;
  transform: translate(-50%, -100%);
  background: var(--color-accent);
  border-radius: 999px;
  pointer-events: none;
}

.watermark-rotate-handle {
  position: absolute;
  left: 50%;
  top: 1px;
  width: 14px;
  height: 14px;
  transform: translate(-50%, calc(-100% - 26px));
  border: 2px solid var(--color-accent);
  background: var(--color-surface-raised);
  border-radius: 999px;
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.2);
  cursor: grab;
  pointer-events: auto;
}

.watermark-resize-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid var(--color-accent);
  background: var(--color-surface-raised);
  border-radius: 4px;
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.2);
  pointer-events: auto;
}

.watermark-overlay-image {
  position: absolute;
  display: block;
  inset: 0;
  width: 100%;
  height: 100%;
  -webkit-user-drag: none;
  user-select: none;
}

.empty-preview {
  color: var(--color-text-muted);
  font-size: 1rem;
}
```

- [ ] **Step 2: Keep the existing resize handle position rules**

Confirm the following selectors still exist below the new block:

```css
.watermark-resize-handle.n
.watermark-resize-handle.ne
.watermark-resize-handle.e
.watermark-resize-handle.se
.watermark-resize-handle.s
.watermark-resize-handle.sw
.watermark-resize-handle.w
.watermark-resize-handle.nw
```

- [ ] **Step 3: Run preview and opacity regression tests**

Run:

```bash
npm test -- src/components/PreviewPane.test.ts src/hooks/useWatermarkOverlayStyle.test.ts
```

Expected:

```text
PASS src/components/PreviewPane.test.ts
PASS src/hooks/useWatermarkOverlayStyle.test.ts
```

- [ ] **Step 4: Commit preview styling**

Run:

```bash
git add src/styles.css
git commit -m "style: refresh preview canvas controls"
```

Expected:

```text
[branch-name <sha>] style: refresh preview canvas controls
```

## Task 6: Responsive Polish And Full Verification

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace the responsive block**

In `src/styles.css`, replace the existing `@media (max-width: 1200px)` block with:

```css
@media (max-width: 1180px) {
  body {
    min-width: 0;
  }

  .shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .preview-pane {
    padding: 0 1rem 1rem;
  }

  .preview-sticky {
    position: static;
  }

  .preview-stage {
    min-height: 560px;
  }

  .preview-image {
    max-width: calc(100vw - 4rem);
  }
}
```

- [ ] **Step 2: Run complete automated verification**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected:

```text
tsc -p tsconfig.json --noEmit
PASS
vite build
✓ built
```

- [ ] **Step 3: Manual verification in the app**

Run:

```bash
npm run dev
```

Verify:

```text
1. Add several input files.
2. Add several watermark image layers at once.
3. Confirm layer rows remain readable with long file names.
4. Confirm active, locked, and hidden states are visually clear.
5. Confirm lock/unlock, show/hide, move up/down, duplicate, and delete still work.
6. Confirm opacity changes only the watermark image, not the outline or handles.
7. Confirm resize, width, height, rotation, drag, keyboard movement, and position grid still work.
8. Confirm rotated overlapping layer click selection still picks the visible topmost layer at the clicked point.
9. Confirm the preview canvas remains usable at a full-screen macOS window and at a narrower Windows-style window.
```

Stop the dev server with `Ctrl+C`.

- [ ] **Step 4: Commit final polish**

Run:

```bash
git add src/styles.css
git commit -m "style: polish responsive desktop layout"
```

Expected:

```text
[branch-name <sha>] style: polish responsive desktop layout
```

## Task 7: Branch Completion

**Files:**
- No file changes.

- [ ] **Step 1: Check final branch status**

Run:

```bash
git status --short --branch
```

Expected:

```text
## fix/cross-platform-pro-tool-ui
```

No unstaged files should be listed.

- [ ] **Step 2: Review changed files**

Run:

```bash
git diff --stat main..HEAD
git diff --name-only main..HEAD
```

Expected changed files:

```text
src/styles.css
src/styles.design.test.ts
```

`src/App.tsx`, `src/components/InputFilesPanel.tsx`, `src/components/WatermarkPanel.tsx`, `src/components/OutputPanel.tsx`, and `src/components/PreviewPane.tsx` may appear only if class hooks were added. No hook, shared geometry, export, Electron, or packaging files should appear.

- [ ] **Step 3: Push and prepare PR**

Run:

```bash
git push -u origin fix/cross-platform-pro-tool-ui
```

Suggested PR title:

```text
Redesign app UI with cross-platform pro tool styling
```

Suggested PR body:

```markdown
## Summary
- Refreshes the app shell, sidebar panels, controls, layer list, and preview canvas with a compact neutral desktop-tool UI.
- Adds CSS design guard coverage for the new token system and watermark control independence.
- Preserves existing watermark layer, preview hit-testing, geometry, interaction, export, and Electron behavior.

## Verification
- npm run typecheck
- npm test
- npm run build
- Manual multi-layer watermark workflow
```

## Self-Review

- Spec coverage: the plan covers whole-app layout, neutral visual direction, compact layer list, consistent controls, preview styling, cross-platform constraints, and validation.
- Placeholder scan: this plan contains no empty implementation markers, deferred-work wording, or unspecified test instructions.
- Type consistency: all file names, test names, CSS variable names, and command names are defined in the plan before later steps use them.
