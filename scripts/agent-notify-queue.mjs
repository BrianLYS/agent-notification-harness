import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"

export function notifyQueueDir(repoRoot, env = process.env) {
  return (
    env.AGENT_NOTIFY_QUEUE_DIR || path.join(repoRoot, ".agent-notifications")
  )
}

export function pendingNotifyPath(repoRoot, env = process.env) {
  return path.join(notifyQueueDir(repoRoot, env), "pending.json")
}

export function notifyStatePath(repoRoot, env = process.env) {
  return path.join(notifyQueueDir(repoRoot, env), "sent.json")
}

export function notifyEventId(event) {
  if (event.event_id) {
    return event.event_id
  }

  const stableParts = [
    event.kind || "notification",
    event.release_version || event.run_id || "",
    event.checkpoint || event.summary || "",
  ]
  if (stableParts.some((part) => part)) {
    return stableParts.join("|")
  }

  const hash = createHash("sha256")
    .update(JSON.stringify(event))
    .digest("hex")
    .slice(0, 24)
  return `notification|${hash}`
}

export function readPendingNotify(repoRoot, env = process.env) {
  const pendingPath = pendingNotifyPath(repoRoot, env)
  if (!fs.existsSync(pendingPath)) {
    return null
  }
  return JSON.parse(fs.readFileSync(pendingPath, "utf8"))
}

export function writePendingNotify(repoRoot, event, env = process.env) {
  const queueDir = notifyQueueDir(repoRoot, env)
  fs.mkdirSync(queueDir, { recursive: true })
  const pendingPath = pendingNotifyPath(repoRoot, env)
  fs.writeFileSync(
    pendingPath,
    `${JSON.stringify(
      {
        ...event,
        event_id: event.event_id || notifyEventId(event),
        queued_at: event.queued_at || new Date().toISOString(),
      },
      null,
      2
    )}\n`
  )
  return pendingPath
}

export function removePendingNotify(repoRoot, env = process.env) {
  fs.rmSync(pendingNotifyPath(repoRoot, env), { force: true })
}

export function readNotifyState(repoRoot, env = process.env) {
  const statePath = notifyStatePath(repoRoot, env)
  if (!fs.existsSync(statePath)) {
    return { sent: {} }
  }
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"))
  return {
    ...state,
    sent: state.sent || {},
  }
}

export function writeNotifyState(repoRoot, state, env = process.env) {
  const queueDir = notifyQueueDir(repoRoot, env)
  fs.mkdirSync(queueDir, { recursive: true })
  fs.writeFileSync(
    notifyStatePath(repoRoot, env),
    `${JSON.stringify(state, null, 2)}\n`
  )
}

export function markNotifyDelivered(
  repoRoot,
  event,
  status,
  env = process.env
) {
  const state = readNotifyState(repoRoot, env)
  const eventId = event.event_id || notifyEventId(event)
  state.sent[eventId] = {
    kind: event.kind || null,
    release_version: event.release_version || null,
    run_id: event.run_id || null,
    checkpoint: event.checkpoint || null,
    summary: event.summary || null,
    status,
    delivered_at: new Date().toISOString(),
  }
  writeNotifyState(repoRoot, state, env)
}
