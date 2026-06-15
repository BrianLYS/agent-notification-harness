#!/usr/bin/env node

import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

const repoRoot = path.resolve(import.meta.dirname, "..")
const notifyImageScript = path.join(repoRoot, "scripts", "agent-notify-image.mjs")

function runNotifyImage(args, options = {}) {
  const cwd = options.cwd || repoRoot
  const env = {
    ...process.env,
    AGENT_NOTIFY_TELEGRAM_BOT_TOKEN: "",
    AGENT_NOTIFY_TELEGRAM_CHAT_ID: "",
    AGENT_NOTIFY_PREFIX: "",
    ...(options.env || {}),
  }
  return spawnSync(process.execPath, [notifyImageScript, ...args], {
    cwd,
    env,
    encoding: "utf8",
  })
}

function withTempDir(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-telegram-harness-image-"))
  try {
    return callback(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function writeMinimalPng(dir) {
  const filePath = path.join(dir, "image.png")
  fs.writeFileSync(
    filePath,
    Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049454e44ae426082",
      "hex",
    ),
  )
  return filePath
}

function dryRunUsesDefaultPrefix() {
  withTempDir((dir) => {
    const imagePath = writeMinimalPng(dir)
    const result = runNotifyImage(["--dry-run", imagePath, "Demo", "screenshot"], {
      cwd: dir,
    })

    assert.equal(result.status, 0)
    assert.match(result.stdout, /\[dry-run\] send image .*caption="Agent: Demo screenshot"/)
    assert.equal(result.stderr, "")
  })
}

function unconfiguredNotifySkipsSafely() {
  withTempDir((dir) => {
    const imagePath = writeMinimalPng(dir)
    const result = runNotifyImage([imagePath, "Demo screenshot"], { cwd: dir })

    assert.equal(result.status, 0)
    assert.match(result.stdout, /No notification target configured; skipped\./)
    assert.equal(result.stderr, "")
  })
}

function partialTelegramConfigFailsClearly() {
  withTempDir((dir) => {
    const imagePath = writeMinimalPng(dir)
    const result = runNotifyImage([imagePath, "Demo screenshot"], {
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

function localEnvFileIsLoadedForDryRun() {
  withTempDir((dir) => {
    const imagePath = writeMinimalPng(dir)
    fs.writeFileSync(
      path.join(dir, ".env.local"),
      [
        "AGENT_NOTIFY_TELEGRAM_BOT_TOKEN=dummy-token",
        "AGENT_NOTIFY_TELEGRAM_CHAT_ID=12345",
        "AGENT_NOTIFY_PREFIX=Local Prefix",
        "",
      ].join("\n"),
    )

    const result = runNotifyImage(["--dry-run", imagePath, "Demo screenshot"], {
      cwd: dir,
    })

    assert.equal(result.status, 0)
    assert.match(result.stdout, /caption="Local Prefix: Demo screenshot"/)
    assert.equal(result.stderr, "")
  })
}

function missingImageFailsClearly() {
  const result = withTempDir((dir) =>
    runNotifyImage(["missing.png", "Demo screenshot"], { cwd: dir }),
  )

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Image does not exist:/)
}

function missingPathShowsUsage() {
  const result = withTempDir((dir) => runNotifyImage([], { cwd: dir }))

  assert.equal(result.status, 1)
  assert.match(result.stdout, /Usage: agent-notify-image/)
}

const tests = [
  dryRunUsesDefaultPrefix,
  unconfiguredNotifySkipsSafely,
  partialTelegramConfigFailsClearly,
  localEnvFileIsLoadedForDryRun,
  missingImageFailsClearly,
  missingPathShowsUsage,
]

for (const test of tests) {
  test()
}

console.log(`agent-notify-image tests passed (${tests.length})`)
