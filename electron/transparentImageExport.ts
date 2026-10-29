import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { TransparentExportProgress, TransparentExportRequest, TransparentExportResponse } from "../src/shared/transparentImageTypes";
import { resolveGroupComposition } from "../src/shared/transparentImageState";
import { composeTransparentPage } from "./transparentImageComposition";
import { inspectImage } from "./transparentImageAssets";
import { getPdfExportProfile } from "../src/shared/pdfExportProfiles";
import { drawPageImage } from "./pdfPageImage";

export const sanitizeGroupFilename = (name: string) => {
  const clean = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim().slice(0, 120).replace(/[. ]+$/g, "") || "그룹";
  return /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(clean) ? `_${clean}` : clean;
};

// Link commits a completed temp file without replacing a file created after preflight.
// Both files are in the same folder/volume. Windows and POSIX support exclusive links.
export async function commitNewPdf(tempPath: string, directory: string, groupName: string) {
  const basename = sanitizeGroupFilename(groupName);
  for (let index = 0; index < 100000; index++) {
    const outputPath = path.join(directory, `${basename}${index ? ` (${index + 1})` : ""}.pdf`);
    try { await fs.link(tempPath, outputPath); return outputPath; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  throw new Error("중복되지 않는 출력 파일명을 만들 수 없습니다.");
}

export async function exportTransparentGroups(request: TransparentExportRequest, onProgress: (progress: TransparentExportProgress) => void = () => {}): Promise<TransparentExportResponse> {
  const profile = getPdfExportProfile(request.pdfExportProfile);
  if (!request.outputDirectory || !path.isAbsolute(request.outputDirectory)) throw new Error("출력 폴더를 선택해 주세요.");
  const stat = await fs.stat(request.outputDirectory);
  if (!stat.isDirectory()) throw new Error("출력 경로가 폴더가 아닙니다.");
  const response: TransparentExportResponse = { results: [], errors: [] };
  const totalPages = request.project.groups.reduce((sum, group) => sum + group.pages.length, 0);
  if (!totalPages) throw new Error("그룹에 입력 이미지를 추가해 주세요.");
  let completedPages = 0;
  for (const group of request.project.groups) {
    if (!group.pages.length) continue;
    const tempPath = path.join(request.outputDirectory, `.batch-watermarker-${randomUUID()}.tmp`);
    const groupStart = completedPages;
    try {
      const pdf = await PDFDocument.create();
      const composition = resolveGroupComposition(request.project, group);
      // Revalidate native dimensions from disk rather than trusting renderer metadata.
      const background = composition.background && { ...composition.background, asset: await inspectImage(composition.background.asset.path) };
      const watermarks = [];
      for (const layer of composition.watermarks) watermarks.push(layer.visible ? { ...layer, asset: await inspectImage(layer.asset.path) } : layer);
      for (const page of group.pages) {
        onProgress({ jobId: request.jobId, groupName: group.name, completedPages, totalPages });
        const actualPage = { ...page, asset: await inspectImage(page.asset.path) };
        const { png } = await composeTransparentPage({ page: actualPage, background, watermarks }, { dpi: profile.dpi });
        const outputPage = pdf.addPage([actualPage.asset.widthPt, actualPage.asset.heightPt]);
        await drawPageImage(pdf, outputPage, png, profile.id);
        completedPages++;
      }
      await fs.writeFile(tempPath, await pdf.save(), { flag: "wx" });
      const outputPath = await commitNewPdf(tempPath, request.outputDirectory, group.name);
      response.results.push({ groupId: group.id, groupName: group.name, outputPath, pageCount: group.pages.length });
    } catch (error) {
      response.errors.push(`${group.name}: ${error instanceof Error ? error.message : String(error)}`);
      completedPages = groupStart + group.pages.length;
    } finally { await fs.rm(tempPath, { force: true }); }
    onProgress({ jobId: request.jobId, groupName: group.name, completedPages, totalPages });
  }
  return response;
}
