use crate::{
    assets,
    engine::{Engine, Progress, Report},
    model::*,
    output,
};
use eframe::egui::{self, Color32, Pos2, Rect, Sense, Stroke, Vec2};
use std::{
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    thread,
    time::Duration,
};

const BLUE: Color32 = Color32::from_rgb(42, 87, 208);
#[derive(Clone, PartialEq, serde::Serialize)]
enum PreviewRequest {
    Batch {
        path: PathBuf,
        page: usize,
        layers: Vec<Layer>,
    },
    Group {
        page: Page,
        background: Option<Background>,
        layers: Vec<Layer>,
    },
}
struct PreviewResult {
    generation: u64,
    result: Result<(image::RgbaImage, usize, (f64, f64)), String>,
}
enum ExportEvent {
    Progress(Progress),
    Done(Result<Report, String>),
}
#[derive(Clone, Copy)]
enum DragKind {
    Move,
    Resize(i32, i32),
    Rotate,
}
struct Drag {
    kind: DragKind,
    start: Placement,
    pointer: Pos2,
    before_batch: Batch,
    before_project: Project,
}

pub struct Workbench {
    batch: Batch,
    project: Project,
    tab: usize,
    input: usize,
    group: usize,
    page: usize,
    pdf_page: usize,
    selected: Option<usize>,
    source_selected: bool,
    batch_history: History<Batch>,
    project_history: History<Project>,
    gesture: Option<(Batch, Project)>,
    drag: Option<Drag>,
    group_profile: Profile,
    group_output: Option<PathBuf>,
    texture: Option<egui::TextureHandle>,
    page_count: usize,
    points: (f64, f64),
    preview_size: (u32, u32),
    preview_request: Arc<Mutex<Option<(u64, PreviewRequest)>>>,
    preview_wake: mpsc::SyncSender<()>,
    preview_rx: mpsc::Receiver<PreviewResult>,
    generation: Arc<AtomicU64>,
    last_preview: Option<PreviewRequest>,
    preview_pending: bool,
    export_rx: Option<mpsc::Receiver<ExportEvent>>,
    cancel: Arc<AtomicBool>,
    progress: Option<Progress>,
    report: Option<Report>,
    error: Option<String>,
    confirm: Vec<PathBuf>,
    help: bool,
    history_travel: bool,
    settings_rect: Rect,
}
impl Workbench {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        let mut app = Self::from_context(&cc.egui_ctx);
        app.add_inputs(std::env::args_os().skip(1).map(PathBuf::from).collect());
        app
    }
    fn from_context(ctx: &egui::Context) -> Self {
        let mut style = (*ctx.style()).clone();
        style.visuals = egui::Visuals::light();
        style.visuals.panel_fill = Color32::from_rgb(243, 245, 248);
        style.visuals.window_fill = Color32::from_rgb(250, 251, 253);
        style.visuals.selection.bg_fill = BLUE;
        style.visuals.selection.stroke.color = Color32::WHITE;
        style.visuals.widgets.active.bg_fill = BLUE;
        style.spacing.item_spacing = Vec2::new(8.0, 8.0);
        style.spacing.button_padding = Vec2::new(10.0, 7.0);
        for widget in [
            &mut style.visuals.widgets.inactive,
            &mut style.visuals.widgets.hovered,
            &mut style.visuals.widgets.active,
        ] {
            widget.corner_radius = egui::CornerRadius::same(2);
        }
        ctx.set_style(style);
        let mut fonts = egui::FontDefinitions::default();
        let candidates: Vec<PathBuf> = if cfg!(windows) {
            vec![PathBuf::from("C:/Windows/Fonts/malgun.ttf")]
        } else if cfg!(target_os = "macos") {
            vec![PathBuf::from("/System/Library/Fonts/AppleSDGothicNeo.ttc")]
        } else {
            vec![PathBuf::from(
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            )]
        };
        for path in candidates {
            if let Ok(bytes) = std::fs::read(path) {
                fonts
                    .font_data
                    .insert("korean".into(), egui::FontData::from_owned(bytes).into());
                fonts
                    .families
                    .get_mut(&egui::FontFamily::Proportional)
                    .unwrap()
                    .push("korean".into());
                break;
            }
        }
        ctx.set_fonts(fonts);
        let pending: Arc<Mutex<Option<(u64, PreviewRequest)>>> = Arc::new(Mutex::new(None));
        let generation = Arc::new(AtomicU64::new(0));
        let (tx, rx) = mpsc::channel();
        let (wake_tx, wake_rx) = mpsc::sync_channel(1);
        let worker_pending = pending.clone();
        let worker_generation = generation.clone();
        let worker_ctx = ctx.clone();
        thread::spawn(move || {
            let mut engine = Engine::default();
            while wake_rx.recv().is_ok() {
                let request = worker_pending.lock().unwrap().take();
                if let Some((id, request)) = request {
                    let result =
                        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| match request {
                            PreviewRequest::Batch { path, page, layers } => {
                                if assets::is_pdf(&path) {
                                    engine.preview_pdf(&path, page, &layers, 1400)
                                } else {
                                    engine.image(&path, &layers, Some(1400)).map(|(im, dpi)| {
                                        let pts = (
                                            im.width() as f64 * 72.0 / dpi,
                                            im.height() as f64 * 72.0 / dpi,
                                        );
                                        (im, 1, pts)
                                    })
                                }
                            }
                            PreviewRequest::Group {
                                page,
                                background,
                                layers,
                            } => engine
                                .compose(&page, background.as_ref(), &layers, 96.0, Some(1400))
                                .map(|(im, pts)| (im, 1, pts)),
                        }))
                        .map_err(|_| "미리보기 렌더러가 이 문서를 처리하지 못했습니다.".to_string())
                        .and_then(|r| r.map_err(|e| format!("{e:#}")));
                    if id == worker_generation.load(Ordering::Relaxed) {
                        if tx
                            .send(PreviewResult {
                                generation: id,
                                result,
                            })
                            .is_err()
                        {
                            break;
                        }
                        worker_ctx.request_repaint();
                    }
                }
            }
        });
        let mut project = Project::default();
        project.groups.push(Group::new("그룹 1".into()));
        Self {
            batch: Batch::default(),
            project,
            tab: 0,
            input: 0,
            group: 0,
            page: 0,
            pdf_page: 0,
            selected: None,
            source_selected: false,
            batch_history: History::default(),
            project_history: History::default(),
            gesture: None,
            drag: None,
            group_profile: Profile::default(),
            group_output: None,
            texture: None,
            page_count: 1,
            points: (1.0, 1.0),
            preview_size: (1, 1),
            preview_request: pending,
            preview_wake: wake_tx,
            preview_rx: rx,
            generation,
            last_preview: None,
            preview_pending: false,
            export_rx: None,
            cancel: Arc::new(AtomicBool::new(false)),
            progress: None,
            report: None,
            error: None,
            confirm: vec![],
            help: false,
            history_travel: false,
            settings_rect: Rect::NOTHING,
        }
    }
    fn active_layers(&self) -> &[Layer] {
        if self.tab == 0 {
            &self.batch.layers
        } else {
            self.project.layers_for(self.group)
        }
    }
    fn active_layers_mut(&mut self) -> &mut Vec<Layer> {
        if self.tab == 0 {
            &mut self.batch.layers
        } else {
            let group = &mut self.project.groups[self.group];
            if let Some(layers) = &mut group.layers {
                layers
            } else {
                &mut self.project.layers
            }
        }
    }
    fn add_inputs(&mut self, mut paths: Vec<PathBuf>) {
        paths.sort_by(|a, b| natord::compare(&file_name(a), &file_name(b)));
        for path in paths {
            if !assets::supported(&path, self.tab == 0) || !path.is_file() {
                self.error = Some(format!("지원하지 않는 파일: {}", path.display()));
                continue;
            }
            if self.tab == 0 {
                if !self.batch.inputs.contains(&path) {
                    self.batch.inputs.push(path);
                }
            } else {
                self.project.groups[self.group].pages.push(Page {
                    path,
                    transform: PageTransform::default(),
                });
            }
        }
    }
    fn pick_inputs(&mut self) {
        if let Some(paths) = rfd::FileDialog::new()
            .add_filter(
                "문서와 이미지",
                if self.tab == 0 {
                    &["pdf", "png", "jpg", "jpeg", "webp", "tif", "tiff", "svg"][..]
                } else {
                    &["png", "jpg", "jpeg", "webp", "tif", "tiff", "svg"][..]
                },
            )
            .pick_files()
        {
            self.add_inputs(paths);
        }
    }
    fn pick_layers(&mut self) {
        if let Some(paths) = rfd::FileDialog::new()
            .add_filter(
                "워터마크 이미지",
                &["svg", "png", "jpg", "jpeg", "webp", "tif", "tiff"],
            )
            .pick_files()
        {
            for path in paths {
                self.active_layers_mut().push(Layer::new(path));
            }
            self.selected = self.active_layers().len().checked_sub(1);
            self.source_selected = false;
        }
    }
    fn undo(&mut self) {
        self.commit_gesture();
        let profile = self.batch.profile;
        if self.tab == 0 {
            self.batch_history.undo(&mut self.batch)
        } else {
            self.project_history.undo(&mut self.project)
        }
        self.batch.profile = profile;
        self.selected = None;
        self.source_selected = false;
        self.history_travel = true;
    }
    fn redo(&mut self) {
        self.commit_gesture();
        let profile = self.batch.profile;
        if self.tab == 0 {
            self.batch_history.redo(&mut self.batch)
        } else {
            self.project_history.redo(&mut self.project)
        }
        self.batch.profile = profile;
        self.selected = None;
        self.source_selected = false;
        self.history_travel = true;
    }
    fn commit_gesture(&mut self) {
        if let Some((batch, project)) = self.gesture.take() {
            self.record_batch(batch);
            self.project_history.record(project, &self.project);
        }
    }
    fn record_batch(&mut self, mut before: Batch) {
        // Save profiles configure future exports and are independent of editing history.
        before.profile = self.batch.profile;
        self.batch_history.record(before, &self.batch);
    }
    fn clamp_selection(&mut self) {
        self.group = self.group.min(self.project.groups.len().saturating_sub(1));
        self.page = self.page.min(
            self.project.groups[self.group]
                .pages
                .len()
                .saturating_sub(1),
        );
        self.input = self.input.min(self.batch.inputs.len().saturating_sub(1));
        if self
            .selected
            .is_some_and(|i| i >= self.active_layers().len())
        {
            self.selected = None;
        }
    }
    fn request_preview(&mut self) {
        let request = if self.tab == 0 {
            self.batch
                .inputs
                .get(self.input)
                .map(|path| PreviewRequest::Batch {
                    path: path.clone(),
                    page: self.pdf_page,
                    layers: self.batch.layers.clone(),
                })
        } else {
            self.project.groups[self.group]
                .pages
                .get(self.page)
                .map(|page| PreviewRequest::Group {
                    page: page.clone(),
                    background: self.project.background_for(self.group).cloned(),
                    layers: self.project.layers_for(self.group).to_vec(),
                })
        };
        if request != self.last_preview {
            let id = self.generation.fetch_add(1, Ordering::Relaxed) + 1;
            self.preview_pending = request.is_some();
            if let Some(request) = request.clone() {
                *self.preview_request.lock().unwrap() = Some((id, request));
                let _ = self.preview_wake.try_send(());
            } else {
                self.texture = None;
            }
            self.last_preview = request;
        }
    }
    fn receive(&mut self, ctx: &egui::Context) {
        while let Ok(event) = self.preview_rx.try_recv() {
            if event.generation == self.generation.load(Ordering::Relaxed) {
                self.preview_pending = false;
                match event.result {
                    Ok((image, count, points)) => {
                        self.preview_size = (image.width(), image.height());
                        self.points = points;
                        self.page_count = count;
                        let color = egui::ColorImage::from_rgba_unmultiplied(
                            [image.width() as usize, image.height() as usize],
                            image.as_raw(),
                        );
                        if let Some(tex) = &mut self.texture {
                            tex.set(color, egui::TextureOptions::LINEAR);
                        } else {
                            self.texture = Some(ctx.load_texture(
                                "document",
                                color,
                                egui::TextureOptions::LINEAR,
                            ));
                        }
                    }
                    Err(error) => {
                        self.error = Some(error);
                        self.texture = None;
                    }
                }
            }
        }
        let mut finished = None;
        if let Some(rx) = &self.export_rx {
            while let Ok(event) = rx.try_recv() {
                match event {
                    ExportEvent::Progress(p) => self.progress = Some(p),
                    ExportEvent::Done(r) => finished = Some(r),
                }
            }
        }
        if let Some(result) = finished {
            self.export_rx = None;
            self.progress = None;
            match result {
                Ok(report) => self.report = Some(report),
                Err(error) => self.error = Some(error),
            }
        }
    }
    fn start_export(&mut self, replace: bool, ctx: &egui::Context) {
        if self.export_rx.is_some() {
            return;
        }
        if self.tab == 0 {
            match output::plan(&self.batch) {
                Ok(paths) => {
                    let exists: Vec<_> = paths.into_iter().filter(|p| p.exists()).collect();
                    if !replace && !exists.is_empty() {
                        self.confirm = exists;
                        return;
                    }
                }
                Err(e) => {
                    self.error = Some(format!("{e:#}"));
                    return;
                }
            }
        } else if self.group_output.is_none() {
            self.error = Some("출력 폴더를 선택하세요.".into());
            return;
        }
        let batch = self.batch.clone();
        let project = self.project.clone();
        let folder = self.group_output.clone();
        let profile = self.group_profile;
        let tab = self.tab;
        let (tx, rx) = mpsc::channel();
        self.export_rx = Some(rx);
        self.cancel = Arc::new(AtomicBool::new(false));
        let cancel = self.cancel.clone();
        let ctx = ctx.clone();
        thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let mut engine = Engine::default();
                let progress = |p| {
                    let _ = tx.send(ExportEvent::Progress(p));
                    ctx.request_repaint();
                };
                if tab == 0 {
                    engine.batch(&batch, replace, &cancel, progress)
                } else {
                    engine.groups(
                        &project,
                        folder.as_deref().unwrap(),
                        profile,
                        &cancel,
                        progress,
                    )
                }
            }))
            .map_err(|_| "처리 엔진이 이 문서를 처리하지 못했습니다.".to_string())
            .and_then(|r| r.map_err(|e| format!("{e:#}")));
            let _ = tx.send(ExportEvent::Done(result));
            ctx.request_repaint();
        });
    }
    fn sources(&mut self, ui: &mut egui::Ui) {
        ui.heading(if self.tab == 0 {
            "입력 파일"
        } else {
            "이미지 그룹"
        });
        ui.add_space(8.0);
        if self.tab == 1 {
            ui.horizontal(|ui| {
                if ui.button("+ 그룹").clicked() {
                    self.project.groups.push(Group::new(format!(
                        "그룹 {}",
                        self.project.groups.len() + 1
                    )));
                    self.group = self.project.groups.len() - 1;
                    self.page = 0;
                }
                if ui
                    .add_enabled(
                        self.project.groups.len() > 1,
                        egui::Button::new("그룹 삭제"),
                    )
                    .clicked()
                {
                    self.project.groups.remove(self.group);
                    self.clamp_selection();
                    self.selected = None;
                }
            });
            let mut switch = None;
            for (i, group) in self.project.groups.iter().enumerate() {
                if ui
                    .selectable_label(
                        self.group == i,
                        format!("{}  ·  {}p", group.name, group.pages.len()),
                    )
                    .clicked()
                {
                    switch = Some(i);
                }
            }
            if let Some(i) = switch {
                self.group = i;
                self.page = 0;
                self.selected = None;
                self.source_selected = false;
            }
            ui.text_edit_singleline(&mut self.project.groups[self.group].name);
            ui.separator();
        }
        ui.horizontal(|ui| {
            if ui.button("+ 파일 추가").clicked() {
                self.pick_inputs();
            }
            if ui.button("모두 비우기").clicked() {
                if self.tab == 0 {
                    self.batch.inputs.clear();
                    self.pdf_page = 0;
                } else {
                    self.project.groups[self.group].pages.clear();
                }
            }
        });
        ui.small("파일을 이 창으로 끌어 놓으세요.");
        let paths: Vec<_> = if self.tab == 0 {
            self.batch.inputs.clone()
        } else {
            self.project.groups[self.group]
                .pages
                .iter()
                .map(|p| p.path.clone())
                .collect()
        };
        let count = paths.len();
        ui.label(format!("{count}개 파일"));
        let mut remove = None;
        let mut reorder = None;
        egui::ScrollArea::vertical()
            .id_salt("files")
            .max_height(ui.available_height() - 65.0)
            .show(ui, |ui| {
                for (i, path) in paths.iter().enumerate() {
                    ui.horizontal(|ui| {
                        let current = if self.tab == 0 { self.input } else { self.page };
                        if ui
                            .add_sized(
                                [ui.available_width() - 30.0, 28.0],
                                egui::Button::new(format!("{}  {}", i + 1, file_name(path)))
                                    .selected(i == current)
                                    .truncate(),
                            )
                            .on_hover_text(path.display().to_string())
                            .clicked()
                        {
                            if self.tab == 0 {
                                self.input = i;
                                self.pdf_page = 0;
                            } else {
                                self.page = i;
                                self.source_selected = true;
                                self.selected = None;
                            }
                        }
                        if ui.small_button("×").on_hover_text("파일 제거").clicked() {
                            remove = Some(i);
                        }
                    });
                }
            });
        if let Some(i) = remove {
            if self.tab == 0 {
                self.batch.inputs.remove(i);
                self.pdf_page = 0;
            } else {
                self.project.groups[self.group].pages.remove(i);
            }
        }
        if self.tab == 1 && count > 0 {
            ui.horizontal(|ui| {
                if ui
                    .add_enabled(self.page > 0, egui::Button::new("위로"))
                    .clicked()
                {
                    reorder = Some(self.page - 1);
                }
                if ui
                    .add_enabled(self.page + 1 < count, egui::Button::new("아래로"))
                    .clicked()
                {
                    reorder = Some(self.page + 1);
                }
            });
            if let Some(i) = reorder {
                self.project.groups[self.group].pages.swap(self.page, i);
                self.page = i;
            }
            egui::ComboBox::from_id_salt("move_page")
                .selected_text("선택 페이지를 그룹으로 이동")
                .show_ui(ui, |ui| {
                    let mut dest = None;
                    for (i, g) in self.project.groups.iter().enumerate() {
                        if i != self.group && ui.button(&g.name).clicked() {
                            dest = Some(i);
                        }
                    }
                    if let Some(i) = dest {
                        let page = self.project.groups[self.group].pages.remove(self.page);
                        self.project.groups[i].pages.push(page);
                        ui.close();
                    }
                });
        }
    }
    fn settings(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) {
        egui::ScrollArea::vertical()
            .id_salt("settings")
            .show(ui, |ui| {
                ui.heading("워터마크");
                if self.tab == 1 {
                    let mut local = self.project.groups[self.group].layers.is_some();
                    if ui.checkbox(&mut local, "이 그룹만 워터마크 설정").changed() {
                        self.project.groups[self.group].layers = if local {
                            Some(self.project.layers_for(self.group).to_vec())
                        } else {
                            None
                        };
                        self.selected = None;
                    }
                }
                if ui.button("+ 워터마크 추가").clicked() {
                    self.pick_layers();
                }
                let mut remove = None;
                let mut swap = None;
                let mut duplicate = None;
                let selected = self.selected;
                for (i, layer) in self.active_layers_mut().iter_mut().enumerate() {
                    ui.horizontal(|ui| {
                        ui.checkbox(&mut layer.visible, "").on_hover_text("표시");
                        if ui
                            .selectable_label(selected == Some(i), &layer.label)
                            .clicked()
                        {
                            /* applied below via response */
                            ui.data_mut(|d| d.insert_temp(egui::Id::new("select_layer"), i));
                        }
                        ui.checkbox(&mut layer.locked, "잠금");
                    });
                }
                if let Some(i) =
                    ui.data_mut(|d| d.remove_temp::<usize>(egui::Id::new("select_layer")))
                {
                    self.selected = Some(i);
                    self.source_selected = false;
                }
                if let Some(i) = self.selected {
                    let len = self.active_layers().len();
                    if i < len {
                        ui.horizontal(|ui| {
                            if ui.button("복제").clicked() {
                                duplicate = Some(i);
                            }
                            if ui.button("삭제").clicked() {
                                remove = Some(i);
                            }
                            if ui.add_enabled(i > 0, egui::Button::new("아래")).clicked() {
                                swap = Some((i, i - 1));
                            }
                            if ui
                                .add_enabled(i + 1 < len, egui::Button::new("위"))
                                .clicked()
                            {
                                swap = Some((i, i + 1));
                            }
                        });
                        let layer = &mut self.active_layers_mut()[i];
                        ui.text_edit_singleline(&mut layer.label);
                        ui.add_enabled_ui(!layer.locked, |ui| {
                            placement_controls(ui, &mut layer.placement)
                        });
                    }
                }
                if let Some(i) = duplicate {
                    let mut layer = self.active_layers()[i].clone();
                    layer.label.push_str(" 복사");
                    self.active_layers_mut().insert(i + 1, layer);
                    self.selected = Some(i + 1);
                }
                if let Some(i) = remove {
                    self.active_layers_mut().remove(i);
                    self.selected = None;
                }
                if let Some((i, j)) = swap {
                    self.active_layers_mut().swap(i, j);
                    self.selected = Some(j);
                }
                if self.tab == 1 {
                    ui.separator();
                    ui.heading("배경 이미지");
                    let mut local = self.project.groups[self.group].background.is_some();
                    if ui.checkbox(&mut local, "이 그룹만 배경 설정").changed() {
                        self.project.groups[self.group].background = if local {
                            Some(self.project.background_for(self.group).cloned())
                        } else {
                            None
                        };
                    }
                    let mut bg = self.project.background_for(self.group).cloned();
                    ui.horizontal(|ui| {
                        if ui.button("배경 선택").clicked()
                            && let Some(path) = rfd::FileDialog::new()
                                .add_filter(
                                    "이미지",
                                    &["svg", "png", "jpg", "jpeg", "webp", "tif", "tiff"],
                                )
                                .pick_file()
                        {
                            bg = Some(Background {
                                path,
                                fit: Fit::Cover,
                            });
                        }
                        if ui.button("제거").clicked() {
                            bg = None;
                        }
                    });
                    if let Some(background) = &mut bg {
                        ui.label(file_name(&background.path));
                        ui.horizontal(|ui| {
                            ui.radio_value(&mut background.fit, Fit::Cover, "채우기");
                            ui.radio_value(&mut background.fit, Fit::Contain, "맞추기");
                        });
                    }
                    if local {
                        self.project.groups[self.group].background = Some(bg);
                    } else {
                        self.project.background = bg;
                    }
                    if let Some(page) = self.project.groups[self.group].pages.get_mut(self.page) {
                        ui.separator();
                        ui.heading("원본 이미지 배치");
                        if ui
                            .selectable_label(self.source_selected, "원본 이미지 선택")
                            .clicked()
                        {
                            self.source_selected = true;
                            self.selected = None;
                        }
                        ui.add(
                            egui::Slider::new(&mut page.transform.scale, 0.05..=3.0).text("배율"),
                        );
                        ui.add(
                            egui::Slider::new(&mut page.transform.margin_mm, 0.0..=50.0)
                                .text("여백 mm"),
                        );
                        numeric(ui, "X 위치", &mut page.transform.x, 0.01);
                        numeric(ui, "Y 위치", &mut page.transform.y, 0.01);
                        numeric(ui, "회전 °", &mut page.transform.rotation, 1.0);
                        if ui.button("원본 배치 초기화").clicked() {
                            page.transform = PageTransform::default();
                        }
                    }
                }
                ui.separator();
                ui.heading("내보내기");
                let output = if self.tab == 0 {
                    &mut self.batch.output
                } else {
                    &mut self.group_output
                };
                ui.horizontal(|ui| {
                    if ui.button("출력 폴더 선택").clicked()
                        && let Some(path) = rfd::FileDialog::new().pick_folder()
                    {
                        *output = Some(path);
                    }
                    if ui.button("초기화").clicked() {
                        *output = None;
                    }
                });
                ui.small(
                    output
                        .as_ref()
                        .map(|p| p.display().to_string())
                        .unwrap_or_else(|| {
                            if self.tab == 0 {
                                "원본 파일 옆에 저장".into()
                            } else {
                                "출력 폴더를 선택하세요".into()
                            }
                        }),
                );
                if self.tab == 0 {
                    ui.label("파일명 접미사");
                    ui.text_edit_singleline(&mut self.batch.suffix);
                    ui.checkbox(&mut self.batch.flatten, "PDF를 이미지 전용 PDF로 저장");
                    if self.batch.flatten {
                        profile_controls(ui, &mut self.batch.profile);
                    } else {
                        ui.small("PDF의 텍스트와 벡터를 유지합니다.");
                    }
                } else {
                    profile_controls(ui, &mut self.group_profile);
                    ui.small("비어 있지 않은 그룹마다 PDF를 저장합니다.");
                }
                ui.add_space(8.0);
                let can_export = if self.tab == 0 {
                    !self.batch.inputs.is_empty() && self.batch.layers.iter().any(|l| l.visible)
                } else {
                    self.project.groups.iter().any(|g| !g.pages.is_empty())
                        && self.group_output.is_some()
                };
                if ui
                    .add_enabled(
                        can_export && self.export_rx.is_none(),
                        egui::Button::new(
                            egui::RichText::new(if self.tab == 0 {
                                "워터마크 적용 및 저장"
                            } else {
                                "그룹별 PDF 저장"
                            })
                            .color(Color32::WHITE),
                        )
                        .fill(BLUE),
                    )
                    .clicked()
                {
                    self.start_export(false, ctx);
                }
                if let Some(p) = &self.progress {
                    ui.add(
                        egui::ProgressBar::new(p.completed as f32 / p.total.max(1) as f32)
                            .text(&p.label),
                    );
                    if ui.button("작업 취소").clicked() {
                        self.cancel.store(true, Ordering::Relaxed);
                    }
                }
            });
    }
    fn canvas(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            ui.strong("문서 미리보기");
            if self.preview_pending {
                ui.spinner();
            }
            if self.tab == 0
                && self
                    .batch
                    .inputs
                    .get(self.input)
                    .is_some_and(|p| assets::is_pdf(p))
            {
                if ui
                    .add_enabled(self.pdf_page > 0, egui::Button::new("이전"))
                    .clicked()
                {
                    self.pdf_page -= 1;
                }
                ui.label(format!("{} / {}", self.pdf_page + 1, self.page_count));
                if ui
                    .add_enabled(
                        self.pdf_page + 1 < self.page_count,
                        egui::Button::new("다음"),
                    )
                    .clicked()
                {
                    self.pdf_page += 1;
                }
            }
        });
        ui.separator();
        let available = ui.available_rect_before_wrap().shrink(28.0);
        if let Some(texture) = &self.texture {
            let size = Vec2::new(self.preview_size.0 as f32, self.preview_size.1 as f32);
            let scale = (available.width() / size.x).min(available.height() / size.y);
            let rect = Rect::from_center_size(available.center(), size * scale);
            let painter = ui.painter().with_clip_rect(available);
            painter.rect_filled(rect.expand(1.0), 0.0, Color32::from_gray(190));
            painter.image(
                texture.id(),
                rect,
                Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
                Color32::WHITE,
            );
            let response = ui.interact(
                rect.expand(30.0).intersect(available),
                ui.id().with("canvas"),
                Sense::click_and_drag(),
            );
            self.manipulate(ui, &response, rect);
        } else {
            ui.scope_builder(egui::UiBuilder::new().max_rect(available), |ui| {
                ui.centered_and_justified(|ui| {
                    ui.label("PDF 또는 이미지를 추가하면 여기에 표시됩니다.");
                });
            });
        }
    }
    fn manipulate(&mut self, ui: &egui::Ui, response: &egui::Response, rect: Rect) {
        let pointer = response.interact_pointer_pos();
        let hit_pointer = if response.drag_started() {
            ui.input(|i| i.pointer.press_origin())
        } else {
            pointer
        };
        let mut active = self.selected.and_then(|i| {
            self.active_layers()
                .get(i)
                .map(|l| (l.placement.clone(), l.path.clone(), l.locked))
        });
        if self.source_selected
            && self.tab == 1
            && let Some(page) = self.project.groups[self.group].pages.get(self.page)
        {
            let t = &page.transform;
            let margin = (1.0 - t.margin_mm * 72.0 / 25.4 / self.points.0 * 2.0)
                .min(1.0 - t.margin_mm * 72.0 / 25.4 / self.points.1 * 2.0)
                .max(0.01);
            active = Some((
                Placement {
                    x: 0.5 + t.x,
                    y: 0.5 + t.y,
                    width: Some(t.scale * margin),
                    height: Some(t.scale * margin),
                    rotation: t.rotation,
                    ..Default::default()
                },
                page.path.clone(),
                false,
            ));
        }
        // Pixel sizes are cached by the preview worker; the UI reads only image headers on selection.
        let source_size = active
            .as_ref()
            .map(|(_, path, _)| image_size_hint(path))
            .unwrap_or((1.0, 1.0));
        let mut kind = DragKind::Move;
        if let Some((p, _, locked)) = &active {
            let (w, h) = p.size_on(source_size, (rect.width() as f64, rect.height() as f64));
            let center = Pos2::new(
                rect.left() + rect.width() * p.x as f32,
                rect.top() + rect.height() * p.y as f32,
            );
            let rot = egui::emath::Rot2::from_angle(p.rotation.to_radians() as f32);
            let point =
                |x: f32, y: f32| center + rot * Vec2::new(x * w as f32 / 2.0, y * h as f32 / 2.0);
            let corners = [
                point(-1.0, -1.0),
                point(1.0, -1.0),
                point(1.0, 1.0),
                point(-1.0, 1.0),
            ];
            let painter = ui.painter().with_clip_rect(rect.expand(50.0));
            for i in 0..4 {
                painter.line_segment(
                    [corners[i], corners[(i + 1) % 4]],
                    Stroke::new(1.5_f32, BLUE),
                );
            }
            if !locked {
                for (x, y) in [
                    (-1, -1),
                    (0, -1),
                    (1, -1),
                    (1, 0),
                    (1, 1),
                    (0, 1),
                    (-1, 1),
                    (-1, 0),
                ] {
                    let pos = point(x as f32, y as f32);
                    painter.rect_filled(Rect::from_center_size(pos, Vec2::splat(7.0)), 1.0, BLUE);
                    if hit_pointer.is_some_and(|p| p.distance(pos) < 12.0) {
                        kind = DragKind::Resize(x, y);
                    }
                }
                let top = point(0.0, -1.0);
                let handle = top + rot * Vec2::new(0.0, -24.0);
                painter.line_segment([top, handle], Stroke::new(1.0_f32, BLUE));
                painter.circle_filled(handle, 5.0, BLUE);
                if hit_pointer.is_some_and(|p| p.distance(handle) < 12.0) {
                    kind = DragKind::Rotate;
                }
            }
        }
        if (response.clicked() || response.drag_started())
            && let Some(pos) = hit_pointer
        {
            if matches!(kind, DragKind::Move) {
                let found = self
                    .active_layers()
                    .iter()
                    .enumerate()
                    .rev()
                    .find(|(_, l)| {
                        if !l.visible {
                            return false;
                        }
                        let p = &l.placement;
                        let (w, h) = p.size_on(
                            image_size_hint(&l.path),
                            (rect.width() as f64, rect.height() as f64),
                        );
                        let local = egui::emath::Rot2::from_angle(-p.rotation.to_radians() as f32)
                            * (pos
                                - Pos2::new(
                                    rect.left() + p.x as f32 * rect.width(),
                                    rect.top() + p.y as f32 * rect.height(),
                                ));
                        local.x.abs() <= w as f32 / 2.0 && local.y.abs() <= h as f32 / 2.0
                    })
                    .map(|(i, _)| i);
                if found.is_some() {
                    self.selected = found;
                    self.source_selected = false;
                    active = self.selected.map(|i| {
                        let l = &self.active_layers()[i];
                        (l.placement.clone(), l.path.clone(), l.locked)
                    });
                } else if !self.source_selected {
                    self.selected = None;
                    active = None;
                }
            }
            if response.drag_started()
                && let Some((p, _, false)) = active
            {
                self.drag = Some(Drag {
                    kind,
                    start: p,
                    pointer: pos,
                    before_batch: self.batch.clone(),
                    before_project: self.project.clone(),
                });
            }
        }
        if response.dragged()
            && let (Some(drag), Some(pos)) = (&self.drag, pointer)
        {
            let mut p = drag.start.clone();
            let delta = pos - drag.pointer;
            match drag.kind {
                DragKind::Move => {
                    p.x += delta.x as f64 / rect.width() as f64;
                    p.y += delta.y as f64 / rect.height() as f64;
                    p.snap(0.012);
                }
                DragKind::Rotate => {
                    let center = Pos2::new(
                        rect.left() + p.x as f32 * rect.width(),
                        rect.top() + p.y as f32 * rect.height(),
                    );
                    let start = drag.pointer - center;
                    let now = pos - center;
                    p.rotation += (now.angle() - start.angle()).to_degrees() as f64;
                    if ui.input(|i| i.modifiers.shift) {
                        p.rotation = (p.rotation / 15.0).round() * 15.0;
                    }
                }
                DragKind::Resize(x, y) => {
                    let rot = egui::emath::Rot2::from_angle(-p.rotation.to_radians() as f32);
                    let local = rot * delta;
                    let (w, h) =
                        p.size_on(source_size, (rect.width() as f64, rect.height() as f64));
                    let mut nw = (w + local.x as f64 * x as f64).max(4.0);
                    let mut nh = (h + local.y as f64 * y as f64).max(4.0);
                    if x != 0 && y != 0 && ui.input(|i| i.modifiers.command) {
                        nh = nw * h / w;
                    }
                    if self.source_selected {
                        let ratio = (nw / w).max(nh / h);
                        nw = w * ratio;
                        nh = h * ratio;
                    }
                    let shift = rot.inverse()
                        * Vec2::new(
                            ((nw - w) * x as f64 / 2.0) as f32,
                            ((nh - h) * y as f64 / 2.0) as f32,
                        );
                    p.x += shift.x as f64 / rect.width() as f64;
                    p.y += shift.y as f64 / rect.height() as f64;
                    p.width = Some(nw / rect.width() as f64);
                    p.height = Some(nh / rect.height() as f64);
                }
            }
            if self.source_selected && self.tab == 1 {
                let t = &mut self.project.groups[self.group].pages[self.page].transform;
                t.x = p.x - 0.5;
                t.y = p.y - 0.5;
                t.rotation = p.rotation;
                if let Some(w) = p.width {
                    t.scale = drag.before_project.groups[self.group].pages[self.page]
                        .transform
                        .scale
                        * w
                        / drag.start.width.unwrap_or(w);
                }
            } else if let Some(i) = self.selected {
                self.active_layers_mut()[i].placement = p;
            }
        }
        if response.drag_stopped()
            && let Some(drag) = self.drag.take()
        {
            if self.tab == 0 {
                self.record_batch(drag.before_batch);
            } else {
                self.project_history
                    .record(drag.before_project, &self.project);
            }
            self.gesture = None;
        }
    }
    fn dialogs(&mut self, ctx: &egui::Context) {
        if !self.confirm.is_empty() {
            egui::Window::new("기존 파일 덮어쓰기 확인")
                .collapsible(false)
                .resizable(false)
                .show(ctx, |ui| {
                    ui.label(format!(
                        "{}개 기존 파일을 교체합니다. 원본 파일도 포함될 수 있습니다.",
                        self.confirm.len()
                    ));
                    egui::ScrollArea::vertical()
                        .max_height(180.0)
                        .show(ui, |ui| {
                            for path in &self.confirm {
                                ui.label(path.display().to_string());
                            }
                        });
                    ui.horizontal(|ui| {
                        if ui.button("취소").clicked() {
                            self.confirm.clear();
                        }
                        if ui.button("덮어쓰기 및 저장").clicked() {
                            self.confirm.clear();
                            self.start_export(true, ctx);
                        }
                    });
                });
        }
        if let Some(error) = self.error.clone() {
            egui::Window::new("처리 안내")
                .collapsible(false)
                .show(ctx, |ui| {
                    ui.label(error);
                    if ui.button("확인").clicked() {
                        self.error = None;
                    }
                });
        }
        if let Some(report) = self.report.clone() {
            egui::Window::new("내보내기 결과")
                .default_width(580.0)
                .show(ctx, |ui| {
                    ui.label(format!(
                        "{}개 저장 · {}개 오류{}",
                        report.saved.len(),
                        report.errors.len(),
                        if report.cancelled {
                            " · 취소됨"
                        } else {
                            ""
                        }
                    ));
                    egui::ScrollArea::vertical()
                        .max_height(350.0)
                        .show(ui, |ui| {
                            for item in &report.saved {
                                ui.label(format!("{} · {}p", item.path.display(), item.pages));
                            }
                            for error in &report.errors {
                                ui.colored_label(Color32::DARK_RED, error);
                            }
                        });
                    if ui.button("닫기").clicked() {
                        self.report = None;
                    }
                });
        }
    }
}
impl Workbench {
    fn show(&mut self, ctx: &egui::Context) {
        self.receive(ctx);
        self.clamp_selection();
        self.history_travel = false;
        let before_batch = self.batch.clone();
        let before_project = self.project.clone();
        if !ctx.wants_keyboard_input() {
            ctx.input_mut(|input| {
                if input.consume_key(egui::Modifiers::COMMAND, egui::Key::Z) {
                    self.undo();
                }
                if input.consume_key(
                    egui::Modifiers::COMMAND | egui::Modifiers::SHIFT,
                    egui::Key::Z,
                ) || input.consume_key(egui::Modifiers::CTRL, egui::Key::Y)
                {
                    self.redo();
                }
            });
            if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
                self.selected = None;
                self.source_selected = false;
            }
            let step = ctx.input(|i| if i.modifiers.shift { 10.0 } else { 1.0 });
            let delta = ctx.input(|i| {
                Vec2::new(
                    (i.key_pressed(egui::Key::ArrowRight) as i32
                        - i.key_pressed(egui::Key::ArrowLeft) as i32) as f32,
                    (i.key_pressed(egui::Key::ArrowDown) as i32
                        - i.key_pressed(egui::Key::ArrowUp) as i32) as f32,
                )
            }) * step;
            if delta != Vec2::ZERO {
                let (w, h) = if self.tab == 0 {
                    self.batch
                        .inputs
                        .get(self.input)
                        .filter(|p| !assets::is_pdf(p))
                        .map(|p| image_size_hint(p))
                        .unwrap_or((self.points.0 * 96.0 / 72.0, self.points.1 * 96.0 / 72.0))
                } else {
                    (self.points.0 * 96.0 / 72.0, self.points.1 * 96.0 / 72.0)
                };
                if let Some(i) = self.selected {
                    let layer = &mut self.active_layers_mut()[i];
                    if !layer.locked {
                        layer.placement.x += delta.x as f64 / w;
                        layer.placement.y += delta.y as f64 / h;
                    }
                } else if self.source_selected && self.tab == 1 {
                    let t = &mut self.project.groups[self.group].pages[self.page].transform;
                    t.x += delta.x as f64 / w;
                    t.y += delta.y as f64 / h;
                }
            }
        }
        let dropped = ctx.input(|i| {
            i.raw
                .dropped_files
                .iter()
                .filter_map(|f| f.path.clone())
                .collect::<Vec<_>>()
        });
        if !dropped.is_empty() {
            if ctx
                .pointer_hover_pos()
                .is_some_and(|p| self.settings_rect.contains(p))
            {
                for path in dropped {
                    if assets::supported(&path, false) {
                        self.active_layers_mut().push(Layer::new(path));
                    }
                }
                self.selected = self.active_layers().len().checked_sub(1);
                self.source_selected = false;
            } else {
                self.add_inputs(dropped);
            }
        }
        egui::TopBottomPanel::top("toolbar").show(ctx, |ui| {
            ui.add_space(5.0);
            ui.horizontal(|ui| {
                ui.heading("Batch Watermarker");
                ui.small(format!("v{} · Rust", env!("CARGO_PKG_VERSION")));
                ui.separator();
                let old = self.tab;
                ui.selectable_value(&mut self.tab, 0, "워터마크 편집");
                ui.selectable_value(&mut self.tab, 1, "투명 이미지 편집");
                if self.tab != old {
                    self.selected = None;
                    self.source_selected = false;
                    self.texture = None;
                }
                ui.separator();
                if ui.button("실행 취소").clicked() {
                    self.undo();
                }
                if ui.button("다시 실행").clicked() {
                    self.redo();
                }
                ui.toggle_value(&mut self.help, "도움말");
            });
            ui.add_space(5.0);
        });
        egui::TopBottomPanel::bottom("status").show(ctx,|ui|{ui.horizontal(|ui|{ui.small(if self.export_rx.is_some(){"내보내는 중 — 완료된 파일부터 저장됩니다."}else{"로컬에서 처리 · 원본 유지 · Rust 네이티브"});if self.help{ui.small("드래그 이동 · 핸들 크기/회전 · Shift 회전 15° · Ctrl/Cmd 모서리 비율 고정 · 방향키 이동 · Ctrl/Cmd+Z 실행 취소");}});});
        egui::SidePanel::left("sources")
            .default_width(260.0)
            .width_range(220.0..=400.0)
            .show(ctx, |ui| {
                self.sources(ui);
            });
        self.settings_rect = egui::SidePanel::right("settings")
            .default_width(320.0)
            .width_range(290.0..=420.0)
            .show(ctx, |ui| {
                self.settings(ui, ctx);
            })
            .response
            .rect;
        egui::CentralPanel::default()
            .frame(egui::Frame::central_panel(&ctx.style()).fill(Color32::from_rgb(225, 230, 237)))
            .show(ctx, |ui| {
                self.canvas(ui);
            });
        self.clamp_selection();
        // Group a continuous slider/text gesture into one undo entry.
        if self.drag.is_none() && !self.history_travel {
            let changed = before_batch != self.batch || before_project != self.project;
            let ongoing = ctx.input(|i| i.pointer.any_down()) || ctx.wants_keyboard_input();
            if changed && self.gesture.is_none() {
                self.gesture = Some((before_batch, before_project));
            }
            if !ongoing && let Some((batch, project)) = self.gesture.take() {
                self.record_batch(batch);
                self.project_history.record(project, &self.project);
            }
        }
        self.request_preview();
        self.dialogs(ctx);
        if self.export_rx.is_some() || self.preview_pending {
            ctx.request_repaint_after(Duration::from_millis(80));
        }
    }
}

impl eframe::App for Workbench {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.show(ctx);
    }
}

fn numeric(ui: &mut egui::Ui, label: &str, value: &mut f64, speed: f64) {
    ui.horizontal(|ui| {
        ui.label(label);
        ui.add(egui::DragValue::new(value).speed(speed));
    });
}
fn placement_controls(ui: &mut egui::Ui, p: &mut Placement) {
    ui.add(egui::Slider::new(&mut p.opacity, 0.0..=1.0).text("불투명도"));
    if ui
        .add(egui::Slider::new(&mut p.size, 0.01..=2.0).text("크기"))
        .changed()
    {
        p.width = None;
        p.height = None;
    }
    ui.checkbox(&mut p.preserve_aspect, "가로세로 비율 유지");
    numeric(ui, "회전 °", &mut p.rotation, 1.0);
    numeric(ui, "가로 위치", &mut p.x, 0.005);
    numeric(ui, "세로 위치", &mut p.y, 0.005);
    if p.width.is_some() || p.height.is_some() {
        let old = p.width.unwrap_or(p.size);
        let mut w = old;
        numeric(ui, "가로 비율", &mut w, 0.005);
        if w > 0.0 && w != old {
            if p.preserve_aspect {
                p.height = p.height.map(|h| h * w / old);
            }
            p.width = Some(w);
        }
        let mut h = p.height.unwrap_or(p.size);
        let old_h = h;
        numeric(ui, "세로 비율", &mut h, 0.005);
        if h > 0.0 && h != old_h {
            if p.preserve_aspect {
                p.width = p.width.map(|w| w * h / old_h);
            }
            p.height = Some(h);
        }
    }
    egui::Grid::new("anchors").show(ui, |ui| {
        for row in 0..3 {
            for col in 0..3 {
                if ui
                    .add_sized(
                        [55.0, 25.0],
                        egui::Button::new(
                            [
                                "좌상", "상단", "우상", "좌측", "중앙", "우측", "좌하", "하단",
                                "우하",
                            ][row * 3 + col],
                        ),
                    )
                    .clicked()
                {
                    p.x = [0.1, 0.5, 0.9][col];
                    p.y = [0.1, 0.5, 0.9][row];
                }
            }
            ui.end_row();
        }
    });
    if ui.button("배치 초기화").clicked() {
        *p = Placement::default();
    }
}
fn profile_controls(ui: &mut egui::Ui, profile: &mut Profile) {
    egui::ComboBox::from_id_salt("pdf_profile")
        .selected_text(profile.label())
        .show_ui(ui, |ui| {
            for p in Profile::ALL {
                ui.selectable_value(profile, p, p.label());
            }
        });
}
fn image_size_hint(path: &Path) -> (f64, f64) {
    // Cache dimensions in egui's UI thread without decoding raster pixels or loading system fonts per frame.
    thread_local! {static SIZES:std::cell::RefCell<std::collections::HashMap<PathBuf,(f64,f64)>>=std::cell::RefCell::new(std::collections::HashMap::new());}
    SIZES.with(|cache| {
        if let Some(size) = cache.borrow().get(path) {
            return *size;
        }
        let size = if path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("svg"))
        {
            assets::load(path).ok().map(|a| (a.width, a.height))
        } else {
            image::image_dimensions(path)
                .ok()
                .map(|(w, h)| (w as f64, h as f64))
        }
        .unwrap_or((1.0, 1.0));
        cache.borrow_mut().insert(path.to_owned(), size);
        size
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn pointer_frame(app: &mut Workbench, ctx: &egui::Context, events: Vec<egui::Event>) {
        let _ = ctx.run(
            egui::RawInput {
                screen_rect: Some(Rect::from_min_size(Pos2::ZERO, Vec2::splat(700.0))),
                events,
                ..Default::default()
            },
            |ctx| {
                egui::CentralPanel::default().show(ctx, |ui| {
                    let rect = Rect::from_min_size(Pos2::new(100.0, 100.0), Vec2::splat(400.0));
                    let response = ui.interact(
                        rect.expand(30.0),
                        egui::Id::new("drag-test"),
                        Sense::click_and_drag(),
                    );
                    app.manipulate(ui, &response, rect);
                });
            },
        );
    }
    fn pointer_button(pos: Pos2, pressed: bool) -> egui::Event {
        egui::Event::PointerButton {
            pos,
            button: egui::PointerButton::Primary,
            pressed,
            modifiers: egui::Modifiers::default(),
        }
    }
    #[test]
    fn native_pointer_move_resize_rotate_and_undo() {
        for (start, end, kind) in [
            (Pos2::new(300.0, 300.0), Pos2::new(450.0, 350.0), 0),
            (Pos2::new(350.0, 300.0), Pos2::new(400.0, 300.0), 1),
            (Pos2::new(300.0, 226.0), Pos2::new(374.0, 300.0), 2),
        ] {
            let ctx = egui::Context::default();
            let mut app = Workbench::from_context(&ctx);
            app.batch.layers.push(Layer::new("test-mark.png".into()));
            app.selected = Some(0);
            pointer_frame(&mut app, &ctx, vec![egui::Event::PointerMoved(start)]);
            pointer_frame(&mut app, &ctx, vec![pointer_button(start, true)]);
            pointer_frame(&mut app, &ctx, vec![egui::Event::PointerMoved(end)]);
            pointer_frame(&mut app, &ctx, vec![pointer_button(end, false)]);
            let p = &app.batch.layers[0].placement;
            match kind {
                0 => {
                    assert!((p.x - 0.875).abs() < 0.001);
                    assert!((p.y - 0.625).abs() < 0.001);
                }
                1 => assert!((p.width.unwrap() - 0.375).abs() < 0.001),
                _ => assert!((p.rotation - 90.0).abs() < 0.001),
            }
            app.undo();
            assert_eq!(app.batch.layers[0].placement, Placement::default());
        }
    }
    fn frame(app: &mut Workbench, ctx: &egui::Context, events: Vec<egui::Event>) {
        let _ = ctx.run(
            egui::RawInput {
                screen_rect: Some(Rect::from_min_size(Pos2::ZERO, Vec2::new(1400.0, 900.0))),
                events,
                ..Default::default()
            },
            |ctx| app.show(ctx),
        );
    }
    #[test]
    fn both_editors_render_and_retain_independent_profiles() {
        let ctx = egui::Context::default();
        let mut app = Workbench::from_context(&ctx);
        frame(&mut app, &ctx, vec![]);
        let before = app.batch.clone();
        app.batch.suffix = "_changed".into();
        app.record_batch(before);
        let before = app.batch.clone();
        app.batch.profile = Profile::Quality;
        app.record_batch(before);
        app.undo();
        assert_eq!(app.batch.suffix, "_watermarked");
        assert_eq!(app.batch.profile, Profile::Quality);
        app.redo();
        assert_eq!(app.batch.suffix, "_changed");
        assert_eq!(app.batch.profile, Profile::Quality);
        app.tab = 1;
        app.group_profile = Profile::Distribution;
        frame(&mut app, &ctx, vec![]);
        app.tab = 0;
        frame(&mut app, &ctx, vec![]);
        assert_eq!(app.batch.profile, Profile::Quality);
        assert_eq!(app.group_profile, Profile::Distribution);
    }
    #[test]
    fn keyboard_undo_redo_does_not_record_the_history_travel() {
        let ctx = egui::Context::default();
        let mut app = Workbench::from_context(&ctx);
        let before = app.batch.clone();
        app.batch.suffix = "_changed".into();
        app.batch_history.record(before, &app.batch);
        let key = |key| egui::Event::Key {
            key,
            physical_key: None,
            pressed: true,
            repeat: false,
            modifiers: egui::Modifiers {
                ctrl: true,
                command: true,
                ..Default::default()
            },
        };
        frame(&mut app, &ctx, vec![key(egui::Key::Z)]);
        assert_eq!(app.batch.suffix, "_watermarked");
        frame(&mut app, &ctx, vec![key(egui::Key::Y)]);
        assert_eq!(app.batch.suffix, "_changed");
        frame(&mut app, &ctx, vec![key(egui::Key::Z)]);
        assert_eq!(app.batch.suffix, "_watermarked");
    }
    #[test]
    fn natural_import_order_and_duplicate_normal_inputs() {
        let dir = tempfile::tempdir().unwrap();
        let paths: Vec<_> = ["10.png", "2.png", "1.png"]
            .into_iter()
            .map(|n| {
                let p = dir.path().join(n);
                std::fs::write(&p, "").unwrap();
                p
            })
            .collect();
        let ctx = egui::Context::default();
        let mut app = Workbench::from_context(&ctx);
        app.add_inputs(paths.clone());
        app.add_inputs(paths);
        assert_eq!(
            app.batch
                .inputs
                .iter()
                .map(|p| file_name(p))
                .collect::<Vec<_>>(),
            ["1.png", "2.png", "10.png"]
        );
    }
    #[test]
    fn pending_preview_is_replaced_and_generation_advances() {
        let ctx = egui::Context::default();
        let mut app = Workbench::from_context(&ctx);
        app.batch.inputs.push("missing.pdf".into());
        app.request_preview();
        let first = app.generation.load(Ordering::Relaxed);
        app.batch.layers.push(Layer::new("mark.png".into()));
        app.request_preview();
        assert!(app.generation.load(Ordering::Relaxed) > first);
        app.batch.inputs.clear();
        app.request_preview();
        assert!(!app.preview_pending);
        assert!(app.texture.is_none());
    }
}
