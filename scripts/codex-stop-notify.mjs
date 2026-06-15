#!/usr/bin/env node

import path from "node:path"
import { spawnSync } from "node:child_process"
import {
  markNotifyDelivered,
  notifyEventId,
  readNotifyState,
  readPendingNotify,
  removePendingNotify,
} from "./agent-notify-queue.mjs"

const scriptRoot = path.resolve(import.meta.dirname, "..")
const repoRoot = path.resolve(process.env.AGENT_NOTIFY_REPO_ROOT || process.cwd())
const notifyScript =
  process.env.CODEX_NOTIFY_TEXT_SCRIPT ||
  path.join(scriptRoot, "scripts", "agent-notify.mjs")
const notifyMediaScript =
  process.env.CODEX_NOTIFY_MEDIA_SCRIPT ||
  path.join(scriptRoot, "scripts", "agent-notify-media.mjs")
const verbose =
  process.argv.includes("--verbose") ||
  process.env.CODEX_NOTIFY_VERBOSE === "1"
const notifyStop =
  process.argv.includes("--notify-stop") ||
  process.env.CODEX_NOTIFY_ON_STOP === "1"

function log(message) {
  if (verbose) {
    console.log(message)
  }
}

function validPendingEvent(event) {
  return (
    event &&
    typeof event.kind === "string" &&
    event.kind.trim().length > 0 &&
    typeof event.message === "string" &&
    event.message.trim().length > 0
  )
}

function deliver(event) {
  return spawnSync(process.execPath, [notifyScript, event.message], {
    cwd: repoRoot,
    encoding: "utf8",
  })
}

function deliverMedia() {
  return spawnSync(process.execPath, [notifyMediaScript], {
    cwd: repoRoot,
    encoding: "utf8",
  })
}

function tryDeliverMedia() {
  const result = deliverMedia()
  if (result.status !== 0) {
    log("Agent media notification delivery failed.")
    return
  }
  const summary = result.stdout.trim()
  if (summary) {
    log(summary)
  }
}

function stopEvent() {
  return {
    kind: "codex_stop",
    message: process.env.CODEX_NOTIFY_STOP_MESSAGE || "Codex Stop hook triggered",
  }
}

try {
  const event = readPendingNotify(repoRoot)
  if (!event) {
    if (notifyStop) {
      const result = deliver(stopEvent())
      if (result.status !== 0) {
        log("Agent Stop notification delivery failed.")
        process.exit(0)
      }

      const status = result.stdout.includes("No notification target configured")
        ? "skipped_unconfigured"
        : "sent"
      log(`Agent Stop notification ${status}.`)
      tryDeliverMedia()
      process.exit(0)
    }

    log("No pending Agent notification.")
    process.exit(0)
  }

  if (!validPendingEvent(event)) {
    markNotifyDelivered(
      repoRoot,
      event || { kind: "invalid" },
      "skipped_invalid"
    )
    removePendingNotify(repoRoot)
    log("Skipped invalid pending Agent notification.")
    process.exit(0)
  }

  const eventId = event.event_id || notifyEventId(event)
  const state = readNotifyState(repoRoot)
  if (state.sent[eventId]) {
    removePendingNotify(repoRoot)
    log(`Skipped duplicate Agent notification ${eventId}.`)
    process.exit(0)
  }

  const result = deliver(event)
  if (result.status !== 0) {
    log(`Agent notification delivery failed; pending event kept: ${eventId}`)
    process.exit(0)
  }

  const status = result.stdout.includes("No notification target configured")
    ? "skipped_unconfigured"
    : "sent"
  markNotifyDelivered(repoRoot, event, status)
  removePendingNotify(repoRoot)
  log(`Agent notification ${status}: ${eventId}`)
  tryDeliverMedia()
  process.exit(0)
} catch (error) {
  log(`Agent notification hook skipped after error: ${error.message}`)
  process.exit(0)
}
