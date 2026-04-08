use crate::error::AppResult;
use crate::models::FileNode;
use std::fs;
use std::path::Path;

#[derive(Clone, Default)]
pub struct FileTreeService;

#[derive(Clone, Copy)]
pub struct FileTreeOptions {
    pub max_depth: usize,
    pub max_entries: usize,
    pub include_hidden: bool,
}

impl Default for FileTreeOptions {
    fn default() -> Self {
        Self {
            max_depth: 4,
            max_entries: 2_000,
            include_hidden: false,
        }
    }
}

struct BuildState {
    visited_entries: usize,
    truncated: bool,
}

impl FileTreeService {
    pub fn build(&self, root: &Path, options: FileTreeOptions) -> AppResult<FileNode> {
        let mut state = BuildState {
            visited_entries: 0,
            truncated: false,
        };
        build_node(root, root, 0, options, &mut state)
    }
}

fn build_node(
    root: &Path,
    path: &Path,
    depth: usize,
    options: FileTreeOptions,
    state: &mut BuildState,
) -> AppResult<FileNode> {
    let metadata = fs::metadata(path)?;
    let name = if path == root {
        path.file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string())
    } else {
        path.file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default()
    };
    let relative = if path == root {
        path.to_string_lossy().to_string()
    } else {
        path.strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/")
    };

    state.visited_entries += 1;
    if metadata.is_dir() {
        if depth >= options.max_depth || state.visited_entries >= options.max_entries {
            state.truncated = true;
            return Ok(FileNode {
                name,
                path: relative,
                node_type: "directory".into(),
                children: Some(Vec::new()),
                language: None,
                truncated: true,
            });
        }

        let mut children = Vec::new();
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let child_path = entry.path();
            if should_skip(&child_path, options.include_hidden) {
                continue;
            }
            if state.visited_entries >= options.max_entries {
                state.truncated = true;
                break;
            }
            children.push(build_node(root, &child_path, depth + 1, options, state)?);
        }
        children.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(FileNode {
            name,
            path: relative,
            node_type: "directory".into(),
            children: Some(children),
            language: None,
            truncated: state.truncated,
        })
    } else {
        Ok(FileNode {
            name,
            path: relative,
            node_type: "file".into(),
            children: None,
            language: language_for(path),
            truncated: false,
        })
    }
}

fn should_skip(path: &Path, include_hidden: bool) -> bool {
    let file_name = path.file_name().and_then(|value| value.to_str());
    if matches!(file_name, Some("node_modules" | "target" | ".git" | "dist")) {
        return true;
    }
    if !include_hidden && matches!(file_name, Some(name) if name.starts_with('.')) {
        return true;
    }
    false
}

fn language_for(path: &Path) -> Option<String> {
    match path.extension().and_then(|value| value.to_str()) {
        Some("rs") => Some("rust".into()),
        Some("ts") => Some("typescript".into()),
        Some("tsx") => Some("typescript".into()),
        Some("js") => Some("javascript".into()),
        Some("json") => Some("json".into()),
        Some("toml") => Some("toml".into()),
        Some("md") => Some("markdown".into()),
        Some("py") => Some("python".into()),
        Some("go") => Some("go".into()),
        _ => None,
    }
}
