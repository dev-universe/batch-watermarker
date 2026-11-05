# Hallmark redesign — 1.1.0

Date: 2026-11-05. Branch: `codex/hallmark-redesign`.

## Direction

This is a working desktop editor, not a marketing page. Apply Hallmark v2 in
app scope. The dealt themes were Wayfind, Dusk and Ultraviolet; Wayfind's cool
paper, ink rules, square surfaces and restrained cobalt suit precise placement.
Use the app-scope system-font allowance for readable Korean and offline use.
Keep the product name and existing application icon.

The existing interface puts rounded cards inside a wide inspector, uses multiple
shadows and gradients, and makes every layer action a large button. Its
watermark manipulation, layer model, history and export options are worth keeping.

## Implementation

1. Record the original screen and wiring with Hallmark's before audit.
2. Recompose `src/App.tsx`: compact application bar, source-file rail, central
   document canvas, independently scrolling watermark/output inspector.
3. Edit the four existing panel components in place. Preserve their props and
   handlers. Use compact layer actions, explicit selected/locked/hidden states,
   labelled numeric fields, actionable empty states and disclosed help.
4. Replace `src/styles.css` with the app system, using scaffolded `tokens.css`
   and `base.css`. Remove decorative gradients, nested cards and display labels.
   Keep 1160px desktop windows usable; stack regions on narrow viewports.
5. Bump package and lockfile root versions from 1.0.0 to 1.1.0. Preserve all
   lockfile changes that predate this task. Add release notes and this plan.
6. Run typecheck, existing tests, build, Hallmark render/kept checks and real
   Electron verification with temporary input/watermark fixtures. Review both
   empty and populated states, layer controls, keyboard history and export.

No routes or component files are deleted. Geometry, preview/export calculations,
IPC, overwrite confirmations and processing remain intact. The Electron window
background may be aligned with the renderer to avoid a launch colour flash.

## Acceptance

- The document is the dominant work surface and remains visible while editing.
- Files and layers have readable names, keyboard focus and clear selection.
- Every existing setting and layer operation remains available.
- Colour, fonts and spacing use shared tokens; reduced motion is respected.
- The existing suite, typecheck and build pass. Replace obsolete assertions of
  a specific old layout only with checks of the new layout's actual contract;
  never weaken domain or interaction tests to accommodate the redesign.
- Report actual audit and manual verification outcomes, including limitations.

## Source

[Hallmark](https://github.com/nutlope/hallmark), MIT, fetched on 2026-11-05.
The full skill and supporting scripts were read from a temporary reference
checkout outside this project; no runtime dependency is added.

## Completed validation

- `npm test`: 16 test files, 102 tests passed.
- `npm run typecheck` and `npm run build`: passed.
- Hallmark before: 38 Floor failures, 1 Reflex finding. After: 0 Floor
  failures, 0 Reflex findings, 0 warnings; one answered finish note explains
  that neutral history/placement controls are not additional primary actions.
- Eight render widths from 320 to 1920px checked. The kept audit retains
  12/12 fields, 41/41 existing handlers and the existing figure. The input
  heading gains a live count; the redundant Preview eyebrow is removed.
- A fresh-context reviewer identified three issues: small action targets,
  generic empty-state copy, and preview pixels extending beyond the page.
  All three were fixed and the reviewer marked them resolved. Watermark raster
  pixels now clip to document bounds while manipulation handles stay visible.
- The actual built Electron app passed dialog IPC, PDF pagination, image
  preview, layer duplicate/order/lock/visibility/delete, numeric editing,
  placement, undo/redo, drag, keyboard nudge, edge resize and snapped rotation.
- Real PDF and PNG exports were written successfully through renderer → IPC →
  processing → filesystem. Desktop 1160px and narrow 320px populated layouts
  were checked for horizontal overflow. Fixtures and outputs stay in ignored
  `.hallmark/fixtures`, never in user source folders.
- Local visual comparison: `.hallmark/compare.html`; populated screenshot:
  `.hallmark/populated-final.png`. These generated files are ignored by Git.

The renderer checks exercise the application's existing states. Dedicated
preview-loading and preview-error presentations have no existing UI state and
were not introduced in this design-only pass. Windows installer signing and
macOS packaging were not part of this validation.
