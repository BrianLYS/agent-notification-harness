#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { notifyQueueDir } from "./agent-notify-queue.mjs"

const args = process.argv.slice(2)
const dryRun = takeFlag("--dry-run")
const force = takeFlag("--force")
const explicitDir = takeOption("--dir")
const explicitRoot = takeOption("--root")
const repoRoot = path.resolve(
  process.env.AGENT_NOTIFY_REPO_ROOT || process.cwd()
)
const localEnv = readLocalEnv(path.join(repoRoot, ".env.local"))
const telegramBotToken = env("AGENT_NOTIFY_TELEGRAM_BOT_TOKEN")
const telegramChatId = env("AGENT_NOTIFY_TELEGRAM_CHAT_ID")
const prefix = env("AGENT_NOTIFY_PREFIX") || "Agent"
const queueDir = notifyQueueDir(repoRoot, {
  ...process.env,
  AGENT_NOTIFY_QUEUE_DIR: env("AGENT_NOTIFY_QUEUE_DIR"),
})
const mediaRoot =
  explicitRoot ||
  env("AGENT_NOTIFY_MEDIA_ROOT") ||
  path.join(queueDir, "artifacts")
const mediaDir = explicitDir || env("AGENT_NOTIFY_MEDIA_DIR") || ""

const mediaExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
])

function takeFlag(flag) {
  const index = args.indexOf(flag)
  if (index === -1) {
    return false
  }
  args.splice(index, 1)
  return true
}

function takeOption(flag) {
  const index = args.indexOf(flag)
  if (index === -1) {
    return ""
  }
  const value = args[index + 1] || ""
  args.splice(index, 2)
  return value
}

function env(name) {
  return process.env[name] || localEnv[name] || ""
}

function readLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const equalsIndex = line.indexOf("=")
        if (equalsIndex === -1) {
          return null
        }
        const key = line.slice(0, equalsIndex).trim()
        const value = line
          .slice(equalsIndex + 1)
          .trim()
          .replace(/^["']|["']$/g, "")
        return key ? [key, value] : null
      })
      .filter(Boolean)
  )
}

function usage() {
  console.log(`Usage: agent-notify-media [--dry-run] [--force] [--dir <media-dir> | --root <search-root>]

Sends PNG/JPG/WebP images and GIF/MP4 animations from the newest media folder.

Options:
  --dry-run  Print selected media without sending
  --force    Send even if the same media manifest was already sent

Environment:
  AGENT_NOTIFY_TELEGRAM_BOT_TOKEN  Telegram bot token from BotFather
  AGENT_NOTIFY_TELEGRAM_CHAT_ID    Telegram chat id to notify
  AGENT_NOTIFY_PREFIX              Optional caption prefix, default: Agent
  AGENT_NOTIFY_MEDIA_DIR           Explicit media directory to send
  AGENT_NOTIFY_MEDIA_ROOT          Root to search for the newest media directory

Default search root:
  .agent-notifications/artifacts
`)
}

function isMediaFile(filePath) {
  return mediaExtensions.has(path.extname(filePath).toLowerCase())
}

function mediaSortKey(filePath) {
  const name = path.basename(filePath).toLowerCase()
  const preferred = [
    "preview-start.png",
    "preview-mid.png",
    "preview-end.png",
    "rollout.mp4",
    "rollout.gif",
  ]
  const index = preferred.indexOf(name)
  return index === -1 ? `${preferred.length}:${name}` : `${index}:${name}`
}

function sortMediaFiles(files) {
  return files.sort((a, b) => mediaSortKey(a).localeCompare(mediaSortKey(b)))
}

function preferMp4Animations(files) {
  const mp4Stems = new Set(
    files
      .filter((file) => path.extname(file).toLowerCase() === ".mp4")
      .map((file) => path.join(path.dirname(file), path.basename(file, ".mp4")))
  )
  return files.filter((file) => {
    if (path.extname(file).toLowerCase() !== ".gif") {
      return true
    }
    return !mp4Stems.has(path.join(path.dirname(file), path.basename(file, ".gif")))
  })
}

function directMediaFiles(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return []
  }
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
    .filter(isMediaFile)
  return sortMediaFiles(preferMp4Animations(files))
}

function findMediaDirs(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return []
  }

  const result = []
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const mediaFiles = entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(dir, entry.name))
      .filter(isMediaFile)
    if (mediaFiles.length > 0) {
      const newestMtime = Math.max(
        ...mediaFiles.map((file) => fs.statSync(file).mtimeMs)
      )
      result.push({ dir, mediaFiles, newestMtime })
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(path.join(dir, entry.name))
      }
    }
  }
  return result
}

function latestMediaDir(root) {
  return findMediaDirs(root).sort((a, b) => b.newestMtime - a.newestMtime)[0] || null
}

function fileHash(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

function mediaManifest(dir, files) {
  return {
    schema_version: "agent_notify.media_manifest.v1",
    dir: path.relative(repoRoot, dir),
    files: files.map((file) => {
      const stat = fs.statSync(file)
      return {
        name: path.basename(file),
        path: path.relative(repoRoot, file),
        size_bytes: stat.size,
        sha256: fileHash(file),
      }
    }),
  }
}

function mediaManifestHash(manifest) {
  const hash = createHash("sha256")
  hash.update(JSON.stringify(manifest))
  return hash.digest("hex")
}

function mediaEventId(manifestHash) {
  return `media|${manifestHash.slice(0, 24)}`
}

function mediaStatePath() {
  return path.join(queueDir, "media-sent.json")
}

function readMediaState() {
  const filePath = mediaStatePath()
  if (!fs.existsSync(filePath)) {
    return { schema_version: "agent_notify.media_state.v1", sent: {}, dirs: {} }
  }
  try {
    const state = JSON.parse(fs.readFileSync(filePath, "utf8"))
    return {
      schema_version: state.schema_version || "agent_notify.media_state.v1",
      sent: state.sent || {},
      dirs: state.dirs || {},
    }
  } catch {
    return { schema_version: "agent_notify.media_state.v1", sent: {}, dirs: {} }
  }
}

function writeMediaState(state) {
  const filePath = mediaStatePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`)
}

function artifactStatePath(dir) {
  return path.join(dir, ".telegram-media-sent.json")
}

function readArtifactState(dir) {
  const filePath = artifactStatePath(dir)
  if (!fs.existsSync(filePath)) {
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return null
  }
}

function writeArtifactState(dir, entry) {
  fs.writeFileSync(artifactStatePath(dir), `${JSON.stringify(entry, null, 2)}\n`)
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg"
  }
  if (extension === ".webp") {
    return "image/webp"
  }
  if (extension === ".gif") {
    return "image/gif"
  }
  if (extension === ".mp4") {
    return "video/mp4"
  }
  return "image/png"
}

function captionFor(filePath, index, total, dir) {
  const folder = path.basename(dir)
  const text = `${prefix}: ${folder} ${index + 1}/${total} ${path.basename(filePath)}`
  const maxTelegramCaptionLength = 1024
  if (text.length <= maxTelegramCaptionLength) {
    return text
  }
  return `${text.slice(0, maxTelegramCaptionLength - 15)}... [truncated]`
}

async function sendTelegramMedia(filePath, caption) {
  const extension = path.extname(filePath).toLowerCase()
  const isAnimation = extension === ".gif" || extension === ".mp4"
  const form = new FormData()
  form.append("chat_id", telegramChatId)
  form.append("caption", caption)
  form.append(
    isAnimation ? "animation" : "photo",
    new Blob([fs.readFileSync(filePath)], { type: mimeTypeFor(filePath) }),
    path.basename(filePath)
  )

  const method = isAnimation ? "sendAnimation" : "sendPhoto"
  const response = await fetch(
    `https://api.telegram.org/bot${telegramBotToken}/${method}`,
    {
      method: "POST",
      body: form,
    }
  )
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram media notify failed: HTTP ${response.status} ${body}`)
  }
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage()
  process.exit(0)
}

const selectedDir = mediaDir
  ? { dir: path.resolve(mediaDir), mediaFiles: directMediaFiles(path.resolve(mediaDir)) }
  : latestMediaDir(path.resolve(mediaRoot))

if (!selectedDir || selectedDir.mediaFiles.length === 0) {
  console.log("No media folder found; skipped.")
  process.exit(0)
}

const files = directMediaFiles(selectedDir.dir)
const manifest = mediaManifest(selectedDir.dir, files)
const manifestHash = mediaManifestHash(manifest)
const eventId = mediaEventId(manifestHash)
const dirKey = path.relative(repoRoot, selectedDir.dir)
const state = readMediaState()
const artifactState = readArtifactState(selectedDir.dir)
const sentInState =
  state.sent[eventId] ||
  state.dirs[dirKey]?.manifest_hash === manifestHash
const sentInArtifact = artifactState?.manifest_hash === manifestHash
if (!force && (sentInState || sentInArtifact)) {
  console.log(`Agent media already sent: ${path.relative(repoRoot, selectedDir.dir)}`)
  process.exit(0)
}

if (dryRun) {
  for (const [index, file] of files.entries()) {
    console.log(
      `[dry-run] send media ${file} caption="${captionFor(file, index, files.length, selectedDir.dir)}"`
    )
  }
  process.exit(0)
}

if (!telegramBotToken && !telegramChatId) {
  console.log("No notification target configured; media skipped.")
  process.exit(0)
}

if (!telegramBotToken || !telegramChatId) {
  throw new Error(
    "Telegram notification is partially configured; set both AGENT_NOTIFY_TELEGRAM_BOT_TOKEN and AGENT_NOTIFY_TELEGRAM_CHAT_ID."
  )
}

for (const [index, file] of files.entries()) {
  await sendTelegramMedia(file, captionFor(file, index, files.length, selectedDir.dir))
}

const sentEntry = {
  schema_version: "agent_notify.media_sent.v1",
  status: "sent",
  event_id: eventId,
  dir: dirKey,
  manifest_hash: manifestHash,
  manifest,
  sent_at: new Date().toISOString(),
}
state.sent[eventId] = sentEntry
state.dirs[dirKey] = {
  status: sentEntry.status,
  event_id: sentEntry.event_id,
  manifest_hash: sentEntry.manifest_hash,
  sent_at: sentEntry.sent_at,
}
writeMediaState(state)
writeArtifactState(selectedDir.dir, sentEntry)
console.log(
  `Telegram media notification sent: ${path.relative(repoRoot, selectedDir.dir)}`
)
