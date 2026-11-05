use anyhow::{Result, ensure};
use batch_watermarker::{assets, engine::Engine, model::*, pdf};
use clap::{Parser, Subcommand};
use std::{path::PathBuf, sync::atomic::AtomicBool};

#[derive(Parser)]
#[command(version, about = "Batch Watermarker · native Rust engine")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}
#[derive(Subcommand)]
enum Command {
    /// Apply watermark images to PDFs and images. Sources are protected by default.
    Watermark {
        #[arg(required = true)]
        inputs: Vec<PathBuf>,
        #[arg(short = 'w', long, required = true)]
        watermark: Vec<PathBuf>,
        #[arg(short, long)]
        output: Option<PathBuf>,
        #[arg(long, default_value = "_watermarked")]
        suffix: String,
        #[arg(long)]
        flatten: bool,
        #[arg(long, value_enum, default_value = "original")]
        profile: Profile,
        #[arg(long, default_value_t = 0.35)]
        opacity: f64,
        #[arg(long, default_value_t = 0.25)]
        size: f64,
        #[arg(long, default_value_t = 0.0, allow_hyphen_values = true)]
        rotation: f64,
        #[arg(long, default_value_t = 0.5, allow_hyphen_values = true)]
        x: f64,
        #[arg(long, default_value_t = 0.5, allow_hyphen_values = true)]
        y: f64,
        #[arg(long)]
        replace: bool,
    },
    /// Execute a complete batch configuration (JSON).
    Batch {
        config: PathBuf,
        #[arg(long)]
        replace: bool,
    },
    /// Export a grouped transparent-image project (JSON).
    Groups {
        project: PathBuf,
        #[arg(short, long)]
        output: PathBuf,
        #[arg(long, value_enum, default_value = "original")]
        profile: Profile,
    },
    /// Render an input to a PNG preview.
    Preview {
        input: PathBuf,
        output: PathBuf,
        #[arg(long, default_value_t = 1)]
        page: usize,
        #[arg(long, default_value_t = 1400)]
        edge: u32,
    },
    /// Print physical size / page count without altering the input.
    Inspect { input: PathBuf },
}
fn main() {
    if let Err(e) = run() {
        eprintln!("{e:#}");
        std::process::exit(1);
    }
}
fn run() -> Result<()> {
    let cli = Cli::parse();
    let mut engine = Engine::default();
    let cancel = AtomicBool::new(false);
    let report = match cli.command {
        Command::Watermark {
            inputs,
            watermark,
            output,
            suffix,
            flatten,
            profile,
            opacity,
            size,
            rotation,
            x,
            y,
            replace,
        } => {
            let placement = Placement {
                opacity,
                size,
                rotation,
                x,
                y,
                ..Default::default()
            };
            placement.validate()?;
            let layers = watermark
                .into_iter()
                .map(|p| {
                    let mut l = Layer::new(p);
                    l.placement = placement.clone();
                    l
                })
                .collect();
            engine.batch(
                &Batch {
                    inputs,
                    layers,
                    output,
                    suffix,
                    flatten,
                    profile,
                },
                replace,
                &cancel,
                |_| {},
            )?
        }
        Command::Batch { config, replace } => engine.batch(
            &serde_json::from_slice(&assets::read_file(&config)?)?,
            replace,
            &cancel,
            |_| {},
        )?,
        Command::Groups {
            project,
            output,
            profile,
        } => engine.groups(
            &serde_json::from_slice(&assets::read_file(&project)?)?,
            &output,
            profile,
            &cancel,
            |_| {},
        )?,
        Command::Preview {
            input,
            output,
            page,
            edge,
        } => {
            ensure!(edge > 0 && edge <= 32767, "잘못된 미리보기 크기");
            let image = if assets::is_pdf(&input) {
                pdf::preview(&input, page.saturating_sub(1), edge)?.0
            } else {
                engine.image(&input, &[], Some(edge))?.0
            };
            image.save(output)?;
            return Ok(());
        }
        Command::Inspect { input } => {
            if assets::is_pdf(&input) {
                let pdf = pdf::open(assets::read_file(&input)?)?;
                println!(
                    "{}",
                    serde_json::json!({"pages":pdf.pages().iter().map(|p|p.render_dimensions()).collect::<Vec<_>>()})
                );
            } else {
                let asset = assets::load(&input)?;
                println!(
                    "{}",
                    serde_json::json!({"pixels":[asset.width,asset.height],"dpi":asset.dpi,"points":asset.points()})
                );
            }
            return Ok(());
        }
    };
    println!("{}", serde_json::to_string_pretty(&report)?);
    ensure!(
        report.errors.is_empty() && !report.cancelled,
        "일부 파일을 저장하지 못했습니다."
    );
    Ok(())
}
