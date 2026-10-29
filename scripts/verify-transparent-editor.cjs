// End-to-end test against the built app or an unpacked Windows EXE.
// Usage: node scripts/verify-transparent-editor.cjs <playwright-module-folder> [app.exe]
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { _electron } = require(path.join(process.argv[2], "playwright"));
const { PDFDict, PDFDocument, PDFName, PDFRawStream } = require("pdf-lib");
const sharp = require("sharp");
const root = path.resolve(__dirname, "..");
const outputRoot = path.join(root, "tmp", process.argv[3] ? "transparent-packaged-qa" : "transparent-qa");

const staff = (y) => Array.from({ length: 5 }, (_, i) => `<path d="M16 ${y+i*3}H134" stroke="#182332" stroke-width=".25"/>`).join("");
const notes = (y) => Array.from({ length: 12 }, (_, i) => `<g transform="translate(${22+i*9},${y+(i%3)*3})"><ellipse rx="1.9" ry="1.3" transform="rotate(-20)" fill="#182332"/><path d="M1.7 0V-10" stroke="#182332" stroke-width=".4"/></g>`).join("");
const svg = title => `<svg xmlns="http://www.w3.org/2000/svg" width="150mm" height="210mm" viewBox="0 0 150 210"><text x="75" y="22" text-anchor="middle" font-family="Segoe UI" font-size="7" fill="#182332">${title}</text><text x="75" y="31" text-anchor="middle" font-family="Segoe UI" font-size="3" fill="#55657c">TRANSPARENT SCORE / COMPOSITION TEST</text>${[53,88,123,158].map(y => staff(y)+notes(y+6)).join("")}<text x="75" y="194" text-anchor="middle" font-family="Segoe UI" font-size="3" fill="#55657c">Batch Watermarker 1.1</text></svg>`;

async function run() {
  await fs.mkdir(outputRoot, { recursive: true });
  const input = path.join(outputRoot, "inputs");
  await fs.mkdir(input, { recursive: true });
  const output = path.join(outputRoot, `export-${Date.now()}`);
  await fs.mkdir(output);
  const files = {};
  for (const [name, contents] of Object.entries({
    "page-2.svg": svg("Morning Song / 02"), "page-10.svg": svg("Morning Song / 10"),
    "single.svg": svg("Evening Song / 01"),
    "background.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="210"><defs><linearGradient id="paper" x2="1" y2="1"><stop stop-color="#f8f2e3"/><stop offset="1" stop-color="#dcebf4"/></linearGradient></defs><path d="M0 0H150V210H0Z" fill="url(#paper)"/><circle cx="140" cy="180" r="55" fill="#ffffff" opacity=".35"/></svg>',
    "watermark-1.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="65" viewBox="0 0 240 65"><rect width="240" height="65" rx="12" fill="#2563eb"/><text x="120" y="40" text-anchor="middle" fill="white" font-size="26" font-family="Segoe UI">UNIVERSE</text></svg>',
    "watermark-2.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="36" stroke="#b45309" stroke-width="4" fill="none"/><path d="M23 40L35 52L57 27" stroke="#b45309" stroke-width="5" fill="none"/></svg>'
  })) { files[name] = path.join(input, name); await fs.writeFile(files[name], contents); }
  const legacyOutput = path.join(output, "legacy");
  await fs.mkdir(legacyOutput);
  const legacySource = await PDFDocument.create();
  legacySource.addPage([72, 96]).drawText("Music / 1", { x: 4, y: 70, size: 10 });
  legacySource.addPage([96, 72]).drawText("Music / 2", { x: 4, y: 40, size: 10 });
  files["legacy-input.pdf"] = path.join(input, "legacy-input.pdf");
  files["legacy-watermark.png"] = path.join(input, "legacy-watermark.png");
  await fs.writeFile(files["legacy-input.pdf"], await legacySource.save());
  await sharp({ create: { width: 48, height: 24, channels: 4, background: "#2563eb" } }).png().toFile(files["legacy-watermark.png"]);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await _electron.launch({ executablePath: process.argv[3] || require("electron"), args: process.argv[3] ? [] : [root], cwd: root, env, timeout: 60000 });
  const pageErrors = [];
  const log = [];
  application.process().stderr.on("data", data => log.push(data.toString()));
  try {
    const page = await application.firstWindow();
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.waitForLoadState("domcontentloaded");
    await application.evaluate(({ dialog }, responses) => {
      global.__qaDialogs = responses;
      dialog.showOpenDialog = async () => {
        const filePaths = global.__qaDialogs.shift();
        if (!filePaths) throw new Error("Unexpected file picker");
        return { canceled: false, filePaths };
      };
    }, [
      [files["page-10.svg"], files["page-2.svg"]], [files["background.svg"]],
      [files["watermark-1.svg"], files["watermark-2.svg"]], [files["single.svg"]], [output],
      [files["legacy-input.pdf"]], [files["legacy-watermark.png"]], [legacyOutput]
    ]);
    await page.getByRole("tab", { name: "투명 이미지 편집", exact: true }).click();
    const panel = page.getByRole("tabpanel", { name: "투명 이미지 편집", exact: true });
    await panel.getByRole("textbox", { name: "그룹 이름", exact: true }).fill("세트 A");
    await panel.getByRole("button", { name: "입력 이미지 추가", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll("#transparent-workspace .ti-pages li").length === 2);
    assert.deepEqual(await panel.locator(".ti-page-select strong").allTextContents(), ["page-2.svg", "page-10.svg"]);
    await panel.getByRole("button", { name: "배경 선택", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#transparent-workspace .ti-toolbar select"));
    await panel.getByRole("button", { name: "이미지 추가", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll("#transparent-workspace .ti-watermark-row").length === 2);
    await panel.getByRole("button", { name: "NW", exact: true }).click();
    await panel.getByLabel("회전 (도)", { exact: true }).fill("15");
    await panel.getByRole("button", { name: "watermark-1.svg 선택", exact: true }).click();
    await panel.getByRole("button", { name: "SE", exact: true }).click();
    await panel.getByRole("button", { name: "입력 이미지 선택", exact: true }).click();
    await panel.getByLabel("여백 (mm)", { exact: true }).fill("5");
    await panel.getByLabel("배율 (%)", { exact: true }).fill("94");
    await panel.locator(".ti-preview-header h2").click();
    await page.waitForFunction(() => !document.querySelector(".ti-preview-indicator") && !!document.querySelector(".ti-composed-image"));
    assert.equal(await panel.getByRole("alert").count(), 0);
    await page.screenshot({ path: path.join(outputRoot, "composed-editor.png") });
    // Tabs retain state and legacy shortcuts cannot edit this workspace.
    await page.getByRole("tab", { name: "워터마크 편집", exact: true }).click();
    await page.getByRole("tab", { name: "투명 이미지 편집", exact: true }).click();
    assert.equal(await panel.getByLabel("여백 (mm)", { exact: true }).inputValue(), "5");
    await panel.getByRole("button", { name: "그룹 추가", exact: true }).click();
    await panel.getByRole("textbox", { name: "그룹 이름", exact: true }).nth(1).fill("세트 B");
    await panel.getByRole("button", { name: "입력 이미지 추가", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll("#transparent-workspace .ti-pages li").length === 1);
    // Local background changes must not change group A.
    await panel.getByRole("combobox", { name: "배경 적용 범위", exact: true }).selectOption("group");
    await panel.getByRole("button", { name: "배경 제거", exact: true }).click();
    await panel.getByRole("combobox", { name: "워터마크 적용 범위", exact: true }).selectOption("group");
    await panel.locator(".ti-watermark-row").nth(0).getByRole("button", { name: "숨기기", exact: true }).click();
    await panel.getByRole("button", { name: "세트 A 선택", exact: true }).click();
    assert.equal(await panel.getByRole("combobox", { name: "배경 적용 범위", exact: true }).inputValue(), "common");
    assert.equal(await panel.getByRole("button", { name: "배경 제거", exact: true }).count(), 1);
    // Verify direct manipulation and per-workspace undo.
    const hitbox = panel.locator(".ti-source-hitbox");
    const box = await hitbox.boundingBox();
    await panel.getByRole("button", { name: "입력 이미지 선택", exact: true }).click();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5 + 32, box.y + box.height * 0.5 + 12, { steps: 6 });
    await page.mouse.up();
    assert.notEqual(await panel.getByLabel("중심 X (%)", { exact: true }).inputValue(), "50");
    await page.keyboard.press("Control+z");
    assert.equal(await panel.getByLabel("중심 X (%)", { exact: true }).inputValue(), "50");
    await panel.getByRole("button", { name: "저장 폴더 선택", exact: true }).click();
    await panel.getByRole("button", { name: "그룹별 PDF 저장 (2개)", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#transparent-workspace .ti-status")?.textContent.includes("PDF 2개 저장 완료"), undefined, { timeout: 120000 });
    assert.equal(await panel.locator(".ti-export-results .ti-error").count(), 0);
    const results = (await fs.readdir(output)).filter(name => name.endsWith(".pdf")).sort();
    assert.deepEqual(results, ["세트 A.pdf", "세트 B.pdf"]);
    const pdfA = await PDFDocument.load(await fs.readFile(path.join(output, results[0])));
    const pdfB = await PDFDocument.load(await fs.readFile(path.join(output, results[1])));
    assert.equal(pdfA.getPageCount(), 2); assert.equal(pdfB.getPageCount(), 1);
    assert(Math.abs(pdfA.getPage(0).getWidth() - 150 / 25.4 * 72) < 0.001);
    const profileReports = [{ id: "original", dpi: 600, results: await Promise.all(results.map(async name => ({ name, bytes: (await fs.stat(path.join(output, name))).size }))) }];
    assert.equal(await panel.getByRole("combobox", { name: "PDF 저장 옵션", exact: true }).inputValue(), "original");
    for (const [index, profile] of [{ id: "quality", dpi: 450 }, { id: "distribution", dpi: 300 }].entries()) {
      await panel.getByRole("combobox", { name: "PDF 저장 옵션", exact: true }).selectOption(profile.id);
      await panel.getByRole("button", { name: "그룹별 PDF 저장 (2개)", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("#transparent-workspace .ti-status")?.textContent.includes("PDF 2개 저장 완료"), undefined, { timeout: 120000 });
      assert.equal(await panel.locator(".ti-export-results .ti-error").count(), 0);
      const entries = [];
      for (const [name, count] of [["세트 A", 2], ["세트 B", 1]]) {
        const filename = `${name} (${index + 2}).pdf`;
        const bytes = await fs.readFile(path.join(output, filename));
        const pdf = await PDFDocument.load(bytes);
        assert.equal(pdf.getPageCount(), count);
        for (const outputPage of pdf.getPages()) {
          const images = outputPage.node.Resources().lookup(PDFName.of("XObject"), PDFDict);
          assert.equal(images.keys().length, 1);
          const image = images.lookup(images.keys()[0]);
          assert(image instanceof PDFRawStream);
          assert.equal(image.dict.get(PDFName.of("Width")).toString(), String(Math.ceil(outputPage.getWidth() * profile.dpi / 72 - 1e-7)));
          assert.equal(image.dict.get(PDFName.of("Height")).toString(), String(Math.ceil(outputPage.getHeight() * profile.dpi / 72 - 1e-7)));
          assert.equal(image.dict.get(PDFName.of("SMask")), undefined);
        }
        entries.push({ name: filename, bytes: bytes.length });
      }
      profileReports.push({ ...profile, results: entries });
      assert.equal(await panel.getByRole("combobox", { name: "PDF 저장 옵션", exact: true }).isEnabled(), true);
    }
    assert(profileReports[1].results[0].bytes < profileReports[0].results[0].bytes);
    assert(profileReports[2].results[0].bytes < profileReports[1].results[0].bytes);
    await page.getByRole("tab", { name: "워터마크 편집", exact: true }).click();
    const legacy = page.getByRole("tabpanel", { name: "워터마크 편집", exact: true });
    assert.equal(await legacy.getByRole("combobox", { name: "PDF 저장 옵션", exact: true }).count(), 0);
    await legacy.getByRole("checkbox", { name: "PDF의 경우 이미지 형식으로 변환 후 PDF로 저장", exact: true }).check();
    await legacy.getByRole("combobox", { name: "PDF 저장 옵션", exact: true }).selectOption("quality");
    await legacy.getByRole("button", { name: "파일 선택", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#watermark-workspace .file-list")?.textContent.includes("legacy-input.pdf"));
    await legacy.getByRole("button", { name: "이미지 선택", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll("#watermark-workspace .layer-row").length === 1);
    await legacy.getByRole("button", { name: "출력 폴더 지정", exact: true }).click();
    await page.waitForFunction(directory => document.querySelector("#watermark-workspace input[placeholder='원본 덮어쓰기면 비워둘 수 있습니다.']")?.value === directory, legacyOutput);
    const legacyProfileReports = [];
    for (const profile of [{ id: "quality", dpi: 450 }, { id: "distribution", dpi: 300 }, { id: "original", dpi: 600 }]) {
      await legacy.getByRole("combobox", { name: "PDF 저장 옵션", exact: true }).selectOption(profile.id);
      await legacy.getByRole("textbox", { name: "접미사", exact: true }).fill(`_${profile.id}`);
      await legacy.getByRole("button", { name: "워터마크 적용 시작", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("#watermark-workspace .status")?.textContent.includes("완료: 1 file processed, 0 errors"), undefined, { timeout: 60000 });
      const file = path.join(legacyOutput, `legacy-input_${profile.id}.pdf`);
      const bytes = await fs.readFile(file);
      const pdf = await PDFDocument.load(bytes);
      assert.deepEqual(pdf.getPages().map(page => page.getSize()), [{ width: 72, height: 96 }, { width: 96, height: 72 }]);
      for (const outputPage of pdf.getPages()) {
        const images = outputPage.node.Resources().lookup(PDFName.of("XObject"), PDFDict);
        assert.equal(images.keys().length, 1);
        const image = images.lookup(images.keys()[0]);
        assert(image instanceof PDFRawStream);
        assert.equal(image.dict.get(PDFName.of("Width")).toString(), String(Math.ceil(outputPage.getWidth() * profile.dpi / 72 - 1e-7)));
        assert.equal(image.dict.get(PDFName.of("SMask")), undefined);
      }
      legacyProfileReports.push({ ...profile, bytes: bytes.length });
    }
    await page.getByRole("tab", { name: "투명 이미지 편집", exact: true }).click();
    assert.equal(await panel.getByRole("combobox", { name: "PDF 저장 옵션", exact: true }).inputValue(), "distribution");
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: path.join(outputRoot, "export-complete.png") });
    const report = { executable: process.argv[3] || "development Electron", output, results, profileReports, legacyProfileReports, pages: [2, 1], pageErrors, checks: ["SVG natural sorting", "background + two watermark layers", "page margin and scale", "tab state retention", "group overrides", "direct drag and undo", "all three export profiles through both real IPC workers", "per-mode resolution and lossless image fallback", "independent profile settings in both tabs"] };
    await fs.writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await fs.writeFile(path.join(outputRoot, "electron-stderr.log"), log.join(""));
    await application.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
