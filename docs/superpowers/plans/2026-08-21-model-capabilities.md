# Model-Specific Reasoning Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a versioned startup migration that configures official per-model reasoning levels safely and publish it as desktop version `0.1.9` for updater testing.

**Architecture:** Add a pure text migration module with a small official capability matrix, invoke it before dsh starts, and test the transformation independently. The migration is one-time and marker-based, creates a backup before writing, preserves unknown YAML, and removes the unsafe route-level compatibility override.

**Tech Stack:** Node.js ESM, Electron main process, Node built-in test runner, GitHub Releases, electron-builder.

---

### Task 1: Add the capability migration module

**Files:**
- Create: `model-capabilities.js`
- Test: `model-capabilities.test.js`

- [x] Define the exact `gongsi-claude` and `gongsi` capability matrix from the installed pi-ai catalog. Use `false` for aliases without a confirmed selectable thinking map.
- [x] Implement `applyModelCapabilityRules(source)` as a pure, idempotent text transformation. It must replace target model reasoning/compat fields on the first migration, remove the `gongsi` route-level `compat`, add the marker, and leave unrelated content unchanged.
- [x] Implement `ensureModelCapabilitySettings({ home, log })` to create a timestamped `settings.yaml.bak-model-capabilities-*` backup before writing.
- [x] Add tests for valid insertion, repair of non-`off` null values, marker idempotence, preservation of unrelated providers, and `false` for unknown-capability aliases.

### Task 2: Integrate migration into startup

**Files:**
- Modify: `main.js`

- [x] Import `ensureModelCapabilitySettings` beside the existing image-input settings helper.
- [x] Run it immediately before `ensureDefaultImageInputSettings` in `run()` so dsh sees the repaired settings on its first startup.
- [x] Log migration failures without preventing the desktop shell from starting, matching the existing optional settings helper behavior.

### Task 3: Document the shipped matrix and version

**Files:**
- Modify: `README.md`
- Modify: `package.json`

- [x] Add a concise section documenting that reasoning levels come from the dsh/pi-ai catalog, unsupported/unknown models are hidden, and the migration creates a backup.
- [x] Bump the desktop version to `0.1.9` and keep package metadata consistent.

### Task 4: Verify and publish

**Files:**
- Modify: `docs/work-log.md`

- [x] Run `npm test` or the repository's complete test command and the focused migration tests.
- [x] Run a runtime serviceability probe against a migrated fixture and run the Electron smoke test.
- [x] Build the macOS arm64 DMG and verify the artifact name/version.
- [x] Commit only the task changes while preserving unrelated user edits, create tag `v0.1.9`, push the branch/tag to `origin`, and create the GitHub release with the DMG asset.
- [x] Record the commit, tag, release URL, artifact, and verification results in `docs/work-log.md`.
