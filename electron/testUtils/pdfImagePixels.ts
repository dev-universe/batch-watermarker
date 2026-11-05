import { decodePDFRawStream, PDFDict, PDFName, PDFNumber, type PDFRawStream } from "pdf-lib";

// Independent PNG predictor decoder for byte-exact regression checks.
// pdf-lib's raw-stream decoder inflates bytes but does not apply PNG predictors.
export function readLosslessImageRgb(image: PDFRawStream): Buffer {
  const decoded = Buffer.from(decodePDFRawStream(image).decode());
  const parameters = image.dict.lookupMaybe(PDFName.of("DecodeParms"), PDFDict);
  if (!parameters) return decoded;
  if (parameters.lookup(PDFName.of("Predictor"), PDFNumber).asNumber() !== 15) throw new Error("Unexpected predictor");
  const width = image.dict.lookup(PDFName.of("Width"), PDFNumber).asNumber();
  const height = image.dict.lookup(PDFName.of("Height"), PDFNumber).asNumber();
  const channels = parameters.lookup(PDFName.of("Colors"), PDFNumber).asNumber();
  const stride = width * channels;
  if (decoded.length !== (stride + 1) * height) throw new Error("Unexpected filtered image size");
  const rgb = Buffer.alloc(stride * height);
  const paeth = (a: number, b: number, c: number) => {
    const value = a + b - c;
    const da = Math.abs(value - a), db = Math.abs(value - b), dc = Math.abs(value - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let row = 0; row < height; row++) {
    const filter = decoded[row * (stride + 1)];
    if (filter > 4) throw new Error("Unexpected PNG row filter");
    for (let col = 0; col < stride; col++) {
      const offset = row * stride + col;
      const left = col >= channels ? rgb[offset - channels] : 0;
      const above = row > 0 ? rgb[offset - stride] : 0;
      const upperLeft = row > 0 && col >= channels ? rgb[offset - stride - channels] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, upperLeft);
      rgb[offset] = (decoded[row * (stride + 1) + col + 1] + prediction) & 255;
    }
  }
  return rgb;
}
