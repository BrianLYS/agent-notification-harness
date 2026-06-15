#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

const localEnv = readLocalEnv(path.join(process.cwd(), ".env.local"))
const telegramBotToken = env("AGENT_NOTIFY_TELEGRAM_BOT_TOKEN")
const telegramChatId = env("AGENT_NOTIFY_TELEGRAM_CHAT_ID")
const prefix = env("AGENT_NOTIFY_PREFIX") || "Agent"
const dryRun = process.argv.includes("--dry-run")
const message = process.argv
  .slice(2)
  .filter((arg) => arg !== "--dry-run")
  .join(" ")
  .trim()

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
  console.log(`Usage: agent-notify [--dry-run] <message>

Environment:
  AGENT_NOTIFY_TELEGRAM_BOT_TOKEN  Telegram bot token from BotFather
  AGENT_NOTIFY_TELEGRAM_CHAT_ID    Telegram chat id to notify
  AGENT_NOTIFY_PREFIX              Optional message prefix, default: Agent

Local env:
  These variables may also be stored in ignored .env.local at the repo root.

Examples:
  npm run agent:notify -- "Run complete"
  npm run agent:notify -- --dry-run "Check passed"
`)
}

function notificationText() {
  const text = `${prefix}: ${message}`
  const maxTelegramMessageLength = 4096
  if (text.length <= maxTelegramMessageLength) {
    return text
  }
  return `${text.slice(0, maxTelegramMessageLength - 15)}... [truncated]`
}

async function sendTelegram(text) {
  const response = await fetch(
    `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
        disable_web_page_preview: true,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram notify failed: HTTP ${response.status} ${body}`)
  }
}

if (!message || process.argv.includes("--help") || process.argv.includes("-h")) {
  usage()
  process.exit(message ? 0 : 1)
}

if (dryRun) {
  console.log(`[dry-run] ${notificationText()}`)
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

await sendTelegram(notificationText())
console.log("Telegram notification sent.")
