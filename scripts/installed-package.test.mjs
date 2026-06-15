#!/usr/bin/env node

import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

const repoRoot = path.resolve(import.meta.dirname, "..")

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
  })
}

function withTempDir(callback) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-notification-harness-installed-")
  )
  try {
    return callback(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function installedPackageBinsWork() {
  withTempDir((dir) => {
    assert.equal(run("npm", ["init", "-y"], { cwd: dir }).status, 0)
    const install = run("npm", ["install", "--save-dev", repoRoot], { cwd: dir })
    assert.equal(install.status, 0, install.stderr)

    const binDir = path.join(dir, "node_modules", ".bin")
    const init = run(path.join(binDir, "agent-notification-harness-init"), [], {
      cwd: dir,
    })
    assert.equal(init.status, 0, init.stderr)

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8")
    )
    assert.equal(packageJson.scripts["agent:notify"], "agent-notify")
    assert.match(
      fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"),
      /\.agent-notifications\/artifacts/
    )

    const mediaDir = path.join(dir, ".agent-notifications", "artifacts", "demo")
    fs.mkdirSync(mediaDir, { recursive: true })
    fs.writeFileSync(path.join(mediaDir, "preview-start.png"), "media")

    const text = run(path.join(binDir, "agent-notify"), ["--dry-run", "install smoke"], {
      cwd: dir,
    })
    assert.equal(text.status, 0, text.stderr)
    assert.match(text.stdout, /\[dry-run\] Agent: install smoke/)

    const media = run(path.join(binDir, "agent-notify-media"), ["--dry-run"], {
      cwd: dir,
    })
    assert.equal(media.status, 0, media.stderr)
    assert.match(media.stdout, /preview-start\.png/)

    const stop = run(path.join(binDir, "codex-stop-notify"), ["--verbose"], {
      cwd: dir,
    })
    assert.equal(stop.status, 0, stop.stderr)
    assert.match(stop.stdout, /No pending Agent notification/)
  })
}

installedPackageBinsWork()

console.log("installed-package tests passed (1)")
