use batch_watermarker::{engine::Engine, model::*, pdf};
use std::{fs, path::PathBuf, sync::atomic::AtomicBool, time::Instant};

fn main() -> anyhow::Result<()> {
    let folder = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| "tmp/rust-benchmark".into());
    fs::create_dir_all(&folder)?;
    let path = folder.join("score.svg");
    let mut body = String::new();
    for y in 0..32 {
        for line in 0..5 {
            body.push_str(&format!(
                r#"<path d="M30 {}H760" stroke="black" stroke-width="1"/>"#,
                40 + y * 32 + line * 4
            ));
        }
        for x in 0..12 {
            body.push_str(&format!(
                r#"<ellipse cx="{}" cy="{}" rx="5" ry="3"/><path d="M{} {}v-24" stroke="black"/>"#,
                55 + x * 58,
                47 + y * 32,
                60 + x * 58,
                47 + y * 32
            ));
        }
    }
    fs::write(
        &path,
        format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 794 1123">{body}</svg>"#
        ),
    )?;
    let mark = folder.join("mark.png");
    image::RgbaImage::from_pixel(320, 100, image::Rgba([42, 87, 208, 120])).save(&mark)?;
    let page = Page {
        path: path.clone(),
        transform: PageTransform::default(),
    };
    let layers = vec![Layer::new(mark)];
    let mut engine = Engine::default();
    let start = Instant::now();
    let first = engine.compose(&page, None, &layers, 96.0, Some(1400))?.0;
    let cold = start.elapsed().as_secs_f64() * 1000.0;
    let start = Instant::now();
    for _ in 0..20 {
        let im = engine.compose(&page, None, &layers, 96.0, Some(1400))?.0;
        assert_eq!(im, first);
    }
    let warm = start.elapsed().as_secs_f64() * 1000.0 / 20.0;
    let mut profiles = vec![];
    for profile in Profile::ALL {
        let start = Instant::now();
        let (image, points) = engine.compose(&page, None, &layers, profile.dpi() as f64, None)?;
        let dimensions = (image.width(), image.height());
        let mut pdf = pdf::RasterPdf::new();
        pdf.push(&image, points, profile)?;
        let bytes = pdf.finish()?;
        let elapsed = start.elapsed().as_secs_f64() * 1000.0;
        fs::write(folder.join(format!("{profile:?}.pdf")), &bytes)?;
        profiles.push(serde_json::json!({"profile":profile,"dpi":profile.dpi(),"pixels":dimensions,"bytes":bytes.len(),"milliseconds":elapsed}));
    }
    let mut project = Project::default();
    let mut group = Group::new("Pipeline smoke".into());
    group.pages.push(page);
    project.groups.push(group);
    let report = engine.groups(
        &project,
        &folder,
        Profile::Distribution,
        &AtomicBool::new(false),
        |_| {},
    )?;
    assert!(report.errors.is_empty());
    let summary = serde_json::json!({"cold_preview_ms":cold,"cached_preview_ms":warm,"preview_speedup":cold/warm,"asset_cache_hits":engine.assets.hits,"asset_cache_misses":engine.assets.misses,"profiles":profiles});
    fs::write(
        folder.join("report.json"),
        serde_json::to_vec_pretty(&summary)?,
    )?;
    println!("{}", serde_json::to_string_pretty(&summary)?);
    Ok(())
}
