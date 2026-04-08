use crate::db::Db;
use crate::error::AppResult;
use crate::models::{
    CommandTrend, RunSummary, ScenarioTrend, TelemetryPoint, TelemetryRollup, TelemetrySample,
    TelemetrySeries, TelemetrySnapshot, TrendPoint, TrendReport, TrendSeries, WorkspaceSummary,
};
use chrono::{DateTime, Datelike, Duration, TimeZone, Timelike, Utc};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone)]
pub struct TelemetryService {
    db: Arc<Db>,
}

impl TelemetryService {
    pub fn new(db: Arc<Db>) -> Self {
        Self { db }
    }

    pub fn record_run(
        &self,
        workspace: &WorkspaceSummary,
        run: &RunSummary,
        duration_ms: u128,
    ) -> AppResult<()> {
        let captured_at = run.finished_at.unwrap_or_else(Utc::now);
        let scenario_path = scenario_path_from_run(run);
        let scenario_kind = scenario_path
            .as_deref()
            .map(detect_scenario_kind)
            .unwrap_or("unknown");
        let derived_artifact_count = derived_artifact_count(run);
        let mut samples = vec![
            sample(
                &workspace.id,
                Some(&run.id),
                "runs.total",
                captured_at,
                1.0,
                Some(run.status.clone()),
                json_tags(run, scenario_path.as_deref(), scenario_kind),
            ),
            sample(
                &workspace.id,
                Some(&run.id),
                "runs.succeeded",
                captured_at,
                if run_succeeded(run) { 1.0 } else { 0.0 },
                Some(run.command.clone()),
                json_tags(run, scenario_path.as_deref(), scenario_kind),
            ),
            sample(
                &workspace.id,
                Some(&run.id),
                "runs.failed",
                captured_at,
                if run_failed(run) { 1.0 } else { 0.0 },
                Some(run.command.clone()),
                json_tags(run, scenario_path.as_deref(), scenario_kind),
            ),
            sample(
                &workspace.id,
                Some(&run.id),
                "runs.cancelled",
                captured_at,
                if run.status == "cancelled" { 1.0 } else { 0.0 },
                Some(run.command.clone()),
                json_tags(run, scenario_path.as_deref(), scenario_kind),
            ),
            sample(
                &workspace.id,
                Some(&run.id),
                "runs.duration_ms",
                captured_at,
                duration_ms as f64,
                scenario_path.clone(),
                json_tags(run, scenario_path.as_deref(), scenario_kind),
            ),
            sample(
                &workspace.id,
                Some(&run.id),
                "runs.stdout_bytes",
                captured_at,
                run.stdout_text.len() as f64,
                scenario_path.clone(),
                json_tags(run, scenario_path.as_deref(), scenario_kind),
            ),
            sample(
                &workspace.id,
                Some(&run.id),
                "runs.stderr_bytes",
                captured_at,
                run.stderr_text.len() as f64,
                scenario_path.clone(),
                json_tags(run, scenario_path.as_deref(), scenario_kind),
            ),
            sample(
                &workspace.id,
                Some(&run.id),
                "traces.recorded",
                captured_at,
                if run.trace_path.is_some() { 1.0 } else { 0.0 },
                scenario_path.clone(),
                json_tags(run, scenario_path.as_deref(), scenario_kind),
            ),
            sample(
                &workspace.id,
                Some(&run.id),
                "artifacts.derived_count",
                captured_at,
                derived_artifact_count as f64,
                scenario_path.clone(),
                json_tags(run, scenario_path.as_deref(), scenario_kind),
            ),
            sample(
                &workspace.id,
                Some(&run.id),
                &format!("runs.by_command.{}", run.command),
                captured_at,
                1.0,
                scenario_path.clone(),
                json_tags(run, scenario_path.as_deref(), scenario_kind),
            ),
            sample(
                &workspace.id,
                Some(&run.id),
                &format!("runs.by_kind.{scenario_kind}"),
                captured_at,
                1.0,
                scenario_path.clone(),
                json_tags(run, scenario_path.as_deref(), scenario_kind),
            ),
        ];

        if let Some(stdout_json) = &run.stdout_json {
            flatten_numeric_metrics(
                stdout_json,
                "cli",
                &workspace.id,
                &run.id,
                captured_at,
                &mut samples,
                &json_tags(run, scenario_path.as_deref(), scenario_kind),
            );
        }

        let metrics: BTreeSet<String> = samples.iter().map(|item| item.metric.clone()).collect();
        for telemetry_sample in &samples {
            self.db.insert_telemetry_sample(telemetry_sample)?;
        }
        for metric in metrics {
            self.refresh_rollup(&workspace.id, &metric, "hour", captured_at)?;
            self.refresh_rollup(&workspace.id, &metric, "day", captured_at)?;
        }
        Ok(())
    }

    pub fn snapshot(&self, workspace: &WorkspaceSummary) -> AppResult<TelemetrySnapshot> {
        let runs = self.db.list_run_summaries(&workspace.id)?;
        let total_runs = runs.len();
        let recent_cutoff = Utc::now() - Duration::hours(24);
        let recent_runs: Vec<&RunSummary> = runs
            .iter()
            .filter(|run| run.finished_at.unwrap_or(run.started_at) >= recent_cutoff)
            .collect();
        let recent_total = recent_runs.len().max(1);
        let recent_successes = recent_runs.iter().filter(|run| run_succeeded(run)).count();
        let recent_failures = recent_runs.iter().filter(|run| run_failed(run)).count();
        let avg_latency_ms = average(
            recent_runs
                .iter()
                .filter_map(|run| run_duration_ms(run))
                .collect::<Vec<_>>(),
        );
        let samples = self.db.list_telemetry_samples(&workspace.id, None, Some(2_500))?;
        let memory_usage_mb = latest_metric(&samples, &["cli.memory_usage_mb", "cli.memory_mb"]);
        let throughput_per_hour = samples
            .iter()
            .filter(|sample| sample.metric == "runs.total" && sample.captured_at >= recent_cutoff)
            .count() as f64
            / 24.0;
        let trace_record_rate = if recent_runs.is_empty() {
            0.0
        } else {
            recent_runs.iter().filter(|run| run.trace_path.is_some()).count() as f64
                / recent_runs.len() as f64
        };
        let artifact_count = runs.iter().map(derived_artifact_count).sum();
        Ok(TelemetrySnapshot {
            workspace_id: workspace.id.clone(),
            recorded_at: Utc::now(),
            pass_rate: recent_successes as f64 / recent_total as f64,
            fail_rate: recent_failures as f64 / recent_total as f64,
            total_runs,
            avg_latency_ms,
            flake_signals: flake_signals(&runs),
            memory_usage_mb,
            explore_progress: progress_for_kind(&samples, "explore"),
            fuzz_progress: progress_for_kind(&samples, "fuzz"),
            throughput_per_hour,
            trace_record_rate,
            artifact_count,
        })
    }

    pub fn series(
        &self,
        workspace_id: &str,
        metric: &str,
        range: &str,
    ) -> AppResult<TelemetrySeries> {
        let bucket = bucket_for_range(range);
        let limit = limit_for_range(range);
        let points = match metric {
            "passRate" => ratio_series(
                self.db
                    .list_telemetry_rollups(workspace_id, "runs.succeeded", bucket, Some(limit))?,
                self.db
                    .list_telemetry_rollups(workspace_id, "runs.total", bucket, Some(limit))?,
            ),
            "latency" => rollup_points(
                self.db
                    .list_telemetry_rollups(workspace_id, "runs.duration_ms", bucket, Some(limit))?,
                "avg",
            ),
            "memory" => {
                let rollups = self
                    .db
                    .list_telemetry_rollups(workspace_id, "cli.memory_usage_mb", bucket, Some(limit))?;
                if rollups.is_empty() {
                    rollup_points(
                        self.db
                            .list_telemetry_rollups(workspace_id, "cli.memory_mb", bucket, Some(limit))?,
                        "avg",
                    )
                } else {
                    rollup_points(rollups, "avg")
                }
            }
            "throughput" => rollup_points(
                self.db
                    .list_telemetry_rollups(workspace_id, "runs.total", bucket, Some(limit))?,
                "sum",
            ),
            _ => rollup_points(
                self.db
                    .list_telemetry_rollups(workspace_id, metric, bucket, Some(limit))?,
                "avg",
            ),
        };
        Ok(TelemetrySeries {
            workspace_id: workspace_id.to_string(),
            metric: metric.to_string(),
            points,
        })
    }

    pub fn history(&self, workspace: &WorkspaceSummary, limit: usize) -> AppResult<Vec<TelemetrySnapshot>> {
        let throughput = self
            .db
            .list_telemetry_rollups(&workspace.id, "runs.total", "day", Some(limit))?;
        let success = self
            .db
            .list_telemetry_rollups(&workspace.id, "runs.succeeded", "day", Some(limit))?;
        let failure = self
            .db
            .list_telemetry_rollups(&workspace.id, "runs.failed", "day", Some(limit))?;
        let latency = self
            .db
            .list_telemetry_rollups(&workspace.id, "runs.duration_ms", "day", Some(limit))?;
        let trace_rate = self
            .db
            .list_telemetry_rollups(&workspace.id, "traces.recorded", "day", Some(limit))?;

        let totals_by_ts = map_rollups(throughput);
        let success_by_ts = map_rollups(success);
        let failure_by_ts = map_rollups(failure);
        let latency_by_ts = map_rollups(latency);
        let trace_by_ts = map_rollups(trace_rate);
        let mut buckets: Vec<DateTime<Utc>> = totals_by_ts.keys().cloned().collect();
        buckets.sort();
        let snapshots = buckets
            .into_iter()
            .rev()
            .take(limit)
            .map(|bucket_start| {
                let total = totals_by_ts
                    .get(&bucket_start)
                    .map(|rollup| rollup.sum as usize)
                    .unwrap_or_default();
                let total_non_zero = total.max(1) as f64;
                TelemetrySnapshot {
                    workspace_id: workspace.id.clone(),
                    recorded_at: bucket_start,
                    pass_rate: success_by_ts
                        .get(&bucket_start)
                        .map(|rollup| rollup.sum / total_non_zero)
                        .unwrap_or(0.0),
                    fail_rate: failure_by_ts
                        .get(&bucket_start)
                        .map(|rollup| rollup.sum / total_non_zero)
                        .unwrap_or(0.0),
                    total_runs: total,
                    avg_latency_ms: latency_by_ts
                        .get(&bucket_start)
                        .map(|rollup| rollup.avg)
                        .unwrap_or(0.0),
                    flake_signals: 0,
                    memory_usage_mb: 0.0,
                    explore_progress: 0.0,
                    fuzz_progress: 0.0,
                    throughput_per_hour: total as f64 / 24.0,
                    trace_record_rate: trace_by_ts
                        .get(&bucket_start)
                        .map(|rollup| rollup.sum / total_non_zero)
                        .unwrap_or(0.0),
                    artifact_count: 0,
                }
            })
            .collect();
        Ok(snapshots)
    }

    pub fn trends(&self, workspace: &WorkspaceSummary, range: &str) -> AppResult<TrendReport> {
        let snapshot = self.snapshot(workspace)?;
        let series = vec![
            trend_series("passRate", "Pass Rate", self.series(&workspace.id, "passRate", range)?),
            trend_series("latency", "Latency", self.series(&workspace.id, "latency", range)?),
            trend_series(
                "throughput",
                "Throughput",
                self.series(&workspace.id, "throughput", range)?,
            ),
            trend_series("memory", "Memory", self.series(&workspace.id, "memory", range)?),
            trend_series_from_points(
                "traceRecordRate",
                "Trace Record Rate",
                ratio_series(
                    self.db.list_telemetry_rollups(
                        &workspace.id,
                        "traces.recorded",
                        bucket_for_range(range),
                        Some(limit_for_range(range)),
                    )?,
                    self.db.list_telemetry_rollups(
                        &workspace.id,
                        "runs.total",
                        bucket_for_range(range),
                        Some(limit_for_range(range)),
                    )?,
                ),
            ),
        ];
        let runs = self.db.list_run_summaries(&workspace.id)?;
        Ok(TrendReport {
            workspace_id: workspace.id.clone(),
            range: range.to_string(),
            generated_at: Utc::now(),
            snapshot,
            series,
            top_scenarios: top_scenarios(&runs),
            command_breakdown: command_breakdown(&runs),
        })
    }

    fn refresh_rollup(
        &self,
        workspace_id: &str,
        metric: &str,
        bucket: &str,
        captured_at: DateTime<Utc>,
    ) -> AppResult<()> {
        let bucket_start = bucket_start(bucket, captured_at);
        let bucket_end = match bucket {
            "day" => bucket_start + Duration::days(1),
            _ => bucket_start + Duration::hours(1),
        };
        let samples = self
            .db
            .list_telemetry_samples(workspace_id, Some(metric), Some(10_000))?;
        let bucket_samples: Vec<&TelemetrySample> = samples
            .iter()
            .filter(|sample| sample.captured_at >= bucket_start && sample.captured_at < bucket_end)
            .collect();
        if bucket_samples.is_empty() {
            return Ok(());
        }
        let values: Vec<f64> = bucket_samples.iter().map(|sample| sample.value).collect();
        let rollup = TelemetryRollup {
            id: format!("{workspace_id}:{metric}:{bucket}:{}", bucket_start.timestamp()),
            workspace_id: workspace_id.to_string(),
            metric: metric.to_string(),
            bucket: bucket.to_string(),
            bucket_start,
            count: values.len(),
            min: values.iter().copied().fold(f64::INFINITY, f64::min),
            max: values.iter().copied().fold(f64::NEG_INFINITY, f64::max),
            avg: average(values.clone()),
            sum: values.iter().sum(),
            last: bucket_samples
                .iter()
                .max_by_key(|sample| sample.captured_at)
                .map(|sample| sample.value)
                .unwrap_or_default(),
        };
        self.db.upsert_telemetry_rollup(&rollup)
    }
}

fn sample(
    workspace_id: &str,
    run_id: Option<&str>,
    metric: &str,
    captured_at: DateTime<Utc>,
    value: f64,
    label: Option<String>,
    tags: Value,
) -> TelemetrySample {
    TelemetrySample {
        id: Uuid::new_v4().to_string(),
        workspace_id: workspace_id.to_string(),
        run_id: run_id.map(ToOwned::to_owned),
        metric: metric.to_string(),
        captured_at,
        value,
        label,
        tags,
    }
}

fn json_tags(run: &RunSummary, scenario_path: Option<&str>, scenario_kind: &str) -> Value {
    let mut tags = Map::new();
    tags.insert("command".into(), Value::String(run.command.clone()));
    tags.insert("status".into(), Value::String(run.status.clone()));
    tags.insert("requestId".into(), Value::String(run.request_id.clone()));
    tags.insert("scenarioKind".into(), Value::String(scenario_kind.to_string()));
    if let Some(path) = scenario_path {
        tags.insert("scenarioPath".into(), Value::String(path.to_string()));
    }
    if let Some(trace_path) = &run.trace_path {
        tags.insert("tracePath".into(), Value::String(trace_path.clone()));
    }
    if let Some(exit_code) = run.exit_code {
        tags.insert("exitCode".into(), Value::Number(exit_code.into()));
    }
    Value::Object(tags)
}

fn flatten_numeric_metrics(
    value: &Value,
    prefix: &str,
    workspace_id: &str,
    run_id: &str,
    captured_at: DateTime<Utc>,
    out: &mut Vec<TelemetrySample>,
    tags: &Value,
) {
    let mut flattened = Vec::new();
    flatten_value(value, prefix, &mut flattened);
    for (metric, value) in flattened.into_iter().take(48) {
        out.push(sample(
            workspace_id,
            Some(run_id),
            &metric,
            captured_at,
            value,
            None,
            tags.clone(),
        ));
    }
}

fn flatten_value(value: &Value, prefix: &str, out: &mut Vec<(String, f64)>) {
    match value {
        Value::Number(number) => {
            if let Some(value) = number.as_f64() {
                out.push((prefix.to_string(), value));
            }
        }
        Value::Object(map) => {
            for (key, nested) in map {
                flatten_value(nested, &format!("{prefix}.{key}"), out);
            }
        }
        Value::Array(items) => {
            for (index, nested) in items.iter().enumerate() {
                flatten_value(nested, &format!("{prefix}.{index}"), out);
            }
        }
        _ => {}
    }
}

fn bucket_start(bucket: &str, at: DateTime<Utc>) -> DateTime<Utc> {
    match bucket {
        "day" => Utc
            .with_ymd_and_hms(at.year(), at.month(), at.day(), 0, 0, 0)
            .single()
            .unwrap_or(at),
        _ => Utc
            .with_ymd_and_hms(at.year(), at.month(), at.day(), at.hour(), 0, 0)
            .single()
            .unwrap_or(at),
    }
}

fn bucket_for_range(range: &str) -> &str {
    match range {
        "7d" | "30d" => "day",
        _ => "hour",
    }
}

fn limit_for_range(range: &str) -> usize {
    match range {
        "1h" => 1,
        "6h" => 6,
        "24h" => 24,
        "7d" => 7,
        "30d" => 30,
        _ => 24,
    }
}

fn ratio_series(numerator: Vec<TelemetryRollup>, denominator: Vec<TelemetryRollup>) -> Vec<TelemetryPoint> {
    let numerator_by_ts = map_rollups(numerator);
    let denominator_by_ts = map_rollups(denominator);
    let mut keys: Vec<_> = denominator_by_ts.keys().cloned().collect();
    keys.sort();
    keys.into_iter()
        .filter_map(|ts| {
            let denominator = denominator_by_ts.get(&ts)?.sum;
            if denominator <= 0.0 {
                return Some(TelemetryPoint {
                    ts,
                    value: 0.0,
                    label: None,
                });
            }
            let numerator = numerator_by_ts.get(&ts).map(|rollup| rollup.sum).unwrap_or(0.0);
            Some(TelemetryPoint {
                ts,
                value: numerator / denominator,
                label: None,
            })
        })
        .collect()
}

fn rollup_points(rollups: Vec<TelemetryRollup>, aggregate: &str) -> Vec<TelemetryPoint> {
    let mut points: Vec<_> = rollups
        .into_iter()
        .map(|rollup| TelemetryPoint {
            ts: rollup.bucket_start,
            value: match aggregate {
                "sum" => rollup.sum,
                "last" => rollup.last,
                _ => rollup.avg,
            },
            label: Some(rollup.bucket),
        })
        .collect();
    points.sort_by_key(|point| point.ts);
    points
}

fn trend_series(key: &str, label: &str, series: TelemetrySeries) -> TrendSeries {
    TrendSeries {
        key: key.to_string(),
        label: label.to_string(),
        points: series
            .points
            .into_iter()
            .map(|point| TrendPoint {
                ts: point.ts,
                value: point.value,
                count: 1,
            })
            .collect(),
    }
}

fn trend_series_from_points(key: &str, label: &str, points: Vec<TelemetryPoint>) -> TrendSeries {
    TrendSeries {
        key: key.to_string(),
        label: label.to_string(),
        points: points
            .into_iter()
            .map(|point| TrendPoint {
                ts: point.ts,
                value: point.value,
                count: 1,
            })
            .collect(),
    }
}

fn map_rollups(rollups: Vec<TelemetryRollup>) -> BTreeMap<DateTime<Utc>, TelemetryRollup> {
    rollups
        .into_iter()
        .map(|rollup| (rollup.bucket_start, rollup))
        .collect()
}

fn average(values: Vec<f64>) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

fn latest_metric(samples: &[TelemetrySample], metrics: &[&str]) -> f64 {
    for metric in metrics {
        if let Some(sample) = samples.iter().find(|sample| sample.metric == *metric) {
            return sample.value;
        }
    }
    0.0
}

fn scenario_path_from_run(run: &RunSummary) -> Option<String> {
    run.args
        .iter()
        .rev()
        .find(|arg| arg.ends_with(".fozzy.json"))
        .cloned()
}

fn detect_scenario_kind(path: &str) -> &'static str {
    if path.contains("memory") {
        "memory"
    } else if path.contains("fuzz") {
        "fuzz"
    } else if path.contains("explore") {
        "explore"
    } else if path.contains("host") {
        "host"
    } else if path.contains("trace") {
        "trace"
    } else if path.contains("test") {
        "test"
    } else if path.contains("generated") {
        "generated"
    } else {
        "run"
    }
}

fn derived_artifact_count(run: &RunSummary) -> usize {
    let mut count = usize::from(run.trace_path.is_some());
    if let Some(identity) = run
        .stdout_json
        .as_ref()
        .and_then(|value| value.get("identity"))
        .and_then(|value| value.as_object())
    {
        if identity.get("reportPath").is_some() {
            count += 1;
        }
        if identity.get("artifactsDir").is_some() {
            count += 1;
        }
    }
    count
}

fn run_duration_ms(run: &RunSummary) -> Option<f64> {
    run.finished_at
        .map(|finished_at| (finished_at - run.started_at).num_milliseconds() as f64)
}

fn run_succeeded(run: &RunSummary) -> bool {
    normalized_run_status(run) == "pass"
}

fn run_failed(run: &RunSummary) -> bool {
    matches!(
        normalized_run_status(run),
        "fail" | "error" | "timeout" | "crash" | "cancelled"
    )
}

fn normalized_run_status(run: &RunSummary) -> &str {
    match run.status.as_str() {
        "pass" | "passed" | "succeeded" | "success" => "pass",
        "fail" | "failed" => "fail",
        "error" => "error",
        "timeout" | "timedout" | "timed_out" => "timeout",
        "crash" | "crashed" => "crash",
        "cancelled" | "canceled" => "cancelled",
        "running" => "running",
        _ if run.exit_code == Some(0) => "pass",
        _ if run.exit_code == Some(1) => "fail",
        _ if run.exit_code == Some(2) => "error",
        _ if run.exit_code == Some(3) => "timeout",
        _ if run.exit_code == Some(4) => "crash",
        _ if run.exit_code.is_some() => "error",
        _ => "running",
    }
}

fn flake_signals(runs: &[RunSummary]) -> usize {
    let mut statuses: HashMap<String, BTreeSet<bool>> = HashMap::new();
    for run in runs.iter().take(100) {
        if let Some(path) = scenario_path_from_run(run) {
            statuses.entry(path).or_default().insert(run_succeeded(run));
        }
    }
    statuses.values().filter(|states| states.len() > 1).count()
}

fn progress_for_kind(samples: &[TelemetrySample], kind: &str) -> f64 {
    let attempts = samples
        .iter()
        .filter(|sample| sample.metric == format!("runs.by_kind.{kind}"))
        .count() as f64;
    (attempts * 10.0).min(100.0)
}

fn top_scenarios(runs: &[RunSummary]) -> Vec<ScenarioTrend> {
    let mut grouped: HashMap<String, Vec<&RunSummary>> = HashMap::new();
    for run in runs {
        if let Some(path) = scenario_path_from_run(run) {
            grouped.entry(path).or_default().push(run);
        }
    }
    let mut scenarios: Vec<_> = grouped
        .into_iter()
        .filter_map(|(scenario_path, grouped_runs)| {
            let total_runs = grouped_runs.len();
            let last_run = grouped_runs.iter().max_by_key(|run| run.started_at)?;
            Some(ScenarioTrend {
                scenario_path,
                total_runs,
                success_rate: grouped_runs.iter().filter(|run| run_succeeded(run)).count() as f64
                    / total_runs as f64,
                avg_latency_ms: average(
                    grouped_runs
                        .iter()
                        .filter_map(|run| run_duration_ms(run))
                        .collect(),
                ),
                last_status: last_run.status.clone(),
                last_run_at: last_run.finished_at.unwrap_or(last_run.started_at),
            })
        })
        .collect();
    scenarios.sort_by(|left, right| right.total_runs.cmp(&left.total_runs));
    scenarios.truncate(8);
    scenarios
}

fn command_breakdown(runs: &[RunSummary]) -> Vec<CommandTrend> {
    let mut grouped: HashMap<String, Vec<&RunSummary>> = HashMap::new();
    for run in runs {
        grouped.entry(run.command.clone()).or_default().push(run);
    }
    let mut commands: Vec<_> = grouped
        .into_iter()
        .map(|(command, grouped_runs)| {
            let total_runs = grouped_runs.len();
            CommandTrend {
                command,
                total_runs,
                success_rate: grouped_runs.iter().filter(|run| run_succeeded(run)).count() as f64
                    / total_runs as f64,
                avg_latency_ms: average(
                    grouped_runs
                        .iter()
                        .filter_map(|run| run_duration_ms(run))
                        .collect(),
                ),
            }
        })
        .collect();
    commands.sort_by(|left, right| right.total_runs.cmp(&left.total_runs));
    commands
}
