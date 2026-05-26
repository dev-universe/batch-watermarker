import { promises as fs } from "node:fs";
import { degrees, PDFDocument } from "pdf-lib";
import type { InputFile, ProcessRequest } from "../src/shared/types";
import { getWatermarkCenterPoint, getWatermarkMetrics } from "../src/shared/watermarkGeometry";
import { writeOutputBufferSafely } from "./outputFileWrites";
import { getOutputWritePaths } from "./outputPlanning";
import type { ResolvedWatermarkLayer } from "./watermarkLayerAssets";

export const processPdfFile = async (
  inputFile: InputFile,
  request: ProcessRequest,
  resolvedWatermarkLayers: ResolvedWatermarkLayer[]
) => {
  const { settings } = request;
  const outputPaths = getOutputWritePaths(inputFile.path, settings);
  const sourceBytes = await fs.readFile(inputFile.path);
  const pdf = await PDFDocument.load(sourceBytes);

  const embeddedWatermarkLayers = await Promise.all(
    resolvedWatermarkLayers.map(async (layer) => {
      if (!layer.watermarkMetadata.width || !layer.watermarkMetadata.height) {
        throw new Error(`Unable to read watermark dimensions: ${layer.file.name}`);
      }

      const watermarkImage =
        layer.pdfEmbedSource.kind === "jpg"
          ? await pdf.embedJpg(layer.pdfEmbedSource.bytes)
          : await pdf.embedPng(layer.pdfEmbedSource.bytes);

      return {
        layer,
        watermarkImage
      };
    })
  );

  for (const page of pdf.getPages()) {
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    for (const { layer, watermarkImage } of embeddedWatermarkLayers) {
      const layerSettings = layer.settings;
      const anchorCenter = getWatermarkCenterPoint(layerSettings, pageWidth, pageHeight);
      const metrics = getWatermarkMetrics(
        layer.watermarkMetadata.width,
        layer.watermarkMetadata.height,
        layerSettings,
        pageWidth,
        pageHeight,
        layerSettings.rotation
      );
      const centerX = anchorCenter.x;
      const centerY = pageHeight - anchorCenter.y;
      const pdfRotation = -layerSettings.rotation;
      const radians = (pdfRotation * Math.PI) / 180;
      const offsetX =
        (metrics.base.width / 2) * Math.cos(radians) -
        (metrics.base.height / 2) * Math.sin(radians);
      const offsetY =
        (metrics.base.width / 2) * Math.sin(radians) +
        (metrics.base.height / 2) * Math.cos(radians);
      const originX = centerX - offsetX;
      const originY = centerY - offsetY;

      page.drawImage(watermarkImage, {
        x: originX,
        y: originY,
        width: metrics.base.width,
        height: metrics.base.height,
        rotate: degrees(pdfRotation),
        opacity: layerSettings.opacity / 100
      });
    }
  }

  const outputBytes = await pdf.save();
  await writeOutputBufferSafely(outputPaths, outputBytes);
  return outputPaths.finalOutputPath;
};
