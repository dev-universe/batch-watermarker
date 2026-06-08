/// <reference types="node" />

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
