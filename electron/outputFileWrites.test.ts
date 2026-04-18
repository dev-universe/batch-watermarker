import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitOutputWrite, writeOutputBufferSafely, writeOutputSafely } from "./outputFileWrites";
import { getTemporaryOutputPath } from "./outputPlanning";

let tempDir = "";

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "batch-watermarker-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { force: true, recursive: true });
});

describe("getTemporaryOutputPath", () => {
  it("creates temporary output paths beside the final output path", () => {
    const finalOutputPath = path.join(tempDir, "source.pdf");
    const temporaryPath = getTemporaryOutputPath(finalOutputPath);

    expect(path.dirname(temporaryPath)).toBe(tempDir);
    expect(path.basename(temporaryPath)).toMatch(/^\.source-.+\.tmp\.pdf$/);
  });
});

describe("commitOutputWrite", () => {
  it("does nothing for non-overwrite output writes", async () => {
    const finalOutputPath = path.join(tempDir, "output.pdf");
    await fs.writeFile(finalOutputPath, "output");

    await commitOutputWrite({
      finalOutputPath,
      writePath: finalOutputPath,
      shouldReplaceOriginal: false
    });

    await expect(fs.readFile(finalOutputPath, "utf8")).resolves.toBe("output");
  });

  it("replaces the final output with the temporary output for original overwrites", async () => {
    const finalOutputPath = path.join(tempDir, "source.pdf");
    const writePath = getTemporaryOutputPath(finalOutputPath);
    await fs.writeFile(finalOutputPath, "original");
    await fs.writeFile(writePath, "watermarked");

    await commitOutputWrite({
      finalOutputPath,
      writePath,
      shouldReplaceOriginal: true
    });

    await expect(fs.readFile(finalOutputPath, "utf8")).resolves.toBe("watermarked");
    await expect(fs.access(writePath)).rejects.toThrow();
  });

  it("removes temporary output when final replacement fails", async () => {
    const finalOutputPath = path.join(tempDir, "missing", "source.pdf");
    const writePath = path.join(tempDir, "source.tmp.pdf");
    await fs.writeFile(writePath, "watermarked");

    await expect(
      commitOutputWrite({
        finalOutputPath,
        writePath,
        shouldReplaceOriginal: true
      })
    ).rejects.toThrow();
    await expect(fs.access(writePath)).rejects.toThrow();
  });
});

describe("writeOutputSafely", () => {
  it("writes and commits temporary output for original overwrites", async () => {
    const finalOutputPath = path.join(tempDir, "source.pdf");
    const writePath = getTemporaryOutputPath(finalOutputPath);
    await fs.writeFile(finalOutputPath, "original");

    await writeOutputBufferSafely(
      {
        finalOutputPath,
        writePath,
        shouldReplaceOriginal: true
      },
      Buffer.from("watermarked")
    );

    await expect(fs.readFile(finalOutputPath, "utf8")).resolves.toBe("watermarked");
    await expect(fs.access(writePath)).rejects.toThrow();
  });

  it("removes temporary output when writing fails", async () => {
    const finalOutputPath = path.join(tempDir, "source.pdf");
    const writePath = getTemporaryOutputPath(finalOutputPath);
    await fs.writeFile(finalOutputPath, "original");

    await expect(
      writeOutputSafely(
        {
          finalOutputPath,
          writePath,
          shouldReplaceOriginal: true
        },
        async () => {
          await fs.writeFile(writePath, "partial");
          throw new Error("write failed");
        }
      )
    ).rejects.toThrow("write failed");
    await expect(fs.readFile(finalOutputPath, "utf8")).resolves.toBe("original");
    await expect(fs.access(writePath)).rejects.toThrow();
  });
});
