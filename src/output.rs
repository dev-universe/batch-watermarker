use crate::model::{Batch, file_name};
use anyhow::{Context, Result, bail, ensure};
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

fn identity(path: &Path) -> Result<String> {
    let resolved = if path.exists() {
        fs::canonicalize(path)?
    } else {
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        fs::canonicalize(parent)?.join(path.file_name().context("파일 이름 없음")?)
    };
    let name = resolved.to_string_lossy().into_owned();
    Ok(if cfg!(windows) || cfg!(target_os = "macos") {
        name.to_lowercase()
    } else {
        name
    })
}

pub fn plan(batch: &Batch) -> Result<Vec<PathBuf>> {
    ensure!(!batch.inputs.is_empty(), "입력 파일을 추가하세요.");
    ensure!(
        !batch
            .suffix
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c)),
        "접미사에 경로 문자나 제어 문자를 사용할 수 없습니다."
    );
    if let Some(folder) = &batch.output {
        ensure!(
            folder.is_dir(),
            "출력 폴더가 없습니다: {}",
            folder.display()
        );
    }
    let sources = batch
        .inputs
        .iter()
        .map(|p| identity(p))
        .collect::<Result<HashSet<_>>>()?;
    let mut seen = HashSet::new();
    batch
        .inputs
        .iter()
        .map(|source| {
            let folder = batch
                .output
                .as_deref()
                .unwrap_or_else(|| source.parent().unwrap_or(Path::new(".")));
            let suffix = batch.suffix.trim();
            let extension = if source
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("svg"))
            {
                ".png".into()
            } else {
                source
                    .extension()
                    .map(|s| format!(".{}", s.to_string_lossy()))
                    .unwrap_or_default()
            };
            let name = format!(
                "{}{}{}",
                source.file_stem().unwrap_or_default().to_string_lossy(),
                suffix,
                extension
            );
            let target = folder.join(name);
            let key = identity(&target)?;
            ensure!(
                seen.insert(key.clone()),
                "출력 경로 중복: {}",
                target.display()
            );
            ensure!(
                !sources.contains(&key) || key == identity(source)?,
                "다른 입력 파일을 덮어쓸 수 없습니다: {}",
                target.display()
            );
            Ok(target)
        })
        .collect()
}

pub fn atomic_write(path: &Path, bytes: &[u8], replace: bool) -> Result<()> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    if replace {
        temp.persist(path).map_err(|e| e.error)?;
    } else {
        temp.persist_noclobber(path).map_err(|e| e.error)?;
    }
    Ok(())
}

pub fn group_name(name: &str) -> String {
    let name: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let name = name.trim().trim_matches('.').trim();
    let head = name.split('.').next().unwrap_or_default().to_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]
    .contains(&head.as_str());
    let mut safe = String::new();
    for ch in name.chars().take(100) {
        if safe.len() + ch.len_utf8() > 180 {
            break;
        }
        safe.push(ch);
    }
    if safe.is_empty() {
        "Group".into()
    } else if reserved {
        format!("_{safe}")
    } else {
        safe
    }
}

pub fn publish_group(folder: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf> {
    ensure!(folder.is_dir(), "출력 폴더가 없습니다.");
    let mut temp = tempfile::NamedTempFile::new_in(folder)?;
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    let name = group_name(name);
    for n in 1..100_000 {
        let target = folder.join(if n == 1 {
            format!("{name}.pdf")
        } else {
            format!("{name} ({n}).pdf")
        });
        match fs::hard_link(temp.path(), &target) {
            Ok(()) => return Ok(target),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => bail!("{}: {e}", file_name(&target)),
        }
    }
    bail!("동일한 그룹 이름이 너무 많습니다.")
}
