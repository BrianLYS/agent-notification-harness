# Agent Notification Harness

Tiny notification harness for agent runs, media artifacts, and Codex stop hooks.

Telegram is the first delivery provider. The repo name stays broader because the useful abstraction is the agent-side handoff: write a message, queue an event, or drop media into a known directory and let a lightweight notifier deliver it.

It provides dependency-free Node CLIs for:

- sending a text notification
- sending a single image with a caption
- sending the newest media artifact folder, with dedupe
- delivering queued notifications from a Codex stop hook

## Requirements

- Node.js 20 or newer
- A Telegram bot token from BotFather
- A Telegram chat id for the destination chat

## Fresh Repo Setup

Install directly from GitHub:

```bash
npm install --save-dev github:BrianLYS/agent-notification-harness
```

Add scripts to your `package.json`:

```json
{
  "scripts": {
    "agent:notify": "agent-notify",
    "agent:notify:image": "agent-notify-image",
    "agent:notify:media": "agent-notify-media",
    "agent:notify:stop": "codex-stop-notify"
  }
}
```

Copy `.env.example` into your repo as `.env.local`:

```bash
cp node_modules/agent-notification-harness/.env.example .env.local
```

Fill in the Telegram values:

```bash
AGENT_NOTIFY_TELEGRAM_BOT_TOKEN=123456:token
AGENT_NOTIFY_TELEGRAM_CHAT_ID=123456789
AGENT_NOTIFY_PREFIX=Agent
```

Make sure these paths are ignored:

```gitignore
.env.local
.agent-notifications/
```

## Existing Repo Setup

For a repo that already has its own artifact layout, install the harness and point it at your current media root:

```bash
npm install --save-dev github:BrianLYS/agent-notification-harness
AGENT_NOTIFY_MEDIA_ROOT=./artifacts npm run agent:notify:media -- --dry-run
```

If you do not want to change existing scripts yet, keep the harness isolated and call it directly:

```bash
npx agent-notify "Run complete"
npx agent-notify-media --dir ./artifacts/latest-run
```

The default media handoff directory is:

```txt
.agent-notifications/artifacts/
```

That default is useful for halfway adoption: agents can copy shareable outputs into `.agent-notifications/artifacts/<task-or-run>/` without disturbing the repo’s normal build outputs.

## Agent Artifact Handoff

When an agent produces notification-worthy media, it should create a run-specific folder:

```txt
.agent-notifications/artifacts/<task-slug>-<timestamp>/
```

Put directly sendable files in that folder. Supported media extensions are `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, and `.mp4`.

Preferred names are sent first:

```txt
preview-start.png
preview-mid.png
preview-end.png
rollout.mp4
rollout.gif
```

When both `rollout.gif` and `rollout.mp4` exist, the MP4 is preferred. Successful sends write dedupe state to `.agent-notifications/media-sent.json` and a local `.telegram-media-sent.json` marker in the artifact folder. Use `--force` to resend an unchanged manifest.

## Text Notifications

```bash
agent-notify --dry-run "Run complete"
agent-notify "Run complete"
```

Repo script usage:

```bash
npm run agent:notify -- "Run complete"
```

## Image Notifications

```bash
agent-notify-image --dry-run ./preview.png "Preview"
agent-notify-image ./preview.png "Preview"
```

Supported image extensions are `.png`, `.jpg`, `.jpeg`, and `.webp`.

## Media Folder Notifications

```bash
agent-notify-media --dry-run --dir ./.agent-notifications/artifacts/run-001
agent-notify-media --dir ./.agent-notifications/artifacts/run-001
```

If `--dir` is omitted, the harness searches the newest media folder under `.agent-notifications/artifacts/`.

Override that with:

```bash
AGENT_NOTIFY_MEDIA_ROOT=./artifacts agent-notify-media
```

## Codex Stop Hook

The stop hook can either send a generic stop message or deliver a queued pending event.

Generic stop notification:

```bash
CODEX_NOTIFY_ON_STOP=1 codex-stop-notify --notify-stop
```

Queue a pending event from another script:

```js
import { writePendingNotify } from "agent-notification-harness/queue"

writePendingNotify(process.cwd(), {
  kind: "run_complete",
  run_id: "demo-run-001",
  checkpoint: "baseline",
  message: "Demo run complete",
})
```

Then run the hook:

```bash
codex-stop-notify --verbose
```

Queued events are deduped in `.agent-notifications/sent.json`. Failed delivery keeps the pending event for a later retry.

## Agent Instructions

For durable behavior, add a short note to the target repo’s `AGENTS.md`. A copy-paste snippet lives in [`docs/AGENTS-snippet.md`](docs/AGENTS-snippet.md).

A Codex skill can wrap the same convention later, but `AGENTS.md` is the lower-friction default because it travels with each repo and can describe repo-specific artifact expectations.

## Environment

| Variable | Purpose |
| --- | --- |
| `AGENT_NOTIFY_TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `AGENT_NOTIFY_TELEGRAM_CHAT_ID` | Telegram chat id |
| `AGENT_NOTIFY_PREFIX` | Prefix for messages and captions, default `Agent` |
| `AGENT_NOTIFY_MEDIA_ROOT` | Root searched for newest media directory |
| `AGENT_NOTIFY_MEDIA_DIR` | Explicit media directory |
| `AGENT_NOTIFY_QUEUE_DIR` | Queue and dedupe state directory |
| `AGENT_NOTIFY_REPO_ROOT` | Root used by hook/media scripts |
| `CODEX_NOTIFY_ON_STOP` | Send stop notification when no pending event exists |
| `CODEX_NOTIFY_STOP_MESSAGE` | Custom stop notification text |
| `CODEX_NOTIFY_VERBOSE` | Print hook status logs when set to `1` |
| `CODEX_NOTIFY_TEXT_SCRIPT` | Override text notification script for the hook |
| `CODEX_NOTIFY_MEDIA_SCRIPT` | Override media notification script for the hook |

## Test

```bash
npm test
```
