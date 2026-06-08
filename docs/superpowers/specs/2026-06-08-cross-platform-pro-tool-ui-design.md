# Cross-Platform Pro Tool UI Redesign

## Goal

Refresh the app UI into a clean cross-platform desktop tool: Figma/Linear clarity with a compact Photoshop-style layer panel. The app must feel natural on both macOS and Windows and keep all existing behavior intact.

## Scope

Included:

- Overall app layout polish across sidebar and preview area.
- Sidebar section hierarchy and spacing.
- Input files, watermark layers, watermark settings, and output panels.
- Button, input, slider, badge, and layer row styling.
- Preview surface styling and watermark control color alignment.
- Responsive behavior for normal desktop window sizes.

Excluded:

- New watermark features.
- Export/processing logic changes.
- Electron IPC changes.
- Packaging changes.
- OS-specific native visual effects.

## Design Direction

Use a bright neutral professional tool style:

- Neutral gray foundation instead of beige/brown dominance.
- One restrained accent color for active states and key actions.
- Thin borders, subtle fills, compact controls.
- Avoid heavy blur/glass effects so Windows remains crisp.
- Keep typography and spacing dense enough for multi-layer workflows.

The result should feel closer to a cross-platform creative utility than a decorative landing-page UI.

## Layout

Keep the two-pane structure:

- Left sidebar for setup and controls.
- Right preview area for the document/image canvas.

Refine the sidebar into clearer sections:

1. Input files.
2. Watermark layers.
3. Watermark properties for the active layer.
4. Output settings.

Panels should not look like large floating cards stacked inside another card. They should read as inspector sections inside one sidebar.

## Watermark Layer List

The layer list should become compact and scannable:

- One row per watermark layer.
- Clear active state.
- Layer label and file name must remain readable.
- Actions should be compact and aligned consistently.
- Prefer small text/icon-style buttons over large pill buttons.
- Preserve current actions: select, lock/unlock, show/hide, move up/down, duplicate, delete.

The list should handle several layers without looking cramped or broken.

## Controls

Buttons:

- Smaller, flatter, and more consistent.
- Primary actions use accent fill.
- Secondary actions use subtle fill/border.
- Destructive action is visually distinct but not loud.

Inputs and sliders:

- Use consistent heights and borders.
- Keep numeric inputs readable.
- Keep slider/value pairs aligned.

Position controls:

- Keep the 3x3 position grid.
- Make selected state match the accent system.

## Preview Area

The preview pane should feel like the main working canvas:

- Keep a calm neutral background.
- Keep image/PDF preview prominent.
- Preserve watermark handles, outline, rotation control, and resize handles.
- Update handle/outline colors to match the new accent system.
- Do not reduce precision or click behavior.

## Accessibility And Cross-Platform Constraints

- Maintain readable contrast on macOS and Windows.
- Avoid OS-native-only visual effects.
- Do not rely on blur/material effects for legibility.
- Keep hit targets usable, especially layer actions and resize/rotate handles.
- Preserve current Korean labels unless replacing an action with an icon that has `title` and `aria-label`.

## Implementation Boundaries

Likely files:

- `src/styles.css`: primary redesign surface.
- `src/App.tsx`: section composition only if necessary.
- `src/components/InputFilesPanel.tsx`: markup tweaks if needed for section hierarchy.
- `src/components/WatermarkPanel.tsx`: layer list and settings layout.
- `src/components/OutputPanel.tsx`: output section styling hooks if needed.
- `src/components/PreviewPane.tsx`: preview chrome/style hooks if needed.

Avoid touching:

- `electron/**`
- processing/export helpers
- watermark geometry and interaction logic unless a visual-only class hook is needed

## Validation

Automated:

- `npm run typecheck`
- `npm test`
- `npm run build`

Manual:

- Add several input files.
- Add several watermark layers.
- Confirm layer rows remain readable.
- Confirm active/locked/hidden states are clear.
- Confirm opacity, resize, rotate, drag, duplicate, delete, move up/down still work.
- Confirm preview area remains usable on macOS and Windows-sized desktop windows.

## Open Decisions

Chosen:

- Redesign scope is the whole app layout, not only the sidebar.
- Visual direction is Figma/Linear base with Photoshop-style compact layer panel.
- No feature changes in this pass.

Not included:

- Icon-only action redesign if it would require adding an icon dependency. Text buttons may remain if they become compact and consistent.
