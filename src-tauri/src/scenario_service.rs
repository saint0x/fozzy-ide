use crate::error::AppResult;
use crate::fozzy_cli_service::FozzyCliService;
use crate::fs_service::FsService;
use crate::models::{
    CommonFozzyOptions, FozzyCommand, FozzyCommandRequest, FsWriteMode, GenerationApplyResult,
    GenerationPreview, GenerationProposal, MapCommand, WriteFileRequest,
};
use chrono::Utc;
use serde_json::json;
use std::path::Path;

#[derive(Clone, Default)]
pub struct ScenarioService {
    cli: FozzyCliService,
}

impl ScenarioService {
    pub fn new(cli: FozzyCliService) -> Self {
        Self { cli }
    }

    pub async fn preview(
        &self,
        workspace_id: &str,
        root: &Path,
        include_host_variants: bool,
    ) -> AppResult<GenerationPreview> {
        let map = self
            .cli
            .execute(
                root,
                &FozzyCommandRequest {
                    workspace_id: workspace_id.to_string(),
                    request_id: None,
                    command: FozzyCommand::Map(MapCommand {
                        subcommand: "suites".into(),
                        root: Some(".".into()),
                        scenario_root: Some("tests".into()),
                        profile: Some("pedantic".into()),
                        common: CommonFozzyOptions::default(),
                    }),
                },
            )
            .await?;
        let mut proposals = vec![
            generated_proposal("run", "tests/generated/baseline.run.fozzy.json"),
            generated_proposal("memory", "tests/generated/baseline.memory.fozzy.json"),
            generated_proposal("fuzz", "tests/generated/baseline.fuzz.fozzy.json"),
            generated_proposal("explore", "tests/generated/baseline.explore.fozzy.json"),
            generated_proposal("trace", "tests/generated/baseline.trace.fozzy.json"),
        ];
        if include_host_variants {
            proposals.push(generated_host_proposal());
        }
        Ok(GenerationPreview {
            workspace_id: workspace_id.to_string(),
            generated_at: Utc::now(),
            proposals,
            manifest: json!({
                "map": map.stdout_json,
                "generatedAt": Utc::now(),
                "safeWritePolicy": ["create_only", "upsert_generated"]
            }),
        })
    }

    pub fn apply(
        &self,
        workspace_id: &str,
        root: &Path,
        preview: &GenerationPreview,
    ) -> AppResult<GenerationApplyResult> {
        let mut applied_paths = Vec::new();
        for proposal in &preview.proposals {
            FsService::write_confined(
                root,
                &WriteFileRequest {
                    workspace_id: workspace_id.to_string(),
                    relative_path: proposal.output_path.clone(),
                    contents: proposal.contents.clone(),
                    mode: if proposal.mode == "create_only" {
                        FsWriteMode::CreateOnly
                    } else {
                        FsWriteMode::UpsertGenerated
                    },
                    expected_sha256: None,
                },
            )?;
            applied_paths.push(proposal.output_path.clone());
        }
        let manifest_path = ".fozzy/generated.manifest.json".to_string();
        FsService::write_confined(
            root,
            &WriteFileRequest {
                workspace_id: workspace_id.to_string(),
                relative_path: manifest_path.clone(),
                contents: serde_json::to_string_pretty(&preview.manifest)?,
                mode: FsWriteMode::UpsertGenerated,
                expected_sha256: None,
            },
        )?;
        Ok(GenerationApplyResult {
            workspace_id: workspace_id.to_string(),
            applied_paths,
            manifest_path,
        })
    }
}

fn generated_proposal(kind: &str, output_path: &str) -> GenerationProposal {
    GenerationProposal {
        title: format!("Generated {kind} baseline"),
        reason: format!("Adds a durable {kind} scenario with strict deterministic defaults."),
        output_path: output_path.into(),
        contents: format!(
            r#"{{
  "version": 1,
  "name": "generated-{kind}-baseline",
  "steps": [
    {{ "name": "mark-start", "type": "trace_event" }},
    {{ "type": "assert_ok" }}
  ]
}}"#
        ),
        mode: "upsert_generated".into(),
    }
}

fn generated_host_proposal() -> GenerationProposal {
    GenerationProposal {
        title: "Generated host-backed baseline".into(),
        reason: "Adds a host-backed confidence-pass scenario variant.".into(),
        output_path: "tests/generated/baseline.host.fozzy.json".into(),
        contents: r#"{
  "version": 1,
  "name": "generated-host-baseline",
  "steps": [
    { "name": "host-start", "type": "trace_event" },
    { "type": "assert_ok" }
  ]
}"#
        .into(),
        mode: "upsert_generated".into(),
    }
}
