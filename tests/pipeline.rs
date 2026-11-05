#![allow(clippy::field_reassign_with_default)]
use batch_watermarker::{assets, engine::Engine, model::*, output, pdf};
use image::{Rgba, RgbaImage};
use lopdf::{
    Document, Object, Stream,
    content::{Content, Operation},
    dictionary,
};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
};

fn svg(folder: &Path, name: &str, width: &str, height: &str, body: &str) -> PathBuf {
    let path = folder.join(name);
    fs::write(&path,format!(r##"<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 96 72">{body}</svg>"##)).unwrap();
    path
}
fn red(folder: &Path) -> PathBuf {
    let path = folder.join("mark.png");
    RgbaImage::from_pixel(20, 10, Rgba([255, 0, 0, 255]))
        .save(&path)
        .unwrap();
    path
}
fn layer(path: PathBuf) -> Layer {
    let mut l = Layer::new(path);
    l.placement.opacity = 1.0;
    l.placement.size = 0.25;
    l
}
fn source_pdf(rotation: i64) -> Vec<u8> {
    let mut doc = Document::with_version("1.7");
    let pages = doc.new_object_id();
    let font =
        doc.add_object(dictionary! {"Type"=>"Font","Subtype"=>"Type1","BaseFont"=>"Helvetica"});
    let stream = Content {
        operations: vec![
            Operation::new("BT", vec![]),
            Operation::new("Tf", vec![Object::Name(b"F1".to_vec()), 8.into()]),
            Operation::new("Td", vec![14.into(), 44.into()]),
            Operation::new("Tj", vec![Object::string_literal("Keep this text")]),
            Operation::new("ET", vec![]),
        ],
    }
    .encode()
    .unwrap();
    let content = doc.add_object(Stream::new(dictionary! {}, stream));
    let old_image=doc.add_object(Stream::new(dictionary!{"Type"=>"XObject","Subtype"=>"Image","Width"=>1,"Height"=>1,"ColorSpace"=>"DeviceRGB","BitsPerComponent"=>8},vec![0,0,0]));
    let page=doc.add_object(dictionary!{"Type"=>"Page","Parent"=>pages,"MediaBox"=>vec![0.into(),0.into(),100.into(),100.into()],"CropBox"=>vec![10.into(),20.into(),82.into(),74.into()],"Rotate"=>rotation,"Contents"=>content});
    doc.objects.insert(pages,dictionary!{"Type"=>"Pages","Count"=>1,"Kids"=>vec![page.into()],"Resources"=>dictionary!{"Font"=>dictionary!{"F1"=>font},"XObject"=>dictionary!{"BW0"=>old_image}}}.into());
    let root = doc.add_object(dictionary! {"Type"=>"Catalog","Pages"=>pages});
    doc.trailer.set("Root", root);
    let mut bytes = vec![];
    doc.save_to(&mut bytes).unwrap();
    bytes
}
fn cancel() -> AtomicBool {
    AtomicBool::new(false)
}
fn rgb_stream(doc: &Document) -> (&lopdf::Stream, u32, u32) {
    doc.objects
        .values()
        .filter_map(|o| o.as_stream().ok())
        .find_map(|s| {
            if s.dict.get(b"Subtype").and_then(Object::as_name).ok() == Some(b"Image")
                && s.dict.get(b"ColorSpace").and_then(Object::as_name).ok() == Some(b"DeviceRGB")
            {
                Some((
                    s,
                    s.dict.get(b"Width").unwrap().as_i64().unwrap() as u32,
                    s.dict.get(b"Height").unwrap().as_i64().unwrap() as u32,
                ))
            } else {
                None
            }
        })
        .unwrap()
}
// Independent implementation of the PNG filter reversal, separate from the writer.
fn decode_rgb(stream: &Stream, w: u32, h: u32) -> Vec<u8> {
    if stream.dict.get(b"Filter").unwrap().as_name().unwrap() == b"DCTDecode" {
        return image::load_from_memory(&stream.content)
            .unwrap()
            .to_rgb8()
            .into_raw();
    }
    let mut data = vec![];
    flate2::read::ZlibDecoder::new(&stream.content[..])
        .read_to_end(&mut data)
        .unwrap();
    if !stream.dict.has(b"DecodeParms") {
        return data;
    }
    let row = w as usize * 3;
    let mut out = vec![0u8; row * h as usize];
    for y in 0..h as usize {
        let f = data[y * (row + 1)];
        for x in 0..row {
            let a = if x >= 3 { out[y * row + x - 3] } else { 0 };
            let b = if y > 0 { out[(y - 1) * row + x] } else { 0 };
            let c = if y > 0 && x >= 3 {
                out[(y - 1) * row + x - 3]
            } else {
                0
            };
            let predictor = match f {
                0 => 0,
                1 => a,
                2 => b,
                3 => ((a as u16 + b as u16) / 2) as u8,
                4 => {
                    let p = a as i32 + b as i32 - c as i32;
                    let values = [a, b, c];
                    *values
                        .iter()
                        .min_by_key(|v| (p - **v as i32).abs())
                        .unwrap()
                }
                _ => panic!("bad filter"),
            };
            out[y * row + x] = data[y * (row + 1) + 1 + x].wrapping_add(predictor);
        }
    }
    out
}

#[test]
fn physical_svg_units() {
    let dir = tempfile::tempdir().unwrap();
    for (w, h, expected) in [
        ("25.4mm", "19.05mm", (72.0, 54.0)),
        ("1in", "0.75in", (72.0, 54.0)),
        ("96px", "72px", (72.0, 54.0)),
        ("72pt", "54pt", (72.0, 54.0)),
    ] {
        let path = svg(dir.path(), "score.svg", w, h, "");
        let asset = assets::load(&path).unwrap();
        let pts = asset.points();
        assert!((pts.0 - expected.0).abs() < 0.001);
        assert!((pts.1 - expected.1).abs() < 0.001);
    }
}
#[test]
fn viewbox_only_svg() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("view.svg");
    fs::write(
        &path,
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 72"/>"#,
    )
    .unwrap();
    assert_eq!(assets::load(&path).unwrap().points(), (72.0, 54.0));
}

#[test]
fn svg_preview_renders_at_display_resolution() {
    let dir = tempfile::tempdir().unwrap();
    let path = svg(dir.path(), "small.svg", "96", "72", "");
    let (preview, _) = Engine::default().image(&path, &[], Some(1400)).unwrap();
    assert_eq!(preview.width(), 1400);
    assert_eq!(preview.height(), 1050);
}
#[test]
fn unsafe_svg_rejected() {
    let dir = tempfile::tempdir().unwrap();
    for body in [
        r#"<script>alert(1)</script>"#,
        r#"<image href="file:///secret.png"/>"#,
        r#"<image href="relative.png"/>"#,
        r#"<style>@import 'other.css';</style>"#,
        r#"<rect fill="url(relative.svg#x)"/>"#,
        r#"<g onclick="attack()"/>"#,
        r#"<foreignObject/>"#,
    ] {
        let path = svg(dir.path(), "unsafe.svg", "96", "72", body);
        assert!(assets::load(&path).is_err(), "{body}");
    }
}
#[test]
fn dimensions_reject_invalid() {
    for (w, h) in [
        (f64::NAN, 1.0),
        (f64::INFINITY, 1.0),
        (-1.0, 2.0),
        (0.0, 4.0),
        (32768.0, 1.0),
        (20000.0, 20000.0),
    ] {
        assert!(dimensions(w, h).is_err());
    }
    assert_eq!(
        dimensions(72.0 * 600.0 / 72.0, 54.0 * 600.0 / 72.0).unwrap(),
        (600, 450)
    );
}
#[test]
fn invalid_placement_rejected() {
    let mut p = Placement::default();
    p.opacity = 1.1;
    assert!(p.validate().is_err());
    p.opacity = 0.5;
    p.x = f64::NAN;
    assert!(p.validate().is_err());
}
#[test]
fn longest_edge_sizing_and_snap() {
    let mut p = Placement::default();
    assert_eq!(p.size_on((200.0, 100.0), (600.0, 800.0)), (200.0, 100.0));
    p.x = 0.491;
    p.y = 0.892;
    p.snap(0.012);
    assert_eq!((p.x, p.y), (0.5, 0.9));
    p.width = Some(0.1);
    p.height = Some(0.2);
    assert_eq!(p.size_on((1.0, 1.0), (600.0, 800.0)), (60.0, 160.0));
}
#[test]
fn lossless_pdf_exact_rgb_and_single_image() {
    let mut im = RgbaImage::new(73, 61);
    for (x, y, p) in im.enumerate_pixels_mut() {
        *p = Rgba([(x * 3) as u8, (y * 4) as u8, ((x + y) * 2) as u8, 255]);
    }
    let mut pdf = pdf::RasterPdf::new();
    pdf.push(&im, (72.0, 54.0), Profile::Original).unwrap();
    let bytes = pdf.finish().unwrap();
    let doc = Document::load_mem(&bytes).unwrap();
    let (stream, w, h) = rgb_stream(&doc);
    assert_eq!((w, h), (73, 61));
    assert_eq!(decode_rgb(stream, w, h), assets::opaque_rgb(&im));
    assert_eq!(
        doc.objects
            .values()
            .filter(|o| o.as_stream().ok().is_some_and(|s| s
                .dict
                .get(b"Subtype")
                .and_then(Object::as_name)
                .ok()
                == Some(b"Image")))
            .count(),
        1
    );
    assert!(!stream.dict.has(b"SMask"));
    assert!(doc.extract_text(&[1]).unwrap().trim().is_empty());
}
#[test]
fn encoding_chooses_lossless_for_flat_art() {
    let rgb = vec![255; 256 * 256 * 3];
    for p in Profile::ALL {
        let stream = pdf::image_stream(&rgb, 256, 256, p).unwrap();
        assert_eq!(
            stream.dict.get(b"Filter").unwrap().as_name().unwrap(),
            b"FlateDecode"
        );
        assert_eq!(decode_rgb(&stream, 256, 256), rgb);
    }
}
#[test]
fn encoding_chooses_jpeg_for_texture() {
    let mut state = 123456789u32;
    let rgb: Vec<_> = (0..256 * 256 * 3)
        .map(|_| {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            state as u8
        })
        .collect();
    let stream = pdf::image_stream(&rgb, 256, 256, Profile::Distribution).unwrap();
    assert_eq!(
        stream.dict.get(b"Filter").unwrap().as_name().unwrap(),
        b"DCTDecode"
    );
    let data = &stream.content;
    let sof = data.windows(2).position(|p| p == [0xff, 0xc0]).unwrap();
    assert_eq!(data[sof + 11], 0x11, "JPEG must use 4:4:4 sampling");
}
#[test]
fn pdf_stamp_respects_rotation_crop_and_inherited_resources() {
    let dir = tempfile::tempdir().unwrap();
    let mut mark = layer(red(dir.path()));
    mark.placement.x = 0.25;
    mark.placement.y = 0.25;
    for rotation in [0, 90, 180, 270] {
        let bytes = source_pdf(rotation);
        let stamped = pdf::stamp(
            &bytes,
            &[mark.clone()],
            &mut assets::AssetCache::default(),
            &cancel(),
        )
        .unwrap();
        let doc = Document::load_mem(&stamped).unwrap();
        assert!(doc.extract_text(&[1]).unwrap().contains("Keep this text"));
        let path = dir.path().join("stamped.pdf");
        fs::write(&path, stamped).unwrap();
        let (im, _, _) = pdf::preview(&path, 0, 720).unwrap();
        let p = im.get_pixel(im.width() / 4, im.height() / 4);
        assert!(
            p[0] > 240 && p[1] < 20 && p[2] < 20,
            "rotation {rotation}: {p:?}"
        );
        let p = im.get_pixel(im.width() * 3 / 4, im.height() * 3 / 4);
        assert!(p[0] > 240 && p[1] > 240 && p[2] > 240);
    }
}
#[test]
fn flatten_preserves_displayed_size_profiles_and_removes_text() {
    for rotation in [0, 90] {
        for profile in Profile::ALL {
            let bytes = pdf::flatten(source_pdf(rotation), profile, &cancel(), |_, _| {}).unwrap();
            let doc = Document::load_mem(&bytes).unwrap();
            let (_, w, h) = rgb_stream(&doc);
            let expected = if rotation == 0 {
                (profile.dpi(), (profile.dpi() * 3).div_ceil(4))
            } else {
                ((profile.dpi() * 3).div_ceil(4), profile.dpi())
            };
            assert_eq!((w, h), expected);
            assert!(doc.extract_text(&[1]).unwrap().trim().is_empty());
            let view = pdf::open(bytes).unwrap();
            let expected = if rotation == 0 {
                (72.0, 54.0)
            } else {
                (54.0, 72.0)
            };
            assert_eq!(view.pages()[0].render_dimensions(), expected);
        }
    }
}
#[test]
fn group_composition_layer_order_clipping_opacity_and_background() {
    let dir = tempfile::tempdir().unwrap();
    let src = svg(
        dir.path(),
        "score.svg",
        "96",
        "72",
        r#"<rect x="0" y="0" width="8" height="8" fill="black"/>"#,
    );
    let bg = dir.path().join("bg.png");
    RgbaImage::from_pixel(10, 10, Rgba([0, 0, 255, 255]))
        .save(&bg)
        .unwrap();
    let mut mark = layer(red(dir.path()));
    mark.placement.opacity = 0.5;
    let (im, _) = Engine::default()
        .compose(
            &Page {
                path: src,
                transform: PageTransform::default(),
            },
            Some(&Background {
                path: bg,
                fit: Fit::Cover,
            }),
            &[mark],
            96.0,
            None,
        )
        .unwrap();
    let p = im.get_pixel(48, 36);
    assert!((p[0] as i32 - 128).abs() <= 1 && p[1] == 0 && (p[2] as i32 - 127).abs() <= 1);
    assert_eq!(im.get_pixel(1, 1).0, [0, 0, 0, 255]);
    assert!(im.pixels().all(|p| p[3] == 255));
}
#[test]
fn image_export_preserves_density_and_pixels() {
    let dir = tempfile::tempdir().unwrap();
    let im = RgbaImage::from_pixel(20, 10, Rgba([40, 120, 200, 255]));
    for ext in ["png", "jpg", "tiff", "webp"] {
        let path = dir.path().join(format!("input.{ext}"));
        let bytes = assets::encode_image(&path, im.clone(), 300.0).unwrap();
        fs::write(&path, bytes).unwrap();
        let asset = assets::load(&path).unwrap();
        assert!((asset.dpi - 300.0).abs() < 0.05, "{ext}: {}", asset.dpi);
    }
}
#[test]
fn png_alpha_is_retained() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("alpha.png");
    let image = RgbaImage::from_pixel(40, 30, Rgba([0, 255, 0, 128]));
    image.save(&path).unwrap();
    let (result, _) = Engine::default().image(&path, &[], None).unwrap();
    assert_eq!(result.get_pixel(20, 15).0, [0, 255, 0, 128]);
}
#[test]
fn transformed_source_fixed_page_dimensions() {
    let dir = tempfile::tempdir().unwrap();
    let path = svg(
        dir.path(),
        "page.svg",
        "96",
        "72",
        r#"<rect width="96" height="72" fill="black"/>"#,
    );
    let mut page = Page {
        path,
        transform: PageTransform::default(),
    };
    page.transform.scale = 0.5;
    page.transform.rotation = 90.0;
    let (im, points) = Engine::default()
        .compose(&page, None, &[], 96.0, None)
        .unwrap();
    assert_eq!((im.width(), im.height()), (96, 72));
    assert_eq!(points, (72.0, 54.0));
    assert_eq!(im.get_pixel(0, 0).0, [255, 255, 255, 255]);
    assert_eq!(im.get_pixel(48, 36).0, [0, 0, 0, 255]);
}
#[test]
fn excessive_margin_fails() {
    let dir = tempfile::tempdir().unwrap();
    let path = svg(dir.path(), "page.svg", "96", "72", "");
    let mut page = Page {
        path,
        transform: PageTransform::default(),
    };
    page.transform.margin_mm = 1000.0;
    assert!(
        Engine::default()
            .compose(&page, None, &[], 96.0, None)
            .is_err()
    );
}
#[test]
fn override_inheritance_independence_and_json_roundtrip() {
    let mut p = Project::default();
    p.layers.push(layer(PathBuf::from("shared.png")));
    p.background = Some(Background {
        path: "bg.png".into(),
        fit: Fit::Cover,
    });
    p.groups.push(Group::new("a".into()));
    p.groups.push(Group::new("b".into()));
    p.groups[0].layers = Some(p.layers.clone());
    p.groups[0].background = Some(None);
    p.layers[0].label = "changed".into();
    assert_eq!(p.layers_for(0)[0].label, "shared.png");
    assert_eq!(p.layers_for(1)[0].label, "changed");
    assert!(p.background_for(0).is_none());
    assert!(p.background_for(1).is_some());
    assert_eq!(
        p,
        serde_json::from_str(&serde_json::to_string(&p).unwrap()).unwrap()
    );
}
#[test]
fn grouped_exports_skip_empty_continue_errors_and_never_replace() {
    let dir = tempfile::tempdir().unwrap();
    let path = svg(
        dir.path(),
        "page.svg",
        "12pt",
        "9pt",
        r#"<rect width="96" height="72" fill="black"/>"#,
    );
    let input = fs::read(&path).unwrap();
    let mut p = Project::default();
    p.groups.push(Group::new("empty".into()));
    let mut good = Group::new("score".into());
    good.pages.push(Page {
        path: path.clone(),
        transform: PageTransform::default(),
    });
    p.groups.push(good.clone());
    let mut bad = good.clone();
    bad.name = "bad".into();
    bad.pages.push(Page {
        path: dir.path().join("missing.png"),
        transform: PageTransform::default(),
    });
    p.groups.push(bad);
    p.groups.push(good);
    let report = Engine::default()
        .groups(&p, dir.path(), Profile::Original, &cancel(), |_| {})
        .unwrap();
    assert_eq!(report.saved.len(), 2);
    assert_eq!(report.errors.len(), 1);
    assert!(dir.path().join("score.pdf").exists());
    assert!(dir.path().join("score (2).pdf").exists());
    assert!(!dir.path().join("bad.pdf").exists());
    assert!(!dir.path().join("empty.pdf").exists());
    assert_eq!(fs::read(path).unwrap(), input);
}
#[test]
fn preflight_rejects_duplicate_outputs_and_other_input_overwrite() {
    let dir = tempfile::tempdir().unwrap();
    let a = dir.path().join("a.png");
    let b = dir.path().join("a_copy.png");
    fs::write(&a, "a").unwrap();
    fs::write(&b, "b").unwrap();
    let mut batch = Batch::default();
    batch.inputs = vec![a.clone(), a.clone()];
    assert!(output::plan(&batch).is_err());
    batch.inputs = vec![a, b];
    batch.suffix = "_copy".into();
    assert!(output::plan(&batch).is_err());
    batch.suffix = "../escape".into();
    assert!(output::plan(&batch).is_err());
}
#[test]
fn overwrite_requires_opt_in_and_is_atomic() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("source.png");
    RgbaImage::from_pixel(20, 10, Rgba([0, 0, 255, 255]))
        .save(&path)
        .unwrap();
    let before = fs::read(&path).unwrap();
    let mut batch = Batch::default();
    batch.inputs = vec![path.clone()];
    batch.suffix = "".into();
    batch.layers = vec![layer(dir.path().join("missing.png"))];
    assert!(
        Engine::default()
            .batch(&batch, false, &cancel(), |_| {})
            .is_err()
    );
    let report = Engine::default()
        .batch(&batch, true, &cancel(), |_| {})
        .unwrap();
    assert_eq!(report.errors.len(), 1);
    assert_eq!(fs::read(&path).unwrap(), before);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}
#[test]
fn atomic_noclobber_and_replace() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("a");
    output::atomic_write(&p, b"old", false).unwrap();
    assert!(output::atomic_write(&p, b"new", false).is_err());
    assert_eq!(fs::read(&p).unwrap(), b"old");
    output::atomic_write(&p, b"new", true).unwrap();
    assert_eq!(fs::read(p).unwrap(), b"new");
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}
#[test]
fn concurrent_group_names_are_unique() {
    let dir = tempfile::tempdir().unwrap();
    let paths = std::thread::scope(|s| {
        let handles: Vec<_> = (0..8)
            .map(|_| s.spawn(|| output::publish_group(dir.path(), "same", b"pdf").unwrap()))
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .collect::<std::collections::HashSet<_>>()
    });
    assert_eq!(paths.len(), 8);
}
#[test]
fn safe_group_names() {
    assert!(output::group_name(&"악보".repeat(100)).len() <= 180);
    for name in ["../bad", "CON", "a/b", "..", "AUX.txt", "trailing. "] {
        let safe = output::group_name(name);
        assert!(!safe.contains('/') && !safe.contains('\\'));
        assert!(!safe.ends_with('.') && !safe.ends_with(' '));
        assert!(!safe.is_empty());
    }
    assert_eq!(output::group_name("CON"), "_CON");
}
#[test]
fn cancellation_publishes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("source.png");
    RgbaImage::new(2, 2).save(&path).unwrap();
    let batch = Batch {
        inputs: vec![path],
        ..Default::default()
    };
    let report = Engine::default()
        .batch(&batch, false, &AtomicBool::new(true), |_| {})
        .unwrap();
    assert!(report.cancelled);
    assert!(report.saved.is_empty());
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}
#[test]
fn cache_invalidates_modified_sources() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("source.png");
    RgbaImage::from_pixel(10, 10, Rgba([255, 0, 0, 255]))
        .save(&path)
        .unwrap();
    let mut e = Engine::default();
    let first = e.image(&path, &[], None).unwrap().0;
    RgbaImage::from_pixel(20, 10, Rgba([0, 0, 255, 255]))
        .save(&path)
        .unwrap();
    let second = e.image(&path, &[], None).unwrap().0;
    assert_ne!(first.width(), second.width());
    assert_eq!(second.get_pixel(1, 1).0, [0, 0, 255, 255]);
}
#[test]
fn batch_keeps_source_hash_and_continues_on_error() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("source.png");
    RgbaImage::from_pixel(50, 40, Rgba([255, 255, 255, 255]))
        .save(&path)
        .unwrap();
    let hash = Sha256::digest(fs::read(&path).unwrap());
    let broken = dir.path().join("broken.png");
    fs::write(&broken, "broken").unwrap();
    let batch = Batch {
        inputs: vec![path.clone(), broken],
        layers: vec![layer(red(dir.path()))],
        ..Default::default()
    };
    let report = Engine::default()
        .batch(&batch, false, &cancel(), |_| {})
        .unwrap();
    assert_eq!(report.saved.len(), 1);
    assert_eq!(report.errors.len(), 1);
    assert_eq!(Sha256::digest(fs::read(&path).unwrap()), hash);
}
#[test]
fn history_branches_and_editors_are_independent() {
    let mut a = 0;
    let mut b = 0;
    let mut ha = History::default();
    let mut hb = History::default();
    ha.record(a, &1);
    a = 1;
    hb.record(b, &2);
    b = 2;
    ha.undo(&mut a);
    assert_eq!((a, b), (0, 2));
    ha.redo(&mut a);
    assert_eq!(a, 1);
    ha.undo(&mut a);
    ha.record(a, &3);
    a = 3;
    ha.redo(&mut a);
    assert_eq!(a, 3);
    hb.undo(&mut b);
    assert_eq!(b, 0);
}
#[test]
fn cli_runs_real_batch() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("source.png");
    RgbaImage::from_pixel(20, 20, Rgba([255, 255, 255, 255]))
        .save(&path)
        .unwrap();
    let mark = red(dir.path());
    let result = std::process::Command::new(env!("CARGO_BIN_EXE_watermark-cli"))
        .arg("watermark")
        .arg(&path)
        .arg("--watermark")
        .arg(mark)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(dir.path().join("source_watermarked.png").exists());
}
