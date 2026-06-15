#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

const localEnv = readLocalEnv(path.join(process.cwd(), ".env.local"))
const telegramBotToken = env("AGENT_NOTIFY_TELEGRAM_BOT_TOKEN")
const telegramChatId = env("AGENT_NOTIFY_TELEGRAM_CHAT_ID")
const prefix = env("AGENT_NOTIFY_PREFIX") || "Agent"
const dryRun = process.argv.includes("--dry-run")
const args = process.argv.slice(2).filter((arg) => arg !== "--dry-run")
const imagePath = args[0] ? path.resolve(args[0]) : ""
const caption = args.slice(1).join(" ").trim()

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
      .filter(Boolean),
  )
}

function usage() {
  console.log(`Usage: agent-notify-image [--dry-run] <image-path> [caption]

Environment:
  AGENT_NOTIFY_TELEGRAM_BOT_TOKEN  Telegram bot token from BotFather
  AGENT_NOTIFY_TELEGRAM_CHAT_ID    Telegram chat id to notify
  AGENT_NOTIFY_PREFIX              Optional caption prefix, default: Agent

Local env:
  These variables may also be stored in ignored .env.local at the repo root.

Examples:
  npm run agent:notify:image -- /tmp/agent-demo.png "Demo"
  npm run agent:notify:image -- --dry-run /tmp/agent-demo.png "Demo"
`)
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg"
  }
  if (extension === ".webp") {
    return "image/webp"
  }
  return "image/png"
}

function notificationCaption() {
  const text = `${prefix}: ${caption || path.basename(imagePath)}`
  const maxTelegramCaptionLength = 1024
  if (text.length <= maxTelegramCaptionLength) {
    return text
  }
  return `${text.slice(0, maxTelegramCaptionLength - 15)}... [truncated]`
}

function validateImagePath() {
  if (!imagePath) {
    usage()
    process.exit(1)
  }
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image does not exist: ${imagePath}`)
  }
  if (!fs.statSync(imagePath).isFile()) {
    throw new Error(`Image path is not a file: ${imagePath}`)
  }
}

async function sendTelegramPhoto() {
  const form = new FormData()
  form.append("chat_id", telegramChatId)
  form.append("caption", notificationCaption())
  form.append(
    "photo",
    new Blob([fs.readFileSync(imagePath)], { type: mimeTypeFor(imagePath) }),
    path.basename(imagePath),
  )

  const response = await fetch(
    `https://api.telegram.org/bot${telegramBotToken}/sendPhoto`,
    {
      method: "POST",
      body: form,
    },
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram image notify failed: HTTP ${response.status} ${body}`)
  }
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage()
  process.exit(0)
}

validateImagePath()

if (dryRun) {
  console.log(`[dry-run] send image ${imagePath} caption="${notificationCaption()}"`)
  process.exit(0)
}

if (!telegramBotToken && !telegramChatId) {
  console.log("No notification target configured; skipped.")
  process.exit(0)
}

if (!telegramBotToken || !telegramChatId) {
  throw new Error(
    "Telegram notification is partially configured; set both AGENT_NOTIFY_TELEGRAM_BOT_TOKEN and AGENT_NOTIFY_TELEGRAM_CHAT_ID.",
  )
}

await sendTelegramPhoto()
console.log("Telegram image notification sent.")
