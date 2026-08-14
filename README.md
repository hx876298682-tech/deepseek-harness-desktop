# DeepSeek Harness Desktop

An Electron desktop shell for the DeepSeek Harness Web UI.

## What it does

- Starts the installed dsh web server inside an Electron window.
- Loads the real Harness UI so the web and desktop experiences share the same runtime.
- Provides an updater for the installed @deepseek-ai/dsh package.
- Includes smoke-test support for validating the desktop boot path.

## Files

- main.js — Electron main process and desktop window lifecycle.
- preload.cjs — isolated preload bridge.
- _extracted/ — extracted application source snapshot.

## Running locally

This project expects Electron and a working Node.js installation. The desktop shell resolves the installed DSH CLI automatically, or can use the managed DSH installation configured by the app.

Packaged installers are intentionally excluded from this source repository; build artifacts should be published separately through Releases.

## License

MIT
