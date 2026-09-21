import { app } from '../server/app.mjs'
import { safeNextPath, safeRaidId } from '../server/security.mjs'
import { normalizeDiscordUrl } from '../server/store.mjs'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

assert(safeNextPath('https://evil.com') === '/', 'url next')
assert(safeNextPath('//evil.com') === '/', 'protocol relative')
assert(safeNextPath('/\\evil.com') === '/', 'backslash')
assert(safeNextPath('/api/raids') === '/', 'api next')
assert(safeNextPath('/r/r_abc-def') === '/r/r_abc-def', 'good raid path')
assert(safeRaidId('../etc/passwd') === null, 'path id')
assert(safeRaidId('r_123') === 'r_123', 'ok id')
assert(normalizeDiscordUrl('discord.gg/raidnight') === 'https://discord.gg/raidnight', 'gg short')
assert(normalizeDiscordUrl('https://discord.com/invite/raidnight').includes('discord.com/invite/raidnight'), 'invite')
assert(normalizeDiscordUrl('') === '', 'empty discord')
let discordBlocked = false
try {
  normalizeDiscordUrl('https://evil.example/discord')
} catch (err) {
  discordBlocked = err.status === 400
}
assert(discordBlocked, 'block non-discord')

const leak = await app.request('/api/raid')
assert(leak.status === 404, `raid leak ${leak.status}`)

const create = await app.request('/api/raids', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
})
assert(create.status === 401, `create auth ${create.status}`)

const csrf = await app.request('/api/auth/logout', {
  method: 'POST',
  headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
})
assert(csrf.status === 403, `csrf ${csrf.status}`)

const health = await app.request('/api/health')
const csp = health.headers.get('content-security-policy') || ''
assert(health.headers.get('x-frame-options') === 'DENY', 'frame')
assert(health.headers.get('x-content-type-options') === 'nosniff', 'nosniff')
assert(csp.includes("frame-ancestors 'none'"), `csp frame ${csp}`)

const big = await app.request('/api/raids', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: 'x'.repeat(40 * 1024),
})
assert(big.status === 413, `body limit ${big.status}`)

console.log('security checks ok')
