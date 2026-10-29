import { deflate } from "node:zlib";
import { promisify } from "node:util";
import sharp from "sharp";
import { concatTransformationMatrix, drawObject, PDFDocument, PDFPage, popGraphicsState, pushGraphicsState } from "pdf-lib";
import { getPdfExportProfile, type PdfExportProfileId } from "../src/shared/pdfExportProfiles";

const compress = promisify(deflate);

export interface EncodedPageImage {
  bytes: Buffer;
  width: number;
  height: number;
  filter: "FlateDecode" | "DCTDecode";
  pngPredictor: boolean;
}

// Only called on a fresh RGB, noninterlaced PNG produced by Sharp below.
// Preserve PNG's row filters in the PDF instead of decoding back to unfiltered RGB.
function pngImageData(png: Buffer): Buffer {
  if (png.readUInt32BE(8) !== 13 || png.toString("ascii", 12, 16) !== "IHDR" ||
      png[24] !== 8 || png[25] !== 2 || png[28] !== 0) {
    throw new Error("PDF용 RGB 이미지 인코딩에 실패했습니다.");
  }
  const chunks: Buffer[] = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > png.length) throw new Error("PDF용 이미지 데이터가 손상되었습니다.");
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(png.subarray(offset + 8, end - 4));
    offset = end;
  }
  if (!chunks.length) throw new Error("PDF용 이미지 데이터가 없습니다.");
  return Buffer.concat(chunks);
}

export async function encodePageImage(png: Buffer, profileId?: PdfExportProfileId): Promise<EncodedPageImage> {
  const profile = getPdfExportProfile(profileId);
  const { data: rgb, info } = await sharp(png).flatten({ background: "white" }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const raw = { width, height, channels: 3 as const };
  const [baseline, stronger, filteredPng] = await Promise.all([
    compress(rgb, { level: 6 }),
    compress(rgb, { level: 9 }),
    sharp(rgb, { raw }).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer()
  ]);
  let bytes: Buffer = baseline.length <= stronger.length ? baseline : stronger;
  let pngPredictor = false;
  const filtered = pngImageData(filteredPng);
  if (filtered.length < bytes.length) { bytes = filtered; pngPredictor = true; }
  if (profile.jpegQuality !== null) {
    const jpeg = await sharp(rgb, { raw }).jpeg({ quality: profile.jpegQuality, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
    // Flat-colour music notation can compress better losslessly than as JPEG.
    if (jpeg.length < bytes.length) return { bytes: jpeg, width, height, filter: "DCTDecode", pngPredictor: false };
  }
  return { bytes, width, height, filter: "FlateDecode", pngPredictor };
}

export async function drawPageImage(pdf: PDFDocument, page: PDFPage, png: Buffer, profileId?: PdfExportProfileId) {
  const image = await encodePageImage(png, profileId);
  const stream = pdf.context.stream(image.bytes, {
    Type: "XObject", Subtype: "Image", Width: image.width, Height: image.height,
    BitsPerComponent: 8, ColorSpace: "DeviceRGB", Filter: image.filter,
    ...(image.pngPredictor ? { DecodeParms: {
      Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: image.width
    } } : {})
  });
  const name = page.node.newXObject("PageImage", pdf.context.register(stream));
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(page.getWidth(), 0, 0, page.getHeight(), 0, 0), drawObject(name), popGraphicsState());
  return image;
}
