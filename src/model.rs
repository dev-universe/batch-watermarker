use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const MAX_PIXELS: u64 = 150_000_000;
pub const MAX_EDGE: u32 = 32_767;

pub fn dimensions(width: f64, height: f64) -> Result<(u32, u32)> {
    ensure!(
        width.is_finite() && height.is_finite() && width > 0.0 && height > 0.0,
        "이미지 크기가 올바르지 않습니다."
    );
    let (w, h) = (
        (width - 1e-7).ceil().max(1.0),
        (height - 1e-7).ceil().max(1.0),
    );
    ensure!(
        w <= MAX_EDGE as f64 && h <= MAX_EDGE as f64 && w * h <= MAX_PIXELS as f64,
        "처리 한도 초과: 최대 150,000,000 픽셀 / 한 변 32767px"
    );
    Ok((w as u32, h as u32))
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, clap::ValueEnum)]
pub enum Profile {
    #[default]
    Original,
    Quality,
    Distribution,
}
impl Profile {
    pub const ALL: [Self; 3] = [Self::Original, Self::Quality, Self::Distribution];
    pub fn dpi(self) -> u32 {
        match self {
            Self::Original => 600,
            Self::Quality => 450,
            Self::Distribution => 300,
        }
    }
    pub fn quality(self) -> Option<u8> {
        match self {
            Self::Original => None,
            Self::Quality => Some(95),
            Self::Distribution => Some(90),
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Original => "원본 보존 · 600 DPI",
            Self::Quality => "고화질 · 450 DPI",
            Self::Distribution => "배포용 · 300 DPI",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Placement {
    pub x: f64,
    pub y: f64,
    pub size: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub rotation: f64,
    pub opacity: f64,
    pub preserve_aspect: bool,
}
impl Default for Placement {
    fn default() -> Self {
        Self {
            x: 0.5,
            y: 0.5,
            size: 0.25,
            width: None,
            height: None,
            rotation: 0.0,
            opacity: 0.35,
            preserve_aspect: true,
        }
    }
}
impl Placement {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            [self.x, self.y, self.size, self.rotation, self.opacity]
                .iter()
                .all(|v| v.is_finite())
                && self.size > 0.0
                && (0.0..=1.0).contains(&self.opacity),
            "워터마크 배치 값이 올바르지 않습니다."
        );
        for v in [self.width, self.height].into_iter().flatten() {
            ensure!(
                v.is_finite() && v > 0.0,
                "워터마크 크기가 올바르지 않습니다."
            );
        }
        Ok(())
    }
    pub fn size_on(&self, source: (f64, f64), canvas: (f64, f64)) -> (f64, f64) {
        if let (Some(w), Some(h)) = (self.width, self.height) {
            return (w * canvas.0, h * canvas.1);
        }
        let scale = self.size * canvas.0.max(canvas.1) / source.0.max(source.1);
        (source.0 * scale, source.1 * scale)
    }
    pub fn snap(&mut self, tolerance: f64) {
        for v in [&mut self.x, &mut self.y] {
            for p in [0.1, 0.5, 0.9] {
                if (*v - p).abs() < tolerance {
                    *v = p;
                    break;
                }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Layer {
    pub path: PathBuf,
    pub label: String,
    pub visible: bool,
    pub locked: bool,
    pub placement: Placement,
}
impl Layer {
    pub fn new(path: PathBuf) -> Self {
        Self {
            label: file_name(&path),
            path,
            visible: true,
            locked: false,
            placement: Placement::default(),
        }
    }
}

pub fn file_name(path: &std::path::Path) -> String {
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Fit {
    Cover,
    Contain,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Background {
    pub path: PathBuf,
    pub fit: Fit,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PageTransform {
    pub scale: f64,
    pub rotation: f64,
    pub x: f64,
    pub y: f64,
    pub margin_mm: f64,
}
impl Default for PageTransform {
    fn default() -> Self {
        Self {
            scale: 1.0,
            rotation: 0.0,
            x: 0.0,
            y: 0.0,
            margin_mm: 0.0,
        }
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Page {
    pub path: PathBuf,
    #[serde(default)]
    pub transform: PageTransform,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Group {
    pub name: String,
    pub pages: Vec<Page>,
    // None inherits; Some(None) explicitly clears a background.
    #[serde(default, with = "background_override")]
    pub background: Option<Option<Background>>,
    pub layers: Option<Vec<Layer>>,
}
// Serde normally collapses both nested None cases to JSON null. Preserve all three states.
mod background_override {
    use super::*;
    pub fn serialize<S: serde::Serializer>(
        v: &Option<Option<Background>>,
        s: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        match v {
            None => s.serialize_str("inherit"),
            Some(v) => v.serialize(s),
        }
    }
    pub fn deserialize<'de, D: serde::Deserializer<'de>>(
        d: D,
    ) -> std::result::Result<Option<Option<Background>>, D::Error> {
        let v = serde_json::Value::deserialize(d)?;
        if v == "inherit" {
            return Ok(None);
        }
        serde_json::from_value::<Option<Background>>(v)
            .map(Some)
            .map_err(serde::de::Error::custom)
    }
}
impl Group {
    pub fn new(name: String) -> Self {
        Self {
            name,
            pages: vec![],
            background: None,
            layers: None,
        }
    }
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Project {
    pub groups: Vec<Group>,
    pub background: Option<Background>,
    pub layers: Vec<Layer>,
}
impl Project {
    pub fn background_for(&self, group: usize) -> Option<&Background> {
        self.groups[group]
            .background
            .as_ref()
            .unwrap_or(&self.background)
            .as_ref()
    }
    pub fn layers_for(&self, group: usize) -> &[Layer] {
        self.groups[group].layers.as_deref().unwrap_or(&self.layers)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Batch {
    pub inputs: Vec<PathBuf>,
    pub layers: Vec<Layer>,
    pub output: Option<PathBuf>,
    pub suffix: String,
    pub flatten: bool,
    pub profile: Profile,
}
impl Default for Batch {
    fn default() -> Self {
        Self {
            inputs: vec![],
            layers: vec![],
            output: None,
            suffix: "_watermarked".into(),
            flatten: false,
            profile: Profile::default(),
        }
    }
}

#[derive(Clone)]
pub struct History<T> {
    past: Vec<T>,
    future: Vec<T>,
}
impl<T: Clone + PartialEq> Default for History<T> {
    fn default() -> Self {
        Self {
            past: vec![],
            future: vec![],
        }
    }
}
impl<T: Clone + PartialEq> History<T> {
    pub fn record(&mut self, before: T, after: &T) {
        if before != *after {
            self.past.push(before);
            self.future.clear();
            if self.past.len() > 100 {
                self.past.remove(0);
            }
        }
    }
    pub fn undo(&mut self, value: &mut T) {
        if let Some(v) = self.past.pop() {
            self.future.push(std::mem::replace(value, v));
        }
    }
    pub fn redo(&mut self, value: &mut T) {
        if let Some(v) = self.future.pop() {
            self.past.push(std::mem::replace(value, v));
        }
    }
}
