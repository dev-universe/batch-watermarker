#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use batch_watermarker::ui::Workbench;

fn main() -> eframe::Result {
    let icon = image::load_from_memory(include_bytes!("../assets/icon.png"))
        .ok()
        .map(|image| {
            let rgba = image.to_rgba8();
            eframe::egui::IconData {
                width: rgba.width(),
                height: rgba.height(),
                rgba: rgba.into_raw(),
            }
        });
    let mut viewport = eframe::egui::ViewportBuilder::default()
        .with_inner_size([1400.0, 900.0])
        .with_min_inner_size([1000.0, 650.0]);
    if let Some(icon) = icon {
        viewport = viewport.with_icon(icon);
    }
    let options = eframe::NativeOptions {
        viewport,
        renderer: eframe::Renderer::Glow,
        ..Default::default()
    };
    eframe::run_native(
        "Batch Watermarker",
        options,
        Box::new(|cc| Ok(Box::new(Workbench::new(cc)))),
    )
}
