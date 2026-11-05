use crate::{
    assets::{AssetCache, read_file},
    model::{Layer, Profile, dimensions},
};
use anyhow::{Context, Result, ensure};
use flate2::{Compression, write::ZlibEncoder};
use hayro::{
    hayro_interpret::{InterpreterSettings, util::TransformExt},
    hayro_syntax::Pdf,
    kurbo::Affine,
};
use image::RgbaImage;
use lopdf::{
    Document, Object, ObjectId, Stream,
    content::{Content, Operation},
    dictionary,
};
use std::{
    io::Write,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};

fn deflate(bytes: &[u8], level: u32) -> Result<Vec<u8>> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::new(level));
    encoder.write_all(bytes)?;
    Ok(encoder.finish()?)
}
fn paeth(a: u8, b: u8, c: u8) -> u8 {
    let p = a as i32 + b as i32 - c as i32;
    let (pa, pb, pc) = (
        (p - a as i32).abs(),
        (p - b as i32).abs(),
        (p - c as i32).abs(),
    );
    if pa <= pb && pa <= pc {
        a
    } else if pb <= pc {
        b
    } else {
        c
    }
}
pub fn filtered_rgb(rgb: &[u8], width: u32) -> Vec<u8> {
    let stride = width as usize * 3;
    let mut output = Vec::with_capacity(rgb.len() + rgb.len() / stride);
    let mut candidates = vec![vec![0u8; stride]; 5];
    for (y, row) in rgb.chunks_exact(stride).enumerate() {
        let prev = if y == 0 {
            None
        } else {
            Some(&rgb[(y - 1) * stride..y * stride])
        };
        let mut scores = [0u64; 5];
        for (x, &pixel) in row.iter().enumerate() {
            let a = if x >= 3 { row[x - 3] } else { 0 };
            let b = prev.map_or(0, |r| r[x]);
            let c = if x >= 3 {
                prev.map_or(0, |r| r[x - 3])
            } else {
                0
            };
            for (filter, predictor) in [0, a, b, ((a as u16 + b as u16) / 2) as u8, paeth(a, b, c)]
                .into_iter()
                .enumerate()
            {
                let value = pixel.wrapping_sub(predictor);
                candidates[filter][x] = value;
                scores[filter] += (value as i8 as i16).unsigned_abs() as u64;
            }
        }
        let best = (0..5).min_by_key(|&i| scores[i]).unwrap();
        output.push(best as u8);
        output.extend_from_slice(&candidates[best]);
    }
    output
}

pub fn image_stream(rgb: &[u8], width: u32, height: u32, profile: Profile) -> Result<Stream> {
    ensure!(
        rgb.len() == width as usize * height as usize * 3,
        "잘못된 RGB 데이터"
    );
    let plain = deflate(rgb, 6)?;
    let filtered = filtered_rgb(rgb, width);
    let compressed = deflate(&filtered, 9)?;
    let (mut bytes, mut predictor) = if compressed.len() < plain.len() {
        (compressed, true)
    } else {
        (plain, false)
    };
    let mut jpeg = false;
    if let Some(quality) = profile.quality() {
        let mut candidate = Vec::new();
        let mut encoder = jpeg_encoder::Encoder::new(&mut candidate, quality);
        encoder.set_sampling_factor(jpeg_encoder::SamplingFactor::F_1_1);
        encoder.encode(
            rgb,
            width as u16,
            height as u16,
            jpeg_encoder::ColorType::Rgb,
        )?;
        if candidate.len() < bytes.len() {
            bytes = candidate;
            jpeg = true;
            predictor = false;
        }
    }
    let mut dict = dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => width, "Height" => height,
    "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8, "Filter" => if jpeg { "DCTDecode" } else { "FlateDecode" } };
    if predictor {
        dict.set("DecodeParms", dictionary! { "Predictor" => 15, "Colors" => 3, "BitsPerComponent" => 8, "Columns" => width });
    }
    Ok(Stream::new(dict, bytes))
}

pub struct RasterPdf {
    doc: Document,
    pages_id: ObjectId,
    pages: Vec<Object>,
}
impl Default for RasterPdf {
    fn default() -> Self {
        Self::new()
    }
}
impl RasterPdf {
    pub fn new() -> Self {
        let mut doc = Document::with_version("1.7");
        let pages_id = doc.new_object_id();
        Self {
            doc,
            pages_id,
            pages: vec![],
        }
    }
    pub fn push(&mut self, rgba: &RgbaImage, points: (f64, f64), profile: Profile) -> Result<()> {
        let rgb = crate::assets::opaque_rgb(rgba);
        let image = self
            .doc
            .add_object(image_stream(&rgb, rgba.width(), rgba.height(), profile)?);
        let content = Content {
            operations: vec![
                op("q", vec![]),
                op("cm", reals([points.0, 0.0, 0.0, points.1, 0.0, 0.0])),
                op("Do", vec![Object::Name(b"PageImage".to_vec())]),
                op("Q", vec![]),
            ],
        }
        .encode()?;
        let content_id = self.doc.add_object(Stream::new(dictionary! {}, content));
        let page = self.doc.add_object(dictionary! { "Type" => "Page", "Parent" => self.pages_id,
            "MediaBox" => vec![0.into(), 0.into(), real(points.0), real(points.1)],
            "Resources" => dictionary! { "XObject" => dictionary! { "PageImage" => image } }, "Contents" => content_id });
        self.pages.push(page.into());
        Ok(())
    }
    pub fn finish(mut self) -> Result<Vec<u8>> {
        ensure!(!self.pages.is_empty(), "빈 PDF는 저장할 수 없습니다.");
        self.doc.objects.insert(self.pages_id, dictionary! { "Type" => "Pages", "Count" => self.pages.len() as u32, "Kids" => self.pages }.into());
        let catalog = self
            .doc
            .add_object(dictionary! { "Type" => "Catalog", "Pages" => self.pages_id });
        self.doc.trailer.set("Root", catalog);
        self.doc.compress();
        let mut bytes = Vec::new();
        self.doc.save_to(&mut bytes)?;
        Ok(bytes)
    }
}
fn real(v: f64) -> Object {
    Object::Real(v as f32)
}
fn reals(v: [f64; 6]) -> Vec<Object> {
    v.into_iter().map(real).collect()
}
fn op(name: &str, values: Vec<Object>) -> Operation {
    Operation::new(name, values)
}

pub fn open(bytes: Vec<u8>) -> Result<Pdf> {
    Pdf::new(bytes).map_err(|e| anyhow::anyhow!("PDF를 열 수 없습니다: {e:?}"))
}
pub fn preview(path: &Path, page: usize, max_edge: u32) -> Result<(RgbaImage, usize, (f64, f64))> {
    let pdf = open(read_file(path)?)?;
    let target = pdf.pages().get(page).context("PDF 페이지가 없습니다.")?;
    let (w, h) = target.render_dimensions();
    let scale = max_edge as f64 / (w as f64).max(h as f64);
    let image = render_page(target, &hayro::RenderCache::new(), scale)?;
    Ok((image, pdf.pages().len(), (w as f64, h as f64)))
}
fn render_page<'a>(
    page: &'a hayro::hayro_syntax::page::Page<'a>,
    cache: &hayro::RenderCache<'a>,
    scale: f64,
) -> Result<RgbaImage> {
    let (w, h) = page.render_dimensions();
    let (width, height) = dimensions(w as f64 * scale, h as f64 * scale)?;
    // Use the exact checked integer dimensions: the simplified API truncates f32 products.
    let mut context = hayro::vello_cpu::RenderContext::new(width as u16, height as u16);
    let transform = Affine::scale_non_uniform(width as f64 / w as f64, height as f64 / h as f64)
        * page.initial_transform(true).to_kurbo();
    hayro::render_into(
        page,
        cache,
        &InterpreterSettings::default(),
        &hayro::RenderSettings::default(),
        &mut context,
        transform,
    );
    context.flush();
    let mut pixmap = hayro::vello_cpu::Pixmap::new(width as u16, height as u16);
    context.render_with(
        &mut pixmap,
        &mut hayro::vello_cpu::Resources::default(),
        hayro::vello_cpu::RasterizerSettings {
            target_init: hayro::vello_cpu::TargetInit::Clear(
                hayro::vello_cpu::color::palette::css::WHITE,
            ),
            ..Default::default()
        },
    );
    RgbaImage::from_raw(
        pixmap.width() as u32,
        pixmap.height() as u32,
        pixmap.take_rgba8(hayro::vello_cpu::peniko::ImageAlphaType::Alpha),
    )
    .context("PDF 픽셀 데이터 오류")
}

fn inherited(doc: &Document, id: ObjectId, key: &[u8]) -> Result<Object> {
    let mut id = id;
    let mut seen = std::collections::HashSet::new();
    while seen.insert(id) {
        let dict = doc.get_object(id)?.as_dict()?;
        if let Ok(value) = dict.get(key) {
            return Ok(doc.dereference(value)?.1.clone());
        }
        match dict.get(b"Parent").and_then(Object::as_reference) {
            Ok(parent) => id = parent,
            Err(_) => break,
        }
    }
    Ok(dictionary! {}.into())
}
fn resolved_dictionary(
    doc: &Document,
    parent: &lopdf::Dictionary,
    key: &[u8],
) -> lopdf::Dictionary {
    parent
        .get(key)
        .ok()
        .and_then(|v| doc.dereference(v).ok())
        .and_then(|(_, v)| v.as_dict().ok())
        .cloned()
        .unwrap_or_default()
}

pub fn stamp(
    bytes: &[u8],
    layers: &[Layer],
    cache: &mut AssetCache,
    cancelled: &AtomicBool,
) -> Result<Vec<u8>> {
    let view = open(bytes.to_vec())?;
    let mut doc = Document::load_mem(bytes)?;
    ensure!(!doc.is_encrypted(), "암호화된 PDF는 지원하지 않습니다.");
    let mut embedded = vec![];
    for (index, layer) in layers
        .iter()
        .enumerate()
        .filter(|(_, l)| l.visible && l.placement.opacity > 0.0)
    {
        layer.placement.validate()?;
        let asset = cache.get(&layer.path)?;
        let (w, h) = dimensions(asset.width, asset.height)?;
        let pix = asset.raster(w, h)?;
        let mut rgb = Vec::with_capacity(w as usize * h as usize * 3);
        let mut alpha = Vec::with_capacity(w as usize * h as usize);
        for p in pix.pixels() {
            let c = p.demultiply();
            rgb.extend_from_slice(&[c.red(), c.green(), c.blue()]);
            alpha.push(c.alpha());
        }
        let mut stream = image_stream(&rgb, w, h, Profile::Original)?;
        if alpha.iter().any(|&a| a < 255) {
            let mask = doc.add_object(Stream::new(dictionary! { "Type" => "XObject", "Subtype" => "Image", "Width" => w, "Height" => h, "ColorSpace" => "DeviceGray", "BitsPerComponent" => 8, "Filter" => "FlateDecode" },deflate(&alpha,6)?));
            stream.dict.set("SMask", mask);
        }
        let image_id = doc.add_object(stream);
        let state_id = doc.add_object(dictionary! { "Type" => "ExtGState", "ca" => real(layer.placement.opacity), "CA" => real(layer.placement.opacity) });
        embedded.push((index, layer, asset, image_id, state_id));
    }
    let page_ids: Vec<_> = doc.get_pages().values().copied().collect();
    ensure!(
        page_ids.len() == view.pages().len(),
        "PDF 페이지 수를 확인할 수 없습니다."
    );
    for (id, page) in page_ids.into_iter().zip(view.pages().iter()) {
        ensure!(!cancelled.load(Ordering::Relaxed), "작업 취소됨");
        let (pw, ph) = page.render_dimensions();
        let inverse = page.initial_transform(true).to_kurbo().inverse();
        let mut resources = inherited(&doc, id, b"Resources")?.as_dict()?.clone();
        let mut xobjects = resolved_dictionary(&doc, &resources, b"XObject");
        let mut states = resolved_dictionary(&doc, &resources, b"ExtGState");
        let mut operations = vec![];
        for (index, layer, asset, image_id, state_id) in &embedded {
            let mut name = format!("BW{index}");
            while xobjects.has(name.as_bytes()) || states.has(name.as_bytes()) {
                name.push('_');
            }
            xobjects.set(name.as_bytes(), *image_id);
            states.set(name.as_bytes(), *state_id);
            let p = &layer.placement;
            let (w, h) = p.size_on((asset.width, asset.height), (pw as f64, ph as f64));
            let matrix = inverse
                * Affine::translate((p.x * pw as f64, p.y * ph as f64))
                * Affine::rotate(p.rotation.to_radians())
                * Affine::scale_non_uniform(w, -h)
                * Affine::translate((-0.5, -0.5));
            operations.extend([
                op("q", vec![]),
                op("gs", vec![Object::Name(name.as_bytes().to_vec())]),
                op("cm", reals(matrix.as_coeffs())),
                op("Do", vec![Object::Name(name.into_bytes())]),
                op("Q", vec![]),
            ]);
        }
        resources.set("XObject", xobjects);
        resources.set("ExtGState", states);
        // Isolate inherited source graphics state before appending the watermark stream.
        let prefix = doc.add_object(Stream::new(dictionary! {}, b"q\n".to_vec()));
        let suffix = doc.add_object(Stream::new(
            dictionary! {},
            [b"\nQ\n".as_slice(), &Content { operations }.encode()?].concat(),
        ));
        let existing = doc
            .get_object(id)?
            .as_dict()?
            .get(b"Contents")
            .ok()
            .cloned();
        let mut contents = vec![prefix.into()];
        if let Some(value) = existing {
            match doc.dereference(&value)?.1 {
                Object::Array(values) => contents.extend(values.clone()),
                _ => contents.push(value),
            }
        }
        contents.push(suffix.into());
        let dict = doc.get_object_mut(id)?.as_dict_mut()?;
        dict.set("Resources", resources);
        dict.set("Contents", contents);
    }
    doc.compress();
    let mut result = vec![];
    doc.save_to(&mut result)?;
    Ok(result)
}

pub fn flatten(
    bytes: Vec<u8>,
    profile: Profile,
    cancelled: &AtomicBool,
    mut progress: impl FnMut(usize, usize),
) -> Result<Vec<u8>> {
    let source = open(bytes)?;
    let cache = hayro::RenderCache::new();
    let mut output = RasterPdf::new();
    for (i, page) in source.pages().iter().enumerate() {
        ensure!(!cancelled.load(Ordering::Relaxed), "작업 취소됨");
        let (w, h) = page.render_dimensions();
        let image = render_page(page, &cache, profile.dpi() as f64 / 72.0)?;
        output.push(&image, (w as f64, h as f64), profile)?;
        progress(i + 1, source.pages().len());
    }
    output.finish()
}
