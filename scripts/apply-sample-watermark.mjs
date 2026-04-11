import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

const WATERMARK_MAX_COVERAGE = 0.28;
const WATERMARK_MIN_MARGIN_RATIO = 0.03;
const WATERMARK_MIN_MARGIN_PX = 12;

const inputFiles = [
  "/Users/fd2/Downloads/(B키 리드시트) 승전가_0001.png",
  "/Users/fd2/Downloads/(B키 리드시트) 승전가_0002.png",
  "/Users/fd2/Downloads/(B키 리드시트) 승전가 - Full Score.pdf"
];
const watermarkPath = "/Users/fd2/Downloads/GIFTED_LOGO/[Gifted] Main Logotype-1.png";
const outputDir = "/Users/fd2/Downloads/watermarked-samples";
const opacity = 0.07;
const scalePercent = 85;

const fitWithin = (targetWidth, targetHeight, boxWidth, boxHeight) => {
  const ratio = Math.min(boxWidth / targetWidth, boxHeight / targetHeight);
  return {
    width: targetWidth * ratio,
    height: targetHeight * ratio
  };
};

const getWatermarkBox = (canvasWidth, canvasHeight, watermarkWidth, watermarkHeight) =>
  fitWithin(
    watermarkWidth,
    watermarkHeight,
    canvasWidth * WATERMARK_MAX_COVERAGE * (scalePercent / 100),
    canvasHeight * WATERMARK_MAX_COVERAGE * (scalePercent / 100)
  );

const getCenterAnchor = (canvasWidth, canvasHeight, watermarkWidth, watermarkHeight) => {
  const marginX = Math.max(canvasWidth * WATERMARK_MIN_MARGIN_RATIO, WATERMARK_MIN_MARGIN_PX);
  const marginY = Math.max(canvasHeight * WATERMARK_MIN_MARGIN_RATIO, WATERMARK_MIN_MARGIN_PX);
  const x = Math.min((canvasWidth - watermarkWidth) / 2, canvasWidth - watermarkWidth - marginX);
  const y = Math.min((canvasHeight - watermarkHeight) / 2, canvasHeight - watermarkHeight - marginY);
  return {
    x: Math.max(marginX, x),
    y: Math.max(marginY, y)
  };
};

const processImage = async (filePath, watermarkBuffer) => {
  const image = sharp(filePath, { failOn: "none" });
  const metadata = await image.metadata();
  const watermarkMetadata = await sharp(watermarkBuffer).metadata();

  if (!metadata.width || !metadata.height || !watermarkMetadata.width || !watermarkMetadata.height) {
    throw new Error(`Unable to read dimensions for ${filePath}`);
  }

  const target = getWatermarkBox(
    metadata.width,
    metadata.height,
    watermarkMetadata.width,
    watermarkMetadata.height
  );
  const anchor = getCenterAnchor(metadata.width, metadata.height, target.width, target.height);
  const resizedWatermark = await sharp(watermarkBuffer)
    .resize({
      width: Math.max(1, Math.round(target.width)),
      height: Math.max(1, Math.round(target.height)),
      fit: "contain"
    })
    .png()
    .toBuffer();
  const watermarkDataUrl = `data:image/png;base64,${resizedWatermark.toString("base64")}`;
  const watermarkLayer = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(target.width)}" height="${Math.round(
      target.height
    )}"><image href="${watermarkDataUrl}" width="100%" height="100%" opacity="${opacity}"/></svg>`
  );
  const density = metadata.density;
  const parsed = path.parse(filePath);
  const outputPath = path.join(outputDir, `${parsed.name}_gifted_center_7pct${parsed.ext}`);
  const ext = parsed.ext.toLowerCase();
  const composite = sharp(filePath, { density, failOn: "none" }).composite([
    {
      input: watermarkLayer,
      left: Math.round(anchor.x),
      top: Math.round(anchor.y),
      blend: "over"
    }
  ]);

  if (ext === ".png") {
    await composite.png().withMetadata({ density }).toFile(outputPath);
  } else {
    await composite.jpeg({ quality: 95 }).withMetadata({ density }).toFile(outputPath);
  }

  return outputPath;
};

const processPdf = async (filePath, watermarkBuffer) => {
  const sourceBytes = await readFile(filePath);
  const pdf = await PDFDocument.load(sourceBytes);
  const watermarkPngBuffer = await sharp(watermarkBuffer).png().toBuffer();
  const watermarkImage = await pdf.embedPng(watermarkPngBuffer);
  const { width: baseWidth, height: baseHeight } = watermarkImage.scale(1);

  for (const page of pdf.getPages()) {
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const target = getWatermarkBox(pageWidth, pageHeight, baseWidth, baseHeight);
    const anchor = getCenterAnchor(pageWidth, pageHeight, target.width, target.height);
    page.drawImage(watermarkImage, {
      x: anchor.x,
      y: pageHeight - anchor.y - target.height,
      width: target.width,
      height: target.height,
      opacity
    });
  }

  const outputPath = path.join(outputDir, `${path.parse(filePath).name}_gifted_center_7pct.pdf`);
  await writeFile(outputPath, await pdf.save());
  return outputPath;
};

await mkdir(outputDir, { recursive: true });
const watermarkBuffer = await readFile(watermarkPath);

for (const filePath of inputFiles) {
  const outputPath = filePath.toLowerCase().endsWith(".pdf")
    ? await processPdf(filePath, watermarkBuffer)
    : await processImage(filePath, watermarkBuffer);
  console.log(outputPath);
}
