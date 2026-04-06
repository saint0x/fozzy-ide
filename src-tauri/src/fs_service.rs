use crate::error::{AppError, AppResult};
use crate::models::{FsWriteMode, WriteFileRequest};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

pub struct FsService;

impl FsService {
    pub fn read_confined(root: &Path, relative: &str) -> AppResult<String> {
        let path = confined_path(root, relative)?;
        Ok(fs::read_to_string(path)?)
    }

    pub fn write_confined(root: &Path, request: &WriteFileRequest) -> AppResult<String> {
        let path = confined_path(root, &request.relative_path)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let existing = fs::read(&path).ok();
        match request.mode {
            FsWriteMode::CreateOnly if existing.is_some() => {
                return Err(AppError::Conflict(format!(
                    "Refusing to create existing file {}",
                    request.relative_path
                )));
            }
            FsWriteMode::OverwriteIfHashMatches => {
                let expected = request.expected_sha256.clone().ok_or_else(|| {
                    AppError::Validation(
                        "expectedSha256 is required for overwrite_if_hash_matches".into(),
                    )
                })?;
                let actual = existing
                    .as_deref()
                    .map(hash_bytes)
                    .ok_or_else(|| AppError::NotFound(request.relative_path.clone()))?;
                if actual != expected {
                    return Err(AppError::Conflict(format!(
                        "Hash mismatch for {}",
                        request.relative_path
                    )));
                }
            }
            FsWriteMode::PreviewPatchThenApply
                if existing.as_deref() == Some(request.contents.as_bytes()) =>
            {
                return Ok(request.relative_path.clone());
            }
            FsWriteMode::CreateOnly
            | FsWriteMode::PreviewPatchThenApply
            | FsWriteMode::UpsertGenerated => {}
        }

        atomic_write(&path, request.contents.as_bytes())?;
        Ok(request.relative_path.clone())
    }
}

fn confined_path(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let candidate = root.join(relative);
    if candidate
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(AppError::Validation(format!(
            "Path escapes workspace root: {relative}"
        )));
    }
    if let Ok(meta) = fs::symlink_metadata(&candidate) {
        if meta.file_type().is_symlink() {
            return Err(AppError::Validation(format!(
                "Refusing to follow symlink at {relative}"
            )));
        }
    }
    Ok(candidate)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Validation("Target path has no parent".into()))?;
    let temp_path = parent.join(format!(
        ".{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy()
    ));
    let mut file = fs::File::create(&temp_path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    fs::rename(temp_path, path)?;
    Ok(())
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}
