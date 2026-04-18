import { promises as fs } from "node:fs";
import { degrees, PDFDocument } from "pdf-lib";
import type sharp from "sharp";
import type { InputFile, ProcessRequest } from "../src/shared/types";
import { getWatermarkCenterPoint, getWatermarkMetrics } from "../src/shared/watermarkGeometry";
import { writeOutputBufferSafely } from "./outputFileWrites";
import { getOutputWritePaths } from "./outputPlanning";
import { getPdfWatermarkEmbedSource } from "./watermarkAssets";

export const processPdfFile = async (
  inputFile: InputFile,
  watermarkBuffer: Buffer,
  request: ProcessRequest,
  watermarkMetadata: sharp.Metadata
) => {
  const { settings } = request;
  const outputPaths = getOutputWritePaths(inputFile.path, settings);
  const sourceBytes = await fs.readFile(inputFile.path);
  const pdf = await PDFDocument.load(sourceBytes);
  if (!watermarkMetadata.width || !watermarkMetadata.height) {
    throw new Error("Unable to read watermark dimensions.");
  }
  const embedSource = await getPdfWatermarkEmbedSource(request.watermarkPath, watermarkBuffer);
  const watermarkImage =
    embedSource.kind === "jpg"
      ? await pdf.embedJpg(embedSource.bytes)
      : await pdf.embedPng(embedSource.bytes);

  for (const page of pdf.getPages()) {
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const anchorCenter = getWatermarkCenterPoint(
      settings,
      pageWidth,
      pageHeight
    );
    const metrics = getWatermarkMetrics(
      watermarkMetadata.width,
      watermarkMetadata.height,
      settings,
      pageWidth,
      pageHeight,
      settings.rotation
    );
    const centerX = anchorCenter.x;
    const centerY = pageHeight - anchorCenter.y;
    const pdfRotation = -settings.rotation;
    const radians = (pdfRotation * Math.PI) / 180;
    const offsetX = (metrics.base.width / 2) * Math.cos(radians) - (metrics.base.height / 2) * Math.sin(radians);
    const offsetY = (metrics.base.width / 2) * Math.sin(radians) + (metrics.base.height / 2) * Math.cos(radians);
    const originX = centerX - offsetX;
    const originY = centerY - offsetY;

    page.drawImage(watermarkImage, {
      x: originX,
      y: originY,
      width: metrics.base.width,
      height: metrics.base.height,
      rotate: degrees(pdfRotation),
      opacity: settings.opacity / 100
    });
  }

  const outputBytes = await pdf.save();
  await writeOutputBufferSafely(outputPaths, outputBytes);
  return outputPaths.finalOutputPath;
};
