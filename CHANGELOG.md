# Changelog

## 0.2.1 - 2026-06-15

- Added `agent-notification-harness` as a package-name initializer bin.
- Documented the shorter GitHub install command.
- Updated installed-package coverage to verify the shorter initializer entrypoint.

## 0.2.0 - 2026-06-15

- Renamed the package and repository to `agent-notification-harness`.
- Added `agent-notification-harness-init` for one-command repo adoption.
- Added default artifact handoff guidance for `.agent-notifications/artifacts/`.
- Added installed-package regression coverage.
- Documented Telegram as the only supported provider today.
- Fixed `codex-stop-notify` to use the consuming repo working directory by default.

## 0.1.0 - 2026-06-15

- Initial public extraction of the Telegram-backed notification harness.
- Added text, image, media-folder, queue, and optional Codex stop-hook CLIs.
- Added tests for notification, media dedupe, and queued delivery behavior.
