#!/usr/bin/env node

import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import {
  notifyStatePath,
  pendingNotifyPath,
  writePendingNotify,
  writeNotifyState,
} from "./agent-notify-queue.mjs"

const repoRoot = path.resolve(import.meta.dirname, "..")
const hookScript = path.join(repoRoot, "scripts", "codex-stop-notify.mjs")

function withTempDir(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-telegram-harness-codex-stop-"))
  try {
    return callback(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function writeFakeNotify(dir, source) {
  const scriptPath = path.join(dir, "fake-notify.mjs")
  fs.writeFileSync(scriptPath, source)
  return scriptPath
}

function runHook(dir, notifyScript, args = []) {
  return spawnSync(process.execPath, [hookScript, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AGENT_NOTIFY_REPO_ROOT: dir,
      CODEX_NOTIFY_TEXT_SCRIPT: notifyScript,
    },
    encoding: "utf8",
  })
}

function releaseEvent(overrides = {}) {
  return {
    kind: "run_complete",
    run_id: "demo-run-001",
    checkpoint: "demo checkpoint",
    message: "Demo run complete",
    ...overrides,
  }
}

function patchEvent(overrides = {}) {
  return {
    kind: "patch_complete",
    summary: "Patch complete",
    checkpoint: "demo patch checkpoint",
    message: "Patch complete",
    ...overrides,
  }
}

function noPendingEventExitsQuietly() {
  withTempDir((dir) => {
    const fakeNotify = writeFakeNotify(dir, "process.exit(0)\n")
    const result = runHook(dir, fakeNotify)

    assert.equal(result.status, 0)
    assert.equal(result.stdout, "")
    assert.equal(result.stderr, "")
  })
}

function noPendingEventSendsStopNotificationWhenRequested() {
  withTempDir((dir) => {
    const logPath = path.join(dir, "notify-args.json")
    const fakeNotify = writeFakeNotify(
      dir,
      [
        'import fs from "node:fs"',
        `fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)))`,
        'console.log("Telegram notification sent.")',
        "",
      ].join("\n")
    )

    const result = runHook(dir, fakeNotify, ["--notify-stop"])

    assert.equal(result.status, 0)
    assert.deepEqual(JSON.parse(fs.readFileSync(logPath, "utf8")), [
      "Codex Stop hook triggered",
    ])
    assert.equal(fs.existsSync(pendingNotifyPath(dir)), false)
  })
}

function pendingEventIsSentAndDeduped() {
  withTempDir((dir) => {
    const logPath = path.join(dir, "notify-args.json")
    const fakeNotify = writeFakeNotify(
      dir,
      [
        'import fs from "node:fs"',
        `fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)))`,
        'console.log("Telegram notification sent.")',
        "",
      ].join("\n")
    )

    writePendingNotify(dir, releaseEvent())
    const result = runHook(dir, fakeNotify, ["--notify-stop"])

    assert.equal(result.status, 0)
    assert.deepEqual(JSON.parse(fs.readFileSync(logPath, "utf8")), [
      "Demo run complete",
    ])
    assert.equal(fs.existsSync(pendingNotifyPath(dir)), false)
    const state = JSON.parse(fs.readFileSync(notifyStatePath(dir), "utf8"))
    assert.equal(
      state.sent["run_complete|demo-run-001|demo checkpoint"].status,
      "sent"
    )
  })
}

function pendingPatchEventIsSentAndDeduped() {
  withTempDir((dir) => {
    const logPath = path.join(dir, "notify-args.json")
    const fakeNotify = writeFakeNotify(
      dir,
      [
        'import fs from "node:fs"',
        `fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)))`,
        'console.log("Telegram notification sent.")',
        "",
      ].join("\n")
    )

    writePendingNotify(dir, patchEvent())
    const result = runHook(dir, fakeNotify)

    assert.equal(result.status, 0)
    assert.deepEqual(JSON.parse(fs.readFileSync(logPath, "utf8")), [
      "Patch complete",
    ])
    assert.equal(fs.existsSync(pendingNotifyPath(dir)), false)
    const state = JSON.parse(fs.readFileSync(notifyStatePath(dir), "utf8"))
    assert.equal(
      state.sent["patch_complete||demo patch checkpoint"].status,
      "sent"
    )
  })
}

function duplicatePendingEventIsRemovedWithoutSending() {
  withTempDir((dir) => {
    const logPath = path.join(dir, "notify-args.json")
    const fakeNotify = writeFakeNotify(
      dir,
      [
        'import fs from "node:fs"',
        `fs.writeFileSync(${JSON.stringify(logPath)}, "called")`,
        "",
      ].join("\n")
    )
    const event = releaseEvent()
    writePendingNotify(dir, event)
    writeNotifyState(dir, {
      sent: {
        "run_complete|demo-run-001|demo checkpoint": {
          status: "sent",
        },
      },
    })

    const result = runHook(dir, fakeNotify)

    assert.equal(result.status, 0)
    assert.equal(fs.existsSync(logPath), false)
    assert.equal(fs.existsSync(pendingNotifyPath(dir)), false)
  })
}

function failedDeliveryKeepsPendingEvent() {
  withTempDir((dir) => {
    const fakeNotify = writeFakeNotify(dir, "process.exit(2)\n")
    writePendingNotify(dir, releaseEvent())

    const result = runHook(dir, fakeNotify)

    assert.equal(result.status, 0)
    assert.equal(fs.existsSync(pendingNotifyPath(dir)), true)
  })
}

const tests = [
  noPendingEventExitsQuietly,
  noPendingEventSendsStopNotificationWhenRequested,
  pendingEventIsSentAndDeduped,
  pendingPatchEventIsSentAndDeduped,
  duplicatePendingEventIsRemovedWithoutSending,
  failedDeliveryKeepsPendingEvent,
]

for (const test of tests) {
  test()
}

console.log(`codex-stop-notify tests passed (${tests.length})`)
