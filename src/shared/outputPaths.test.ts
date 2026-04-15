import { describe, expect, it } from "vitest";
import type { InputFile } from "./types";
import {
  collectPlannedOutputConflicts,
  collectPlannedOutputs,
  resolveOutputPath,
  shouldOverwriteOriginals
} from "./outputPaths";

const pdfFile = (path: string, name: string): InputFile => ({
  path,
  name,
  kind: "pdf"
});

describe("shouldOverwriteOriginals", () => {
  it("only overwrites originals when output directory and suffix are both empty", () => {
    expect(shouldOverwriteOriginals({ outputDirectory: "", suffix: "" })).toBe(true);
    expect(shouldOverwriteOriginals({ outputDirectory: "", suffix: "_wm" })).toBe(false);
    expect(shouldOverwriteOriginals({ outputDirectory: "/output", suffix: "" })).toBe(false);
    expect(shouldOverwriteOriginals({ outputDirectory: "/output", suffix: "_wm" })).toBe(false);
  });

  it("trims output directory and suffix before deciding", () => {
    expect(shouldOverwriteOriginals({ outputDirectory: " ", suffix: " " })).toBe(true);
    expect(shouldOverwriteOriginals({ outputDirectory: " /output ", suffix: " " })).toBe(false);
  });
});

describe("resolveOutputPath", () => {
  it("returns the source path when overwriting the original", () => {
    expect(resolveOutputPath("/files/song.pdf", "_wm", "/output", true)).toBe("/files/song.pdf");
  });

  it("saves beside the source file when outputDirectory is empty", () => {
    expect(resolveOutputPath("/files/song.pdf", "_wm", "", false)).toBe("/files/song_wm.pdf");
  });

  it("uses the specified output directory when provided", () => {
    expect(resolveOutputPath("/files/song.pdf", "_wm", "/output", false)).toBe("/output/song_wm.pdf");
  });

  it("uses the specified output directory without requiring a suffix", () => {
    expect(resolveOutputPath("/files/song.pdf", "", "/output", false)).toBe("/output/song.pdf");
  });

  it("preserves Windows-style paths", () => {
    expect(resolveOutputPath("C:\\files\\song.pdf", "_wm", "", false)).toBe(
      "C:\\files\\song_wm.pdf"
    );
  });
});

describe("collectPlannedOutputs", () => {
  it("builds one output per input file using the shared path rules", () => {
    const plannedOutputs = collectPlannedOutputs(
      [
        pdfFile("/A/song.pdf", "song.pdf"),
        pdfFile("/B/song.pdf", "song.pdf")
      ],
      {
        suffix: "_wm",
        outputDirectory: "",
        overwriteOriginal: false
      }
    );

    expect(plannedOutputs).toEqual([
      {
        sourcePath: "/A/song.pdf",
        outputPath: "/A/song_wm.pdf"
      },
      {
        sourcePath: "/B/song.pdf",
        outputPath: "/B/song_wm.pdf"
      }
    ]);
  });

  it("plans same-name files into the same output path when output directory is shared and suffix is empty", () => {
    const plannedOutputs = collectPlannedOutputs(
      [
        pdfFile("/A/song.pdf", "song.pdf"),
        pdfFile("/B/song.pdf", "song.pdf")
      ],
      {
        suffix: "",
        outputDirectory: "/output",
        overwriteOriginal: false
      }
    );

    expect(plannedOutputs).toEqual([
      {
        sourcePath: "/A/song.pdf",
        outputPath: "/output/song.pdf"
      },
      {
        sourcePath: "/B/song.pdf",
        outputPath: "/output/song.pdf"
      }
    ]);
  });
});

describe("collectPlannedOutputConflicts", () => {
  it("detects duplicate planned output paths", () => {
    const conflicts = collectPlannedOutputConflicts([
      { sourcePath: "/A/song.pdf", outputPath: "/output/song_wm.pdf" },
      { sourcePath: "/B/song.pdf", outputPath: "/output/song_wm.pdf" }
    ]);

    expect(conflicts).toEqual(["/output/song_wm.pdf"]);
  });

  it("detects duplicate planned output paths when suffix is empty in a shared output directory", () => {
    const plannedOutputs = collectPlannedOutputs(
      [
        pdfFile("/A/song.pdf", "song.pdf"),
        pdfFile("/B/song.pdf", "song.pdf")
      ],
      {
        suffix: "",
        outputDirectory: "/output",
        overwriteOriginal: false
      }
    );

    expect(collectPlannedOutputConflicts(plannedOutputs)).toEqual(["/output/song.pdf"]);
  });

  it("detects conflicts with other input files while ignoring self-overwrite", () => {
    const conflicts = collectPlannedOutputConflicts(
      [
        { sourcePath: "/A/song.pdf", outputPath: "/B/other.pdf" },
        { sourcePath: "/B/other.pdf", outputPath: "/B/other.pdf" }
      ],
      {
        inputPaths: ["/A/song.pdf", "/B/other.pdf"]
      }
    );

    expect(conflicts).toEqual(["/B/other.pdf"]);
  });

  it("includes existing output paths in the final conflict list", () => {
    const conflicts = collectPlannedOutputConflicts(
      [{ sourcePath: "/A/song.pdf", outputPath: "/A/song_wm.pdf" }],
      {
        existingPaths: ["/A/song_wm.pdf"]
      }
    );

    expect(conflicts).toEqual(["/A/song_wm.pdf"]);
  });
});
