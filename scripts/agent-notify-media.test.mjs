#!/usr/bin/env node

import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

const repoRoot = path.resolve(import.meta.dirname, "..")
const notifyMediaScript = path.join(repoRoot, "scripts", "agent-notify-media.mjs")

function runNotifyMedia(args, options = {}) {
  const cwd = options.cwd || repoRoot
  const env = {
    ...process.env,
    AGENT_NOTIFY_TELEGRAM_BOT_TOKEN: "",
    AGENT_NOTIFY_TELEGRAM_CHAT_ID: "",
    AGENT_NOTIFY_PREFIX: "",
    AGENT_NOTIFY_MEDIA_ROOT: "",
    AGENT_NOTIFY_MEDIA_DIR: "",
    AGENT_NOTIFY_QUEUE_DIR: "",
    AGENT_NOTIFY_REPO_ROOT: cwd,
    ...(options.env || {}),
  }
  return spawnSync(process.execPath, [notifyMediaScript, ...args], {
    cwd,
    env,
    encoding: "utf8",
  })
}

function withTempDir(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-telegram-harness-media-"))
  try {
    return callback(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function writeMedia(filePath, contents = "media") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

function dryRunUsesNewestMediaFolder() {
  withTempDir((dir) => {
    const oldDir = path.join(dir, "artifacts", "old")
    const latestDir = path.join(dir, "artifacts", "latest")
    writeMedia(path.join(oldDir, "rollout.gif"), "old")
    writeMedia(path.join(latestDir, "preview.png"), "latest")
    const oldTime = new Date("2026-01-01T00:00:00Z")
    const latestTime = new Date("2026-01-02T00:00:00Z")
    fs.utimesSync(path.join(oldDir, "rollout.gif"), oldTime, oldTime)
    fs.utimesSync(path.join(latestDir, "preview.png"), latestTime, latestTime)

    const result = runNotifyMedia(["--dry-run"], { cwd: dir })

    assert.equal(result.status, 0)
    assert.match(result.stdout, /latest[/\\]preview\.png/)
    assert.doesNotMatch(result.stdout, /old[/\\]rollout\.gif/)
    assert.equal(result.stderr, "")
  })
}

function explicitDirSendsAllDirectMedia() {
  withTempDir((dir) => {
    const mediaDir = path.join(dir, "media")
    writeMedia(path.join(mediaDir, "a.png"))
    writeMedia(path.join(mediaDir, "b.gif"))
    writeMedia(path.join(mediaDir, "ignore.txt"))

    const result = runNotifyMedia(["--dry-run", "--dir", mediaDir], { cwd: dir })

    assert.equal(result.status, 0)
    assert.match(result.stdout, /a\.png/)
    assert.match(result.stdout, /b\.gif/)
    assert.doesNotMatch(result.stdout, /ignore\.txt/)
  })
}

function previewFramesAreSentInRolloutOrder() {
  withTempDir((dir) => {
    const mediaDir = path.join(dir, "media")
    writeMedia(path.join(mediaDir, "rollout.gif"))
    writeMedia(path.join(mediaDir, "rollout.mp4"))
    writeMedia(path.join(mediaDir, "preview-end.png"))
    writeMedia(path.join(mediaDir, "preview-start.png"))
    writeMedia(path.join(mediaDir, "preview-mid.png"))

    const result = runNotifyMedia(["--dry-run", "--dir", mediaDir], { cwd: dir })

    assert.equal(result.status, 0)
    const lines = result.stdout.trim().split(/\r?\n/)
    assert.match(lines[0], /preview-start\.png/)
    assert.match(lines[1], /preview-mid\.png/)
    assert.match(lines[2], /preview-end\.png/)
    assert.match(lines[3], /rollout\.mp4/)
    assert.doesNotMatch(result.stdout, /rollout\.gif/)
  })
}

function unconfiguredNotifySkipsSafely() {
  withTempDir((dir) => {
    const mediaDir = path.join(dir, "media")
    writeMedia(path.join(mediaDir, "a.png"))

    const result = runNotifyMedia(["--dir", mediaDir], { cwd: dir })

    assert.equal(result.status, 0)
    assert.match(result.stdout, /No notification target configured; media skipped\./)
  })
}

function successfulSendIsDeduped() {
  withTempDir((dir) => {
    const mediaDir = path.join(dir, "media")
    const fetchLog = path.join(dir, "fetch-log.jsonl")
    const queueDir = path.join(dir, ".notify")
    writeMedia(path.join(mediaDir, "a.png"))
    writeMedia(path.join(mediaDir, "b.gif"))
    writeMedia(path.join(mediaDir, "b.mp4"))
    const env = {
      AGENT_NOTIFY_TELEGRAM_BOT_TOKEN: "dummy-token",
      AGENT_NOTIFY_TELEGRAM_CHAT_ID: "123",
      AGENT_NOTIFY_PREFIX: "Test",
      AGENT_NOTIFY_QUEUE_DIR: queueDir,
      NODE_OPTIONS: `--import ${path.join(dir, "fetch-stub.mjs")}`,
    }
    fs.writeFileSync(
      path.join(dir, "fetch-stub.mjs"),
      [
        'import fs from "node:fs"',
        `const logPath = ${JSON.stringify(fetchLog)}`,
        "globalThis.fetch = (url, options) => {",
        "  fs.appendFileSync(logPath, JSON.stringify({ url: String(url), method: options?.method || 'GET' }) + '\\n')",
        "  return Promise.resolve(new Response('{\"ok\":true}', { status: 200, headers: { 'content-type': 'application/json' } }))",
        "}",
        "",
      ].join("\n")
    )

    const first = runNotifyMedia(["--dir", mediaDir], { cwd: dir, env })
    const second = runNotifyMedia(["--dir", mediaDir], { cwd: dir, env })
    fs.rmSync(queueDir, { recursive: true, force: true })
    const dedupedByArtifactMarker = runNotifyMedia(["--dir", mediaDir], {
      cwd: dir,
      env,
    })

    assert.equal(first.status, 0)
    assert.match(first.stdout, /Telegram media notification sent/)
    assert.equal(second.status, 0)
    assert.match(second.stdout, /Agent media already sent/)
    assert.equal(dedupedByArtifactMarker.status, 0)
    assert.match(dedupedByArtifactMarker.stdout, /Agent media already sent/)
    const marker = JSON.parse(
      fs.readFileSync(path.join(mediaDir, ".telegram-media-sent.json"), "utf8")
    )
    assert.equal(marker.status, "sent")
    assert.equal(marker.manifest.files.length, 2)
    const requests = fs
      .readFileSync(fetchLog, "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line).url)
      .sort()
    assert.deepEqual(requests, [
      "https://api.telegram.org/botdummy-token/sendAnimation",
      "https://api.telegram.org/botdummy-token/sendPhoto",
    ])
  })
}

const tests = [
  dryRunUsesNewestMediaFolder,
  explicitDirSendsAllDirectMedia,
  previewFramesAreSentInRolloutOrder,
  unconfiguredNotifySkipsSafely,
]

for (const test of tests) {
  test()
}

successfulSendIsDeduped()

console.log(`agent-notify-media tests passed (${tests.length + 1})`)
