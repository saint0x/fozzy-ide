use crate::error::AppResult;
use crate::fozzy_cli_service::FozzyCliService;
use crate::models::{
    CodeAction, CommonFozzyOptions, CompletionItem, Diagnostic, DiagnosticsResponse,
    DocumentSymbol, FozzyCommand, FozzyCommandRequest, HoverResponse, LspDocumentBundle, PatchEdit,
};
use std::path::Path;

#[derive(Clone, Default)]
pub struct LspService {
    cli: FozzyCliService,
}

impl LspService {
    pub fn new(cli: FozzyCliService) -> Self {
        Self { cli }
    }

    pub async fn bundle(
        &self,
        workspace_id: &str,
        root: &Path,
        relative_path: &str,
        text: &str,
    ) -> AppResult<LspDocumentBundle> {
        let diagnostics = self.diagnostics(workspace_id, root, relative_path).await?;
        Ok(LspDocumentBundle {
            workspace_id: workspace_id.to_string(),
            path: relative_path.to_string(),
            diagnostics,
            completions: completions(),
            hover: hover(text),
            symbols: symbols(text),
            code_actions: code_actions(text),
            semantic_tokens: semantic_tokens(text),
        })
    }

    async fn diagnostics(
        &self,
        workspace_id: &str,
        root: &Path,
        relative_path: &str,
    ) -> AppResult<DiagnosticsResponse> {
        let result = self
            .cli
            .execute(
                root,
                &FozzyCommandRequest {
                    workspace_id: workspace_id.to_string(),
                    request_id: None,
                    command: FozzyCommand::Validate {
                        scenario: relative_path.to_string(),
                        common: CommonFozzyOptions::default(),
                    },
                },
            )
            .await?;
        let raw = result.stdout_json.clone();
        Ok(DiagnosticsResponse {
            workspace_id: workspace_id.to_string(),
            path: relative_path.to_string(),
            diagnostics: raw
                .as_ref()
                .and_then(|value| value.get("diagnostics"))
                .and_then(|value| value.as_array())
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|item| Diagnostic {
                    severity: item
                        .get("severity")
                        .and_then(|value| value.as_str())
                        .unwrap_or("info")
                        .to_string(),
                    message: item
                        .get("message")
                        .and_then(|value| value.as_str())
                        .unwrap_or("Unknown diagnostic")
                        .to_string(),
                    path: relative_path.to_string(),
                    line: item
                        .get("line")
                        .and_then(|value| value.as_u64())
                        .map(|value| value as u32),
                    column: item
                        .get("column")
                        .and_then(|value| value.as_u64())
                        .map(|value| value as u32),
                    source: "fozzy".into(),
                    code: item
                        .get("code")
                        .and_then(|value| value.as_str())
                        .map(str::to_string),
                })
                .collect(),
            raw,
        })
    }
}

fn completions() -> Vec<CompletionItem> {
    [
        (
            "--det",
            "Run in deterministic mode",
            "\"det\": true",
            "flag",
        ),
        (
            "--record",
            "Record a replayable trace",
            "\"record\": \"artifacts/trace.fozzy\"",
            "flag",
        ),
        (
            "host-backed variant",
            "Use host proc/fs/http backends",
            "\"procBackend\": \"host\"",
            "snippet",
        ),
        (
            "replay + verify",
            "Add a replay and trace-verify pair",
            "\"traceWorkflow\": true",
            "snippet",
        ),
    ]
    .into_iter()
    .map(|(label, detail, insert_text, kind)| CompletionItem {
        label: label.into(),
        detail: Some(detail.into()),
        insert_text: Some(insert_text.into()),
        kind: kind.into(),
    })
    .collect()
}

fn hover(text: &str) -> Option<HoverResponse> {
    if text.contains("\"steps\"") {
        Some(HoverResponse {
            title: "Fozzy scenario".into(),
            markdown:
                "Top-level scenario documents should use `steps`, `distributed`, or `suites`."
                    .into(),
        })
    } else {
        None
    }
}

fn symbols(text: &str) -> Vec<DocumentSymbol> {
    text.lines()
        .enumerate()
        .filter_map(|(index, line)| {
            if line.contains("\"name\"") {
                Some(DocumentSymbol {
                    name: line.trim().to_string(),
                    kind: "property".into(),
                    line: index + 1,
                })
            } else if line.contains("\"type\"") {
                Some(DocumentSymbol {
                    name: line.trim().to_string(),
                    kind: "step".into(),
                    line: index + 1,
                })
            } else {
                None
            }
        })
        .collect()
}

fn code_actions(text: &str) -> Vec<CodeAction> {
    let mut actions = Vec::new();
    if !text.contains("\"det\"") {
        actions.push(CodeAction {
            title: "Add --det".into(),
            kind: "quickfix".into(),
            edits: vec![PatchEdit {
                start_line: 1,
                end_line: 1,
                replacement: "{\n  \"det\": true,\n".into(),
            }],
        });
    }
    actions.push(CodeAction {
        title: "Add replay/verify pair".into(),
        kind: "refactor".into(),
        edits: vec![PatchEdit {
            start_line: text.lines().count() + 1,
            end_line: text.lines().count() + 1,
            replacement: "\n// recommended follow-up: replay + trace verify + ci\n".into(),
        }],
    });
    actions
}

fn semantic_tokens(text: &str) -> Vec<String> {
    text.lines()
        .flat_map(|line| {
            let mut tokens = Vec::new();
            if line.contains("\"type\"") {
                tokens.push("keyword:type".into());
            }
            if line.contains("\"steps\"") || line.contains("\"distributed\"") {
                tokens.push("namespace:scenario".into());
            }
            tokens
        })
        .collect()
}
