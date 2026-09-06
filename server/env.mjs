import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')

export function loadEnv() {
  const path = join(rootDir, '.env')
  if (!existsSync(path)) return process.env
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i < 1) continue
    const key = trimmed.slice(0, i).trim()
    let value = trimmed.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value
  }
  return process.env
}

export function publicUrl() {
  return (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '')
}

export function originFromRequest(c) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '')
  const url = new URL(c.req.url)
  const proto = (c.req.header('x-forwarded-proto') || url.protocol.replace(':', ''))
    .split(',')[0]
    .trim()
  const host = (c.req.header('x-forwarded-host') || c.req.header('host') || url.host)
    .split(',')[0]
    .trim()
  return `${proto}://${host}`
}

export function discordConfigured() {
  return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET)
}

export function battlenetConfigured() {
  return Boolean(process.env.BATTLENET_CLIENT_ID && process.env.BATTLENET_CLIENT_SECRET)
}

export function demoEnabled(provider) {
  if (process.env.AUTH_DEMO === '1') return true
  if (process.env.AUTH_DEMO === '0') return false
  if (process.env.NODE_ENV === 'production') return false
  if (provider === 'discord') return !discordConfigured()
  if (provider === 'battlenet') return !battlenetConfigured()
  return false
}

export function providers() {
  return {
    discord: discordConfigured(),
    battlenet: battlenetConfigured(),
    demo: {
      discord: demoEnabled('discord'),
      battlenet: demoEnabled('battlenet'),
    },
  }
}

export function leadDiscordIds() {
  return (process.env.LEAD_DISCORD_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function leadBattlenetIds() {
  return (process.env.LEAD_BATTLENET_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
