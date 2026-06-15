#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(process.cwd())
const packageRoot = path.resolve(import.meta.dirname, "..")
const args = process.argv.slice(2)
const dryRun = takeFlag("--dry-run")
const skipAgents = takeFlag("--skip-agents")
const skipEnv = takeFlag("--skip-env")

const notificationScripts = {
  "agent:notify": "agent-notify",
  "agent:notify:image": "agent-notify-image",
  "agent:notify:media": "agent-notify-media",
  "agent:notify:stop": "codex-stop-notify",
}

const gitignoreEntries = [".env.local", ".agent-notifications/"]

const agentsSection = `## Notifications

Use the agent notification harness for completion messages and media handoff.

For text updates:

\`\`\`bash
npm run agent:notify -- "Short status message"
\`\`\`

For media artifacts, copy small shareable files into:

\`\`\`txt
.agent-notifications/artifacts/<task-slug>-<timestamp>/
\`\`\`

Prefer direct media files in that folder, such as:

- \`preview-start.png\`
- \`preview-mid.png\`
- \`preview-end.png\`
- \`rollout.mp4\`
- \`rollout.gif\`

Then run:

\`\`\`bash
npm run agent:notify:media
\`\`\`

Do not place secrets in the artifact folder. Keep \`.env.local\` and \`.agent-notifications/\` ignored by git.
`

function takeFlag(flag) {
  const index = args.indexOf(flag)
  if (index === -1) {
    return false
  }
  args.splice(index, 1)
  return true
}

function log(message) {
  console.log(dryRun ? `[dry-run] ${message}` : message)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function writeFile(filePath, contents) {
  if (!dryRun) {
    fs.writeFileSync(filePath, contents)
  }
}

function updatePackageScripts() {
  const packagePath = path.join(repoRoot, "package.json")
  if (!fs.existsSync(packagePath)) {
    throw new Error("package.json not found; run npm init before installing the harness.")
  }

  const packageJson = readJson(packagePath)
  packageJson.scripts ||= {}

  const added = []
  const kept = []
  for (const [name, command] of Object.entries(notificationScripts)) {
    if (!packageJson.scripts[name]) {
      packageJson.scripts[name] = command
      added.push(name)
    } else {
      kept.push(name)
    }
  }

  if (added.length > 0) {
    writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
    log(`updated package.json scripts: ${added.join(", ")}`)
  } else {
    log("package.json scripts already configured")
  }

  if (kept.length > 0) {
    log(`left existing package.json scripts unchanged: ${kept.join(", ")}`)
  }
}

function updateGitignore() {
  const gitignorePath = path.join(repoRoot, ".gitignore")
  const existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : ""
  const lines = existing.split(/\r?\n/)
  const missing = gitignoreEntries.filter((entry) => !lines.includes(entry))

  if (missing.length === 0) {
    log(".gitignore already includes notification entries")
    return
  }

  const prefix = existing && !existing.endsWith("\n") ? "\n" : ""
  const block = `${prefix}${missing.join("\n")}\n`
  writeFile(gitignorePath, `${existing}${block}`)
  log(`updated .gitignore: ${missing.join(", ")}`)
}

function copyEnvExample() {
  if (skipEnv) {
    log("skipped .env.local setup")
    return
  }

  const envPath = path.join(repoRoot, ".env.local")
  if (fs.existsSync(envPath)) {
    log(".env.local already exists")
    return
  }

  const sourcePath = path.join(packageRoot, ".env.example")
  const contents = fs.readFileSync(sourcePath, "utf8")
  writeFile(envPath, contents)
  log("created .env.local from .env.example")
}

function updateAgentsFile() {
  if (skipAgents) {
    log("skipped AGENTS.md setup")
    return
  }

  const agentsPath = path.join(repoRoot, "AGENTS.md")
  const existing = fs.existsSync(agentsPath)
    ? fs.readFileSync(agentsPath, "utf8")
    : "# Repository Guidelines\n"

  if (
    existing.includes("agent notification harness") ||
    existing.includes(".agent-notifications/artifacts/")
  ) {
    log("AGENTS.md already includes notification guidance")
    return
  }

  const separator = existing.endsWith("\n") ? "\n" : "\n\n"
  writeFile(agentsPath, `${existing}${separator}${agentsSection}`)
  log("updated AGENTS.md with notification guidance")
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: agent-notification-harness-init [--dry-run] [--skip-agents] [--skip-env]

Configures the current repository for agent-notification-harness:
  - adds package.json scripts
  - creates .env.local from .env.example when absent
  - ignores .env.local and .agent-notifications/
  - adds AGENTS.md artifact-handoff guidance
`)
  process.exit(0)
}

updatePackageScripts()
copyEnvExample()
updateGitignore()
updateAgentsFile()
log("agent notification harness setup complete")
