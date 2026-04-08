# Fozzy IDE

Fozzy IDE is a desktop workbench for [Fozzy](https://github.com/ariacomputecompany/fozzy), the deterministic runtime-testing platform from Aria Compute Company.

This project pairs a React + Tauri desktop shell with a native Rust backend that treats Fozzy as a durable local platform, not just a thin command wrapper. The goal is to make multi-project Fozzy workflows fast, safe, inspectable, and useful for real day-to-day scenario authoring and verification.

## Local-First Contract

Fozzy IDE is designed as a fully local desktop application.

- Workspace import, scanning, indexing, trace inspection, artifact access, and generation all operate against local files on disk.
- The backend reads project-local `fozzy.toml`, scenario files, `.fozzy` runtime state, recorded traces, corpora, and generated artifacts directly from the machine running the app.
- Fozzy execution is performed through the locally installed Fozzy toolchain under the hood, so `run`, `test`, `explore`, `replay`, `trace verify`, `ci`, and related flows stay end-to-end local.
- No cloud execution layer is required for the core product path.

## What It Does

- Imports and persists trusted workspaces with scan results, repo metadata, readiness gaps, and session state.
- Scans Fozzy projects for `fozzy.toml`, scenarios, traces, corpora, artifacts, and hidden `.fozzy` state.
- Exposes typed backend commands for the core Fozzy surface, including `run`, `test`, `fuzz`, `explore`, `replay`, `trace verify`, `ci`, `map`, `doctor`, `env`, `schema`, and `validate`.
- Uses the local Fozzy executable as the execution engine behind those typed backend requests.
- Streams run lifecycle events through the Tauri backend and stores run history in SQLite.
- Provides safe backend-only filesystem writes with path confinement, atomic writes, and compare-and-swap style overwrite protection.
- Offers a first-pass Fozzy document API and LSP-oriented contract for diagnostics, hover, completions, symbols, code actions, and semantic-token style responses.
- Generates baseline scenarios and persists generation manifests through a safe preview/apply flow.
- Supports terminal-backed backend workflows for local project automation.

## Backend Architecture

The native backend lives in [`src-tauri`](./src-tauri) and is split into focused services:

- `app_state`
- `workspace_registry`
- `project_scanner`
- `fs_service`
- `fozzy_cli_service`
- `run_orchestrator`
- `telemetry_service`
- `artifact_service`
- `lsp_service`
- `scenario_service`
- `terminal_service`
- `db`
- `events`

Shared frontend contract types for the real backend payloads live in [`src/types/backend-contracts.ts`](./src/types/backend-contracts.ts).

## Current Status

This repository already includes:

- The production-minded Rust/Tauri backend scaffold.
- SQLite-backed workspace and run persistence.
- Typed Fozzy command normalization for frontend use.
- Safe generation and filesystem write flows.
- Seed Fozzy project config and a smoke scenario for local verification.
- Frontend scaffolding and mock-driven UI work that can be swapped over to the native contracts as the UI is completed.

The frontend is still in active development, but the native platform layer is in place and verified locally.

## Local Development

Requirements:

- Node.js
- npm
- Rust toolchain
- Tauri prerequisites for your platform
- `fozzy` installed and available on `PATH`

Install dependencies:

```bash
npm install
```

Start the web app:

```bash
npm run dev
```

Start the desktop app:

```bash
npm run tauri dev
```

Build the frontend:

```bash
npm run build
```

Run Rust tests:

```bash
cd src-tauri
cargo test
```

## Verification

The repo includes a local smoke scenario at [`tests/generated/smoke.run.fozzy.json`](./tests/generated/smoke.run.fozzy.json) and a sample config at [`fozzy.toml`](./fozzy.toml).

The backend has already been exercised with:

- `fozzy map suites --root . --scenario-root tests/generated --profile pedantic --json`
- `fozzy env --json`
- `fozzy doctor --deep --scenario tests/generated/smoke.run.fozzy.json --runs 5 --seed 7 --json`
- `fozzy test --det --strict tests/generated/smoke.run.fozzy.json --json`
- `fozzy run tests/generated/smoke.run.fozzy.json --det --record artifacts/smoke.trace.fozzy --json`
- `fozzy trace verify artifacts/smoke.trace.fozzy --strict --json`
- `fozzy replay artifacts/smoke.trace.fozzy --json`
- `fozzy ci artifacts/smoke.trace.fozzy --json`
- `fozzy run tests/generated/smoke.run.fozzy.json --det --proc-backend host --fs-backend host --http-backend host --json`

## Upstream Fozzy

Fozzy itself is maintained by Aria Compute Company:

- Upstream repo: [ariacomputecompany/fozzy](https://github.com/ariacomputecompany/fozzy)

This IDE is intended to be a desktop-native companion for that runtime and toolchain.
