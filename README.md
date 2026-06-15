# Agent Telegram Harness

Tiny Telegram notification harness for agent runs, media artifacts, and Codex stop hooks.

It provides dependency-free Node CLIs for:

- sending a text notification
- sending a single image with a caption
- sending the newest media artifact folder, with dedupe
- delivering queued notifications from a Codex stop hook

## Requirements

- Node.js 20 or newer
- A Telegram bot token from BotFather
- A Telegram chat id for the destination chat

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
AGENT_NOTIFY_TELEGRAM_BOT_TOKEN=123456:token
AGENT_NOTIFY_TELEGRAM_CHAT_ID=123456789
AGENT_NOTIFY_PREFIX=Agent
```

`.env.local` is ignored by git.

## Text Notifications

```bash
npm run --silent test:notify
node scripts/agent-notify.mjs --dry-run "Run complete"
node scripts/agent-notify.mjs "Run complete"
```

Installed package usage:

```bash
agent-notify "Run complete"
```

## Image Notifications

```bash
node scripts/agent-notify-image.mjs --dry-run ./artifacts/preview.png "Preview"
node scripts/agent-notify-image.mjs ./artifacts/preview.png "Preview"
```

Supported image extensions are `.png`, `.jpg`, `.jpeg`, and `.webp`.

## Media Folder Notifications

```bash
node scripts/agent-notify-media.mjs --dry-run --dir ./artifacts/run-001
node scripts/agent-notify-media.mjs --dir ./artifacts/run-001
```

If `--dir` is omitted, the harness searches the newest media folder under:

```txt
artifacts/
```

Override that with:

```bash
AGENT_NOTIFY_MEDIA_ROOT=./runs node scripts/agent-notify-media.mjs
```

Supported media extensions are `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, and `.mp4`.
When both `rollout.gif` and `rollout.mp4` exist, the MP4 is preferred.

Successful sends write dedupe state to `.agent-notifications/media-sent.json` and a local `.telegram-media-sent.json` marker in the artifact folder. Use `--force` to resend an unchanged manifest.

## Codex Stop Hook

The stop hook can either send a generic stop message or deliver a queued pending event.

Generic stop notification:

```bash
CODEX_NOTIFY_ON_STOP=1 node scripts/codex-stop-notify.mjs --notify-stop
```

Queue a pending event from another script:

```js
import { writePendingNotify } from "agent-telegram-harness/queue"

writePendingNotify(process.cwd(), {
  kind: "run_complete",
  run_id: "demo-run-001",
  checkpoint: "baseline",
  message: "Demo run complete",
})
```

Then run the hook:

```bash
node scripts/codex-stop-notify.mjs --verbose
```

Queued events are deduped in `.agent-notifications/sent.json`. Failed delivery keeps the pending event for a later retry.

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
