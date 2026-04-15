import { describe, expect, it } from "vitest";
import { getOutputSummary } from "./outputSummary";

describe("getOutputSummary", () => {
  it("warns about overwriting originals only when output directory and suffix are empty", () => {
    expect(getOutputSummary({ outputDirectory: "", suffix: "" })).toBe(
      "출력 폴더와 접미사가 모두 비어 있으면 원본 파일에 직접 덮어씁니다."
    );
  });

  it("describes beside-source output when output directory is empty and suffix is set", () => {
    expect(getOutputSummary({ outputDirectory: "", suffix: "_wm" })).toBe(
      "출력 폴더를 비워두면 원본 파일과 같은 폴더에 저장합니다."
    );
  });

  it("shows the output directory even when suffix is empty", () => {
    expect(getOutputSummary({ outputDirectory: "/output", suffix: "" })).toBe("/output");
  });

  it("shows the output directory when both output directory and suffix are set", () => {
    expect(getOutputSummary({ outputDirectory: "/output", suffix: "_wm" })).toBe("/output");
  });
});
