#!/usr/bin/env node

import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

const repoRoot = path.resolve(import.meta.dirname, "..")
const notifyScript = path.join(repoRoot, "scripts", "agent-notify.mjs")

function runNotify(args, options = {}) {
  const cwd = options.cwd || repoRoot
  const env = {
    ...process.env,
    AGENT_NOTIFY_TELEGRAM_BOT_TOKEN: "",
    AGENT_NOTIFY_TELEGRAM_CHAT_ID: "",
    AGENT_NOTIFY_PREFIX: "",
    ...(options.env || {}),
  }
  return spawnSync(process.execPath, [notifyScript, ...args], {
    cwd,
    env,
    encoding: "utf8",
  })
}

function withTempDir(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-notification-harness-"))
  try {
    return callback(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function dryRunUsesDefaultPrefix() {
  withTempDir((dir) => {
    const result = runNotify(["--dry-run", "Release", "complete"], {
      cwd: dir,
    })

    assert.equal(result.status, 0)
    assert.match(result.stdout, /\[dry-run\] Agent: Release complete/)
    assert.equal(result.stderr, "")
  })
}

function unconfiguredNotifySkipsSafely() {
  withTempDir((dir) => {
    const result = runNotify(["Release", "complete"], { cwd: dir })

    assert.equal(result.status, 0)
    assert.match(result.stdout, /No notification target configured; skipped\./)
    assert.equal(result.stderr, "")
  })
}

function partialTelegramConfigFailsClearly() {
  withTempDir((dir) => {
    const result = runNotify(["Release", "complete"], {
      cwd: dir,
      env: { AGENT_NOTIFY_TELEGRAM_BOT_TOKEN: "dummy-token" },
    })

    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /set both AGENT_NOTIFY_TELEGRAM_BOT_TOKEN and AGENT_NOTIFY_TELEGRAM_CHAT_ID/,
    )
  })
}

function localEnvFileIsLoaded() {
  withTempDir((dir) => {
    fs.writeFileSync(
      path.join(dir, ".env.local"),
      [
        "AGENT_NOTIFY_TELEGRAM_BOT_TOKEN=dummy-token",
        "AGENT_NOTIFY_TELEGRAM_CHAT_ID=12345",
        "AGENT_NOTIFY_PREFIX=Local Prefix",
        "",
      ].join("\n"),
    )

    const result = runNotify(["--dry-run", "Release", "complete"], { cwd: dir })

    assert.equal(result.status, 0)
    assert.match(result.stdout, /\[dry-run\] Local Prefix: Release complete/)
    assert.equal(result.stderr, "")
  })
}

function missingMessageShowsUsage() {
  const result = withTempDir((dir) => runNotify([], { cwd: dir }))

  assert.equal(result.status, 1)
  assert.match(result.stdout, /Usage: agent-notify/)
}

const tests = [
  dryRunUsesDefaultPrefix,
  unconfiguredNotifySkipsSafely,
  partialTelegramConfigFailsClearly,
  localEnvFileIsLoaded,
  missingMessageShowsUsage,
]

for (const test of tests) {
  test()
}

console.log(`agent-notify tests passed (${tests.length})`)
