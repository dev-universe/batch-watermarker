import { useId } from "react";
import { getPdfExportProfile, PDF_EXPORT_PROFILES, type PdfExportProfileId } from "../shared/pdfExportProfiles";

interface Props {
  value: PdfExportProfileId;
  onChange: (value: PdfExportProfileId) => void;
  disabled?: boolean;
}

export function PdfExportOptions({ value, onChange, disabled }: Props) {
  const id = useId();
  const profile = getPdfExportProfile(value);
  return <div className="pdf-export-options">
    <label htmlFor={id}>PDF 저장 옵션</label>
    <select id={id} value={value} disabled={disabled} aria-describedby={`${id}-description`}
      onChange={event => onChange(event.target.value as PdfExportProfileId)}>
      {PDF_EXPORT_PROFILES.map(option => <option key={option.id} value={option.id}>{option.label} ({option.dpi} DPI)</option>)}
    </select>
    <p id={`${id}-description`} className="subtle">{profile.description}</p>
    {profile.jpegQuality !== null && <p className="subtle">고품질 JPEG와 무손실 압축 중 더 작은 결과를 사용합니다. JPEG가 선택되면 미세한 화질 차이가 생길 수 있습니다.</p>}
  </div>;
}
