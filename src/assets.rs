use crate::model::dimensions;
use anyhow::{Context, Result, bail, ensure};
use image::{DynamicImage, ImageDecoder, ImageReader};
use resvg::{tiny_skia, usvg};
use std::{
    collections::{HashMap, VecDeque},
    fs,
    io::{BufReader, Cursor},
    path::{Path, PathBuf},
    sync::{Arc, OnceLock},
    time::SystemTime,
};

pub enum Content {
    Raster(DynamicImage),
    Svg(Box<usvg::Tree>),
}
pub struct Asset {
    pub width: f64,
    pub height: f64,
    pub dpi: f64,
    pub content: Content,
    cost: usize,
}
impl Asset {
    pub fn points(&self) -> (f64, f64) {
        (self.width * 72.0 / self.dpi, self.height * 72.0 / self.dpi)
    }
    pub fn raster(&self, width: u32, height: u32) -> Result<tiny_skia::Pixmap> {
        dimensions(width as f64, height as f64)?;
        match &self.content {
            Content::Svg(tree) => {
                let mut pix =
                    tiny_skia::Pixmap::new(width, height).context("이미지 메모리 부족")?;
                resvg::render(
                    tree,
                    tiny_skia::Transform::from_scale(
                        width as f32 / self.width as f32,
                        height as f32 / self.height as f32,
                    ),
                    &mut pix.as_mut(),
                );
                Ok(pix)
            }
            Content::Raster(image) => {
                let rgba = image
                    .resize_exact(width, height, image::imageops::FilterType::Lanczos3)
                    .to_rgba8();
                let mut data = rgba.into_raw();
                for p in data.as_chunks_mut::<4>().0 {
                    for c in 0..3 {
                        p[c] = ((p[c] as u16 * p[3] as u16 + 127) / 255) as u8;
                    }
                }
                tiny_skia::Pixmap::from_vec(
                    data,
                    tiny_skia::IntSize::from_wh(width, height).context("잘못된 크기")?,
                )
                .context("잘못된 픽셀 데이터")
            }
        }
    }
}

pub fn read_file(path: &Path) -> Result<Vec<u8>> {
    ensure!(
        fs::metadata(path)?.len() <= 512 * 1024 * 1024,
        "512 MiB보다 큰 입력 파일은 지원하지 않습니다."
    );
    fs::read(path).with_context(|| format!("파일을 읽을 수 없습니다: {}", path.display()))
}
pub fn is_pdf(path: &Path) -> bool {
    path.extension()
        .is_some_and(|s| s.eq_ignore_ascii_case("pdf"))
}
pub fn supported(path: &Path, pdf: bool) -> bool {
    let ext = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    ["svg", "png", "jpg", "jpeg", "webp", "tif", "tiff"].contains(&ext.as_str())
        || (pdf && ext == "pdf")
}

fn svg(bytes: &[u8]) -> Result<Asset> {
    let source = std::str::from_utf8(bytes)?;
    let lower = source.to_lowercase();
    ensure!(
        !lower.contains("<!doctype") && !lower.contains("<!entity") && !lower.contains("@import"),
        "외부 문서/스타일 선언은 지원하지 않습니다."
    );
    let xml = roxmltree::Document::parse(source)?;
    ensure!(
        xml.root_element().tag_name().name() == "svg",
        "SVG 문서가 아닙니다."
    );
    for node in xml.descendants().filter(|n| n.is_element()) {
        ensure!(
            !["script", "foreignObject"].contains(&node.tag_name().name()),
            "SVG 스크립트와 foreignObject는 지원하지 않습니다."
        );
        for attr in node.attributes() {
            ensure!(
                !attr.name().to_lowercase().starts_with("on"),
                "SVG 이벤트 스크립트는 지원하지 않습니다."
            );
            if attr.name() == "href" {
                ensure!(
                    attr.value().starts_with('#') || attr.value().starts_with("data:image/"),
                    "외부 이미지는 SVG 안에 포함하세요."
                );
            }
        }
    }
    // Reject every non-fragment CSS URL, including relative paths and escaped URLs.
    let compact: String = lower.chars().filter(|c| !c.is_whitespace()).collect();
    for part in compact.split("url(").skip(1) {
        let url = part
            .split(')')
            .next()
            .unwrap_or_default()
            .trim_matches(['\'', '"']);
        ensure!(
            url.starts_with('#') && !url.contains('\\'),
            "외부 SVG 스타일 참조는 지원하지 않습니다."
        );
    }
    let mut options = usvg::Options::default();
    static FONTS: OnceLock<Arc<usvg::fontdb::Database>> = OnceLock::new();
    options.fontdb = FONTS
        .get_or_init(|| {
            let mut fonts = usvg::fontdb::Database::new();
            fonts.load_system_fonts();
            Arc::new(fonts)
        })
        .clone();
    options.image_href_resolver.resolve_string = Box::new(|_, _| None);
    let tree = usvg::Tree::from_data(bytes, &options)?;
    let size = tree.size();
    let (width, height) = (size.width() as f64, size.height() as f64);
    ensure!(
        width.is_finite() && height.is_finite() && width > 0.0 && height > 0.0,
        "SVG 크기가 올바르지 않습니다."
    );
    Ok(Asset {
        width,
        height,
        dpi: 96.0,
        content: Content::Svg(Box::new(tree)),
        cost: bytes.len() * 8,
    })
}

pub fn density(bytes: &[u8]) -> f64 {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        let mut at = 8;
        while at + 12 <= bytes.len() {
            let len = u32::from_be_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
            if len > bytes.len() - at - 12 {
                break;
            }
            if &bytes[at + 4..at + 8] == b"pHYs" && len == 9 && bytes[at + 16] == 1 {
                let v =
                    u32::from_be_bytes(bytes[at + 8..at + 12].try_into().unwrap()) as f64 * 0.0254;
                if v > 0.0 {
                    return v;
                }
            }
            at += 12 + len;
        }
    }
    if bytes.len() > 18 && bytes[0..2] == [0xff, 0xd8] && &bytes[6..11] == b"JFIF\0" {
        let v = u16::from_be_bytes([bytes[14], bytes[15]]) as f64;
        let dpi = match bytes[13] {
            1 => v,
            2 => v * 2.54,
            _ => 0.0,
        };
        if dpi > 0.0 {
            return dpi;
        }
    }
    if let Ok(exif) = exif::Reader::new().read_from_container(&mut Cursor::new(bytes)) {
        let v = exif
            .get_field(exif::Tag::XResolution, exif::In::PRIMARY)
            .and_then(|f| match &f.value {
                exif::Value::Rational(v) => v.first().map(|v| v.to_f64()),
                _ => None,
            });
        let unit = exif
            .get_field(exif::Tag::ResolutionUnit, exif::In::PRIMARY)
            .and_then(|f| f.value.get_uint(0))
            .unwrap_or(2);
        if let Some(v) = v {
            let dpi = if unit == 3 { v * 2.54 } else { v };
            if dpi.is_finite() && dpi > 0.0 {
                return dpi;
            }
        }
    }
    96.0
}

pub fn load(path: &Path) -> Result<Asset> {
    ensure!(
        supported(path, false),
        "지원하지 않는 이미지 형식: {}",
        path.display()
    );
    let bytes = read_file(path)?;
    if path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("svg"))
    {
        return svg(&bytes);
    }
    let mut reader = ImageReader::new(BufReader::new(Cursor::new(&bytes))).with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(crate::model::MAX_EDGE);
    limits.max_image_height = Some(crate::model::MAX_EDGE);
    limits.max_alloc = Some(crate::model::MAX_PIXELS * 8);
    reader.limits(limits);
    let mut decoder = reader.into_decoder()?;
    let (w, h) = decoder.dimensions();
    dimensions(w as f64, h as f64)?;
    let orientation = decoder.orientation()?;
    let mut raster = DynamicImage::from_decoder(decoder)?;
    raster.apply_orientation(orientation);
    let (width, height) = (raster.width() as f64, raster.height() as f64);
    Ok(Asset {
        width,
        height,
        dpi: density(&bytes),
        cost: raster.as_bytes().len(),
        content: Content::Raster(raster),
    })
}

type Fingerprint = (u64, Option<SystemTime>);
#[derive(Default)]
pub struct AssetCache {
    entries: HashMap<PathBuf, (Fingerprint, Arc<Asset>)>,
    order: VecDeque<PathBuf>,
    cost: usize,
    pub hits: u64,
    pub misses: u64,
}
impl AssetCache {
    pub fn get(&mut self, path: &Path) -> Result<Arc<Asset>> {
        let meta = fs::metadata(path)?;
        let stamp = (meta.len(), meta.modified().ok());
        if let Some((old, asset)) = self.entries.get(path)
            && *old == stamp
        {
            self.hits += 1;
            return Ok(asset.clone());
        }
        self.misses += 1;
        if let Some((_, old)) = self.entries.remove(path) {
            self.cost -= old.cost;
        }
        self.order.retain(|p| p != path);
        let asset = Arc::new(load(path)?);
        while self.cost + asset.cost > 128 * 1024 * 1024 {
            let Some(old) = self.order.pop_front() else {
                break;
            };
            if let Some((_, old)) = self.entries.remove(&old) {
                self.cost -= old.cost;
            }
        }
        // A single large image is used without retaining another batch-long reference.
        if asset.cost <= 128 * 1024 * 1024 {
            self.cost += asset.cost;
            self.entries
                .insert(path.to_path_buf(), (stamp, asset.clone()));
            self.order.push_back(path.to_path_buf());
        }
        Ok(asset)
    }
}

pub fn encode_image(path: &Path, rgba: image::RgbaImage, dpi: f64) -> Result<Vec<u8>> {
    use image::ImageEncoder;
    let mut output = Vec::new();
    let ext = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    match ext.as_str() {
        "png" => {
            let mut encoder = png::Encoder::new(&mut output, rgba.width(), rgba.height());
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let ppm = (dpi / 0.0254).round().clamp(1.0, u32::MAX as f64) as u32;
            encoder.set_pixel_dims(Some(png::PixelDimensions {
                xppu: ppm,
                yppu: ppm,
                unit: png::Unit::Meter,
            }));
            encoder.write_header()?.write_image_data(rgba.as_raw())?;
        }
        "jpg" | "jpeg" => {
            let rgb = opaque_rgb(&rgba);
            let mut encoder = jpeg_encoder::Encoder::new(&mut output, 95);
            encoder.set_density(jpeg_encoder::PixelDensity {
                density: (
                    dpi.round().clamp(1.0, 65535.0) as u16,
                    dpi.round().clamp(1.0, 65535.0) as u16,
                ),
                unit: jpeg_encoder::PixelDensityUnit::Inches,
            });
            encoder.set_sampling_factor(jpeg_encoder::SamplingFactor::F_1_1);
            encoder.encode(
                &rgb,
                rgba.width() as u16,
                rgba.height() as u16,
                jpeg_encoder::ColorType::Rgb,
            )?;
        }
        "tif" | "tiff" => {
            let mut cursor = Cursor::new(&mut output);
            let mut encoder = tiff::encoder::TiffEncoder::new(&mut cursor)?;
            let mut image = encoder
                .new_image::<tiff::encoder::colortype::RGBA8>(rgba.width(), rgba.height())?;
            image.resolution(
                tiff::tags::ResolutionUnit::Inch,
                tiff::encoder::Rational {
                    n: (dpi * 1000.0).round().clamp(1.0, u32::MAX as f64) as u32,
                    d: 1000,
                },
            );
            image.write_data(rgba.as_raw())?;
        }
        "webp" => {
            let mut encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut output);
            encoder.set_exif_metadata(density_exif(dpi))?;
            encoder.write_image(
                rgba.as_raw(),
                rgba.width(),
                rgba.height(),
                image::ExtendedColorType::Rgba8,
            )?;
        }
        _ => bail!("출력 형식을 지원하지 않습니다: {ext}"),
    }
    Ok(output)
}

fn density_exif(dpi: f64) -> Vec<u8> {
    // Minimal little-endian TIFF IFD: X/YResolution and inch units. No stale orientation tag.
    let mut bytes = b"II\x2a\0\x08\0\0\0".to_vec();
    bytes.extend_from_slice(&3u16.to_le_bytes());
    for (tag, kind, count, value) in [(282u16, 5u16, 1u32, 50u32), (283, 5, 1, 58), (296, 3, 1, 2)]
    {
        bytes.extend_from_slice(&tag.to_le_bytes());
        bytes.extend_from_slice(&kind.to_le_bytes());
        bytes.extend_from_slice(&count.to_le_bytes());
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes.extend_from_slice(&0u32.to_le_bytes());
    for _ in 0..2 {
        bytes.extend_from_slice(
            &((dpi * 1000.0).round().clamp(1.0, u32::MAX as f64) as u32).to_le_bytes(),
        );
        bytes.extend_from_slice(&1000u32.to_le_bytes());
    }
    bytes
}

pub fn opaque_rgb(rgba: &image::RgbaImage) -> Vec<u8> {
    let mut rgb = Vec::with_capacity(rgba.width() as usize * rgba.height() as usize * 3);
    for p in rgba.pixels() {
        for c in 0..3 {
            rgb.push(((p[c] as u16 * p[3] as u16 + 255 * (255 - p[3] as u16) + 127) / 255) as u8);
        }
    }
    rgb
}
