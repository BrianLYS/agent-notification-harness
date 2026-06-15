#!/usr/bin/env node

import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

const repoRoot = path.resolve(import.meta.dirname, "..")
const initScript = path.join(repoRoot, "scripts", "agent-notification-init.mjs")

function withTempDir(callback) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-notification-harness-init-")
  )
  try {
    return callback(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function runInit(dir, args = []) {
  return spawnSync(process.execPath, [initScript, ...args], {
    cwd: dir,
    env: {
      ...process.env,
      AGENT_NOTIFY_TELEGRAM_BOT_TOKEN: "",
      AGENT_NOTIFY_TELEGRAM_CHAT_ID: "",
    },
    encoding: "utf8",
  })
}

function writePackageJson(dir, scripts = {}) {
  fs.writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify({ name: "consumer", version: "0.0.0", scripts }, null, 2)}\n`
  )
}

function setupAddsRepoFiles() {
  withTempDir((dir) => {
    writePackageJson(dir)

    const result = runInit(dir)

    assert.equal(result.status, 0)
    assert.match(result.stdout, /updated package\.json scripts/)
    assert.match(result.stdout, /created \.env\.local/)
    assert.match(result.stdout, /updated \.gitignore/)
    assert.match(result.stdout, /updated AGENTS\.md/)

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8")
    )
    assert.equal(packageJson.scripts["agent:notify"], "agent-notify")
    assert.equal(packageJson.scripts["agent:notify:media"], "agent-notify-media")
    assert.match(
      fs.readFileSync(path.join(dir, ".env.local"), "utf8"),
      /AGENT_NOTIFY_TELEGRAM_BOT_TOKEN=/
    )
    assert.match(fs.readFileSync(path.join(dir, ".gitignore"), "utf8"), /\.env\.local/)
    assert.match(
      fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"),
      /\.agent-notifications\/artifacts/
    )
  })
}

function setupIsIdempotent() {
  withTempDir((dir) => {
    writePackageJson(dir, { "agent:notify": "custom-notify" })

    const first = runInit(dir)
    const second = runInit(dir)

    assert.equal(first.status, 0)
    assert.equal(second.status, 0)
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8")
    )
    assert.equal(packageJson.scripts["agent:notify"], "custom-notify")
    const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8")
    assert.equal((agents.match(/## Notifications/g) || []).length, 1)
    const gitignore = fs.readFileSync(path.join(dir, ".gitignore"), "utf8")
    assert.equal((gitignore.match(/\.agent-notifications\//g) || []).length, 1)
  })
}

function dryRunDoesNotWrite() {
  withTempDir((dir) => {
    writePackageJson(dir)

    const result = runInit(dir, ["--dry-run"])

    assert.equal(result.status, 0)
    assert.equal(fs.existsSync(path.join(dir, ".env.local")), false)
    assert.equal(fs.existsSync(path.join(dir, ".gitignore")), false)
    assert.equal(fs.existsSync(path.join(dir, "AGENTS.md")), false)
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8")
    )
    assert.deepEqual(packageJson.scripts, {})
  })
}

const tests = [setupAddsRepoFiles, setupIsIdempotent, dryRunDoesNotWrite]

for (const test of tests) {
  test()
}

console.log(`agent-notification-init tests passed (${tests.length})`)
