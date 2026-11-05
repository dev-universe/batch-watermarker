export type PdfExportProfileId = "original" | "quality" | "distribution";

export interface PdfExportProfile {
  id: PdfExportProfileId;
  label: string;
  dpi: number;
  jpegQuality: number | null;
  description: string;
}

export const PDF_EXPORT_PROFILES: readonly PdfExportProfile[] = [
  {
    id: "original", label: "원본 보존", dpi: 600, jpegQuality: null,
    description: "600 DPI · 무손실 압축. 기존 600 DPI 출력과 동일한 픽셀을 보존합니다."
  },
  {
    id: "quality", label: "고화질·작은 용량", dpi: 450, jpegQuality: 95,
    description: "450 DPI · 고품질 압축. 가는 선과 글자를 선명하게 유지하면서 용량을 줄입니다."
  },
  {
    id: "distribution", label: "배포용", dpi: 300, jpegQuality: 90,
    description: "300 DPI · 용량 우선. 화면 열람과 공유에 적합하며 확대 시 차이가 날 수 있습니다."
  }
];

export function getPdfExportProfile(id: PdfExportProfileId = "original"): PdfExportProfile {
  const profile = PDF_EXPORT_PROFILES.find(profile => profile.id === id);
  if (!profile) throw new Error("지원하지 않는 PDF 저장 옵션입니다.");
  return profile;
}
