import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, degrees, rgb } from "pdf-lib";
import sharp from "sharp";
import { PDF_RASTER_DPI, rasterizePdf } from "./rasterizePdf";

describe("rasterizePdf", () => {
  it("keeps the exact rendered RGB pixels while removing text, forms, attachments and source metadata", async () => {
    const original = await PDFDocument.create();
    original.setTitle("PRIVATE SOURCE TITLE");
    const page = original.addPage([144, 216]);
    page.drawText("Extractable source text", { x: 5, y: 180, size: 10 });
    // Exercise transparency, like a flattened watermark.
    page.drawRectangle({ x: 30, y: 40, width: 70, height: 80, color: rgb(1, 0, 0), opacity: 0.3 });
    const field = original.getForm().createTextField("private-field");
    field.setText("Visible form value");
    field.addToPage(page, { x: 5, y: 10, width: 130, height: 20 });
    await original.attach(new Uint8Array([1, 2, 3]), "private-attachment.txt");
    const sourceBytes = await original.save();
    const outputBytes = await rasterizePdf(sourceBytes);
    const output = await PDFDocument.load(outputBytes);

    expect(output.getPageCount()).toBe(1);
    expect(output.getPage(0).getSize()).toEqual({ width: 144, height: 216 });
    expect(output.getTitle()).toBeUndefined();
    expect(output.getForm().getFields()).toHaveLength(0);
    expect(output.catalog.has(PDFName.of("Names"))).toBe(false);
    const resources = output.getPage(0).node.Resources()!;
    expect(resources.lookup(PDFName.of("Font"), PDFDict).keys()).toHaveLength(0);
    const images = resources.lookup(PDFName.of("XObject"), PDFDict);
    expect(images.keys()).toHaveLength(1);
    const image = output.context.lookup(images.values()[0]);
    if (!(image instanceof PDFRawStream)) {
      throw new Error("Expected one embedded image stream");
    }
    expect(image.dict.get(PDFName.of("Subtype"))).toEqual(PDFName.of("Image"));
    expect(image.dict.get(PDFName.of("Filter"))).toEqual(PDFName.of("FlateDecode"));
    expect(image.dict.get(PDFName.of("SMask"))).toBeUndefined();
    expect(image.dict.get(PDFName.of("Width"))?.toString()).toBe("1200");
    expect(image.dict.get(PDFName.of("Height"))?.toString()).toBe("1800");

    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const inputTask = getDocument({ data: new Uint8Array(sourceBytes) });
    const outputTask = getDocument({ data: new Uint8Array(outputBytes) });
    try {
      const input = await inputTask.promise;
      const result = await outputTask.promise;
      const resultPage = await result.getPage(1);
      expect((await resultPage.getTextContent()).items).toHaveLength(0);
      expect(await resultPage.getAnnotations()).toHaveLength(0);
      expect(await result.getAttachments()).toBeNull();

      const inputPage = await input.getPage(1);
      const viewport = inputPage.getViewport({ scale: PDF_RASTER_DPI / 72 });
      const canvas = createCanvas(Math.ceil(viewport.width - 1e-7), Math.ceil(viewport.height - 1e-7));
      try {
        await inputPage.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport, background: "rgb(255,255,255)" }).promise;
        const expectedRgb = await sharp(await canvas.encode("png")).removeAlpha().raw().toBuffer();
        const actualRgb = Buffer.from(decodePDFRawStream(image).decode());
        expect(actualRgb.equals(expectedRgb)).toBe(true);
      } finally {
        canvas.width = canvas.height = 1;
      }
    } finally {
      await inputTask.destroy();
      await outputTask.destroy();
    }
  }, 30_000);

  it("retains page order, visible crop, rotation, and physical page sizes", async () => {
    const original = await PDFDocument.create();
    const first = original.addPage([144, 216]);
    first.setCropBox(12, 24, 120, 180);
    first.setRotation(degrees(90));
    first.drawText("Rotated page", { x: 20, y: 60, size: 12 });
    original.addPage([216, 144]).drawText("Landscape", { x: 20, y: 60, size: 12 });
    const output = await PDFDocument.load(await rasterizePdf(await original.save()));
    expect(output.getPages().map((page) => page.getSize())).toEqual([
      { width: 180, height: 120 },
      { width: 216, height: 144 }
    ]);
    expect(output.getPages().map((page) => page.getRotation().angle)).toEqual([0, 0]);
  }, 30_000);

  it("rejects oversized pages without silently lowering the resolution", async () => {
    const original = await PDFDocument.create();
    original.addPage([5000, 5000]);
    await expect(rasterizePdf(await original.save())).rejects.toThrow("600 DPI 변환 한도");
  });

  it("rejects invalid input instead of returning a partially rendered PDF", async () => {
    await expect(rasterizePdf(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});
