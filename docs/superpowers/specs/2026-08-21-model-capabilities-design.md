# Model-Specific Reasoning Capabilities

## Goal

Make the desktop release repair and configure model-specific reasoning levels in the user's dsh settings without modifying the installed application directly. The released source should migrate known model aliases to the official capabilities shipped by the installed pi-ai catalog, while leaving unknown models conservative and serviceable.

## Scope

- Modify only the repository source and documentation.
- On application startup, perform a one-time, versioned migration of `~/.dsh/settings.yaml`.
- Preserve API keys, provider URLs, unrelated providers, and unknown model entries.
- Never write `null` for a reasoning level other than `off`.
- Do not change the installed `.app` during development; publish a new desktop version for the user's updater test.

## Capability Source

The baseline is the installed dsh/pi-ai catalog metadata used by the current Harness runtime. Exact aliases with catalog entries inherit only the levels present in that catalog. Models without a confirmed catalog mapping use `reasoningEfforts: false`.

The migration targets the current `gongsi-claude` and `gongsi` model aliases. It writes model-level `compat` only for OpenAI-compatible routes that need an explicit wire dialect. It removes the old route-level `gongsi.compat` override so DeepSeek, z.ai, and OpenAI models do not inherit one another's transport format.

## Data Flow

1. `main.js` calls the migration before starting dsh web.
2. The migration reads the settings file as text and applies narrowly scoped provider/model edits, preserving all unrelated YAML.
3. If changes are needed, it creates a timestamped backup, writes the migrated file, and logs the affected providers/models.
4. A marker comment makes the migration idempotent and prevents later launches from overwriting user edits.
5. Unit tests cover insertion, repair of the prior invalid `null` configuration, idempotence, preservation of unrelated settings, and conservative unknown-model behavior.

## Release Verification

- Run the full existing Node test suite plus the migration tests.
- Run the dsh runtime serviceability check against the generated settings fixture.
- Bump the desktop version from `0.1.8` to `0.1.9`.
- Build the macOS arm64 installer, create a GitHub release, and push the commit/tag so the installed App can discover the update.

