use crate::{
    assets::{self, AssetCache},
    model::*,
    output, pdf,
};
use anyhow::{Context, Result, ensure};
use image::RgbaImage;
use resvg::tiny_skia::{self, Pixmap, PixmapPaint, Transform};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Saved {
    pub source: String,
    pub path: PathBuf,
    pub pages: usize,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Report {
    pub saved: Vec<Saved>,
    pub errors: Vec<String>,
    pub cancelled: bool,
}
#[derive(Debug, Clone)]
pub struct Progress {
    pub label: String,
    pub completed: usize,
    pub total: usize,
}

#[derive(Default)]
pub struct Engine {
    pub assets: AssetCache,
    scaled: HashMap<String, Arc<Pixmap>>,
    order: VecDeque<String>,
    scaled_bytes: usize,
    pdf_preview: Option<(String, RgbaImage, usize, (f64, f64))>,
}
impl Engine {
    fn raster(&mut self, path: &Path, width: f64, height: f64) -> Result<Arc<Pixmap>> {
        let (w, h) = dimensions(width, height)?;
        let meta = std::fs::metadata(path)?;
        let key = format!(
            "{}:{:?}:{}:{w}:{h}",
            path.display(),
            meta.modified().ok(),
            meta.len()
        );
        if let Some(pix) = self.scaled.get(&key) {
            return Ok(pix.clone());
        }
        let asset = self.assets.get(path)?;
        let pix = Arc::new(asset.raster(w, h)?);
        while self.scaled_bytes + pix.data().len() > 64 * 1024 * 1024 {
            let Some(old) = self.order.pop_front() else {
                break;
            };
            if let Some(old) = self.scaled.remove(&old) {
                self.scaled_bytes -= old.data().len();
            }
        }
        if pix.data().len() <= 64 * 1024 * 1024 {
            self.scaled_bytes += pix.data().len();
            self.order.push_back(key.clone());
            self.scaled.insert(key, pix.clone());
        }
        Ok(pix)
    }
    fn draw(
        &mut self,
        canvas: &mut Pixmap,
        path: &Path,
        size: (f64, f64),
        center: (f64, f64),
        rotation: f64,
        opacity: f64,
    ) -> Result<()> {
        ensure!(
            [size.0, size.1, center.0, center.1, rotation, opacity]
                .iter()
                .all(|v| v.is_finite()),
            "이미지 배치 값이 올바르지 않습니다."
        );
        if opacity == 0.0 {
            return Ok(());
        }
        let pix = self.raster(path, size.0, size.1)?;
        let angle = rotation.to_radians();
        let (s, c) = (angle.sin() as f32, angle.cos() as f32);
        let (w, h) = (pix.width() as f32, pix.height() as f32);
        let transform = Transform::from_row(
            c,
            s,
            -s,
            c,
            center.0 as f32 - c * w / 2.0 + s * h / 2.0,
            center.1 as f32 - s * w / 2.0 - c * h / 2.0,
        );
        canvas.draw_pixmap(
            0,
            0,
            pix.as_ref().as_ref(),
            &PixmapPaint {
                opacity: opacity.clamp(0.0, 1.0) as f32,
                quality: tiny_skia::FilterQuality::Bilinear,
                ..Default::default()
            },
            transform,
            None,
        );
        Ok(())
    }
    pub fn layers(&mut self, canvas: &mut Pixmap, layers: &[Layer]) -> Result<()> {
        let size = (canvas.width() as f64, canvas.height() as f64);
        for layer in layers.iter().filter(|l| l.visible) {
            let p = &layer.placement;
            p.validate()?;
            let asset = self.assets.get(&layer.path)?;
            self.draw(
                canvas,
                &layer.path,
                p.size_on((asset.width, asset.height), size),
                (p.x * size.0, p.y * size.1),
                p.rotation,
                p.opacity,
            )?;
        }
        Ok(())
    }
    pub fn compose(
        &mut self,
        page: &Page,
        background: Option<&Background>,
        layers: &[Layer],
        dpi: f64,
        max_edge: Option<u32>,
    ) -> Result<(RgbaImage, (f64, f64))> {
        let asset = self.assets.get(&page.path)?;
        let points = asset.points();
        let scale = max_edge.map_or(dpi / 72.0, |edge| edge as f64 / points.0.max(points.1));
        let (w, h) = dimensions(points.0 * scale, points.1 * scale)?;
        let mut canvas = Pixmap::new(w, h).context("이미지 메모리 부족")?;
        canvas.fill(tiny_skia::Color::WHITE);
        if let Some(bg) = background {
            let image = self.assets.get(&bg.path)?;
            let (sx, sy) = (w as f64 / image.width, h as f64 / image.height);
            let s = match bg.fit {
                Fit::Cover => sx.max(sy),
                Fit::Contain => sx.min(sy),
            };
            self.draw(
                &mut canvas,
                &bg.path,
                (image.width * s, image.height * s),
                (w as f64 / 2.0, h as f64 / 2.0),
                0.0,
                1.0,
            )?;
        }
        let t = &page.transform;
        ensure!(
            [t.scale, t.rotation, t.x, t.y, t.margin_mm]
                .iter()
                .all(|v| v.is_finite())
                && t.scale > 0.0
                && t.margin_mm >= 0.0,
            "페이지 편집 값이 올바르지 않습니다."
        );
        let margin = t.margin_mm * 72.0 / 25.4 * scale;
        ensure!(
            margin * 2.0 < w as f64 && margin * 2.0 < h as f64,
            "여백이 페이지 크기보다 큽니다."
        );
        let fit = ((w as f64 - margin * 2.0) / asset.width)
            .min((h as f64 - margin * 2.0) / asset.height)
            * t.scale;
        self.draw(
            &mut canvas,
            &page.path,
            (asset.width * fit, asset.height * fit),
            (w as f64 * (0.5 + t.x), h as f64 * (0.5 + t.y)),
            t.rotation,
            1.0,
        )?;
        self.layers(&mut canvas, layers)?;
        Ok((rgba(canvas), points))
    }
    pub fn image(
        &mut self,
        path: &Path,
        layers: &[Layer],
        max_edge: Option<u32>,
    ) -> Result<(RgbaImage, f64)> {
        let source = self.assets.get(path)?;
        let scale = max_edge.map_or(1.0, |edge| {
            let scale = edge as f64 / source.width.max(source.height);
            if matches!(source.content, assets::Content::Svg(_)) {
                scale
            } else {
                scale.min(1.0)
            }
        });
        let (w, h) = dimensions(source.width * scale, source.height * scale)?;
        let mut canvas = source.raster(w, h)?;
        self.layers(&mut canvas, layers)?;
        Ok((rgba(canvas), source.dpi))
    }
    pub fn preview_pdf(
        &mut self,
        path: &Path,
        page: usize,
        layers: &[Layer],
        edge: u32,
    ) -> Result<(RgbaImage, usize, (f64, f64))> {
        let meta = std::fs::metadata(path)?;
        let key = format!(
            "{}:{:?}:{}:{page}:{edge}",
            path.display(),
            meta.modified().ok(),
            meta.len()
        );
        let (image, count, points) = if let Some((old, image, count, points)) = &self.pdf_preview {
            if old == &key {
                (image.clone(), *count, *points)
            } else {
                pdf::preview(path, page, edge)?
            }
        } else {
            pdf::preview(path, page, edge)?
        };
        if self
            .pdf_preview
            .as_ref()
            .is_none_or(|(old, _, _, _)| old != &key)
        {
            self.pdf_preview = Some((key, image.clone(), count, points));
        }
        let size = tiny_skia::IntSize::from_wh(image.width(), image.height())
            .context("잘못된 PDF 크기")?;
        let mut pix = Pixmap::from_vec(image.into_raw(), size).context("PDF 픽셀 오류")?;
        self.layers(&mut pix, layers)?;
        Ok((rgba(pix), count, points))
    }
    pub fn batch(
        &mut self,
        batch: &Batch,
        replace: bool,
        cancel: &AtomicBool,
        mut progress: impl FnMut(Progress),
    ) -> Result<Report> {
        let targets = output::plan(batch)?;
        ensure!(
            replace || targets.iter().all(|p| !p.exists()),
            "출력이 이미 있습니다. 덮어쓰기를 확인하세요."
        );
        let mut report = Report::default();
        for (index, (source, target)) in batch.inputs.iter().zip(targets).enumerate() {
            if cancel.load(Ordering::Relaxed) {
                report.cancelled = true;
                break;
            }
            progress(Progress {
                label: file_name(source),
                completed: index,
                total: batch.inputs.len(),
            });
            let result: Result<usize> = (|| {
                let (bytes, pages) = if assets::is_pdf(source) {
                    let bytes = assets::read_file(source)?;
                    let pages = pdf::open(bytes.clone())?.pages().len();
                    let stamped = pdf::stamp(&bytes, &batch.layers, &mut self.assets, cancel)?;
                    let bytes = if batch.flatten {
                        pdf::flatten(stamped, batch.profile, cancel, |done, total| {
                            progress(Progress {
                                label: format!("{} · {done}/{total} 페이지", file_name(source)),
                                completed: index,
                                total: batch.inputs.len(),
                            })
                        })?
                    } else {
                        stamped
                    };
                    (bytes, pages)
                } else {
                    let (image, dpi) = self.image(source, &batch.layers, None)?;
                    (assets::encode_image(&target, image, dpi)?, 1)
                };
                ensure!(!cancel.load(Ordering::Relaxed), "작업 취소됨");
                output::atomic_write(&target, &bytes, replace)?;
                Ok(pages)
            })();
            match result {
                Ok(pages) => report.saved.push(Saved {
                    source: source.display().to_string(),
                    path: target,
                    pages,
                }),
                Err(e) => report.errors.push(format!("{}: {e:#}", file_name(source))),
            }
        }
        report.cancelled |= cancel.load(Ordering::Relaxed);
        progress(Progress {
            label: "처리 완료".into(),
            completed: batch.inputs.len(),
            total: batch.inputs.len(),
        });
        Ok(report)
    }
    pub fn groups(
        &mut self,
        project: &Project,
        folder: &Path,
        profile: Profile,
        cancel: &AtomicBool,
        mut progress: impl FnMut(Progress),
    ) -> Result<Report> {
        ensure!(folder.is_dir(), "출력 폴더가 없습니다.");
        let total = project.groups.iter().map(|g| g.pages.len()).sum();
        let mut done = 0;
        let mut report = Report::default();
        for (index, group) in project
            .groups
            .iter()
            .enumerate()
            .filter(|(_, g)| !g.pages.is_empty())
        {
            if cancel.load(Ordering::Relaxed) {
                report.cancelled = true;
                break;
            }
            let result: Result<PathBuf> = (|| {
                let mut pdf = pdf::RasterPdf::new();
                for page in &group.pages {
                    ensure!(!cancel.load(Ordering::Relaxed), "작업 취소됨");
                    progress(Progress {
                        label: group.name.clone(),
                        completed: done,
                        total,
                    });
                    let (image, points) = self.compose(
                        page,
                        project.background_for(index),
                        project.layers_for(index),
                        profile.dpi() as f64,
                        None,
                    )?;
                    pdf.push(&image, points, profile)?;
                    done += 1;
                }
                ensure!(!cancel.load(Ordering::Relaxed), "작업 취소됨");
                output::publish_group(folder, &group.name, &pdf.finish()?)
            })();
            match result {
                Ok(path) => report.saved.push(Saved {
                    source: group.name.clone(),
                    path,
                    pages: group.pages.len(),
                }),
                Err(e) => report.errors.push(format!("{}: {e:#}", group.name)),
            }
        }
        report.cancelled |= cancel.load(Ordering::Relaxed);
        progress(Progress {
            label: "처리 완료".into(),
            completed: done,
            total,
        });
        Ok(report)
    }
}

fn rgba(pix: Pixmap) -> RgbaImage {
    let (width, height) = (pix.width(), pix.height());
    RgbaImage::from_raw(width, height, pix.take_demultiplied()).expect("checked pixmap dimensions")
}
