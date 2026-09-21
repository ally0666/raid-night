import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { demoEnabled, leadBattlenetIds, leadDiscordIds, rootDir } from './env.mjs'
import { INSTANCES, raidMeta, ROLES, WOW_CLASSES } from './seed.mjs'

const MAX_CHARACTERS = 24
const MAX_RAIDS = 40
const MAX_ROSTER = 80

const dataDir = process.env.DATA_DIR || join(rootDir, 'data')
const storePath = join(dataDir, 'store.json')
const secretPath = join(dataDir, 'session-secret')

function emptyData() {
  return {
    users: {},
    characters: {},
    sessions: {},
    oauthStates: {},
    raids: {},
  }
}

export function instanceById(id) {
  return INSTANCES.find((row) => row.id === id) || null
}

function defaultKara(signups = {}, locked = false, manualRoster = []) {
  return {
    id: 'kara-night',
    instanceId: 'karazhan',
    name: raidMeta.name,
    when: raidMeta.when,
    dateLabel: raidMeta.dateLabel,
    size: raidMeta.size,
    pickLimit: raidMeta.pickLimit,
    lockLabel: raidMeta.lockLabel,
    locked,
    signups,
    manualRoster,
    createdBy: null,
  }
}

export function ensureRaids(data) {
  if (!data.raids) data.raids = {}
  if (data.raid && Object.keys(data.raids).length === 0) {
    const signups = data.raid.signups || {}
    if (data.raid.createdBy || Object.keys(signups).length) {
      data.raids['kara-night'] = defaultKara(
        signups,
        Boolean(data.raid.locked),
        Array.isArray(data.raid.manualRoster) ? data.raid.manualRoster : [],
      )
    }
  }
  for (const [id, raid] of Object.entries(data.raids)) {
    if (!Array.isArray(raid.manualRoster)) raid.manualRoster = []
    if (!raid.signups) raid.signups = {}
    const empty =
      !raid.createdBy &&
      Object.keys(raid.signups).length === 0 &&
      raid.manualRoster.length === 0
    if (empty) delete data.raids[id]
  }
  return data
}

function loadFile() {
  if (!existsSync(storePath)) {
    const data = emptyData()
    return ensureRaids(data)
  }
  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8'))
    const data = {
      ...emptyData(),
      ...parsed,
      users: parsed.users || {},
      characters: parsed.characters || {},
      sessions: parsed.sessions || {},
      oauthStates: parsed.oauthStates || {},
      raids: parsed.raids || {},
    }
    const before = Object.keys(data.raids).length
    ensureRaids(data)
    if (Object.keys(data.raids).length !== before) saveFile(data)
    return data
  } catch {
    return ensureRaids(emptyData())
  }
}

function prune(data) {
  const now = Date.now()
  for (const [id, session] of Object.entries(data.sessions || {})) {
    if (!session || session.expiresAt < now) delete data.sessions[id]
  }
  for (const [id, state] of Object.entries(data.oauthStates || {})) {
    if (!state || now - state.createdAt > 15 * 60 * 1000) delete data.oauthStates[id]
  }
}

function saveFile(data) {
  prune(data)
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(storePath, JSON.stringify(data, null, 2))
}

let chain = Promise.resolve()

export function read() {
  return loadFile()
}

export function update(mutator) {
  const run = chain.then(() => {
    const data = loadFile()
    const result = mutator(data)
    saveFile(data)
    return result === undefined ? data : result
  })
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function sessionSecret() {
  mkdirSync(dataDir, { recursive: true })
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  if (existsSync(secretPath)) return readFileSync(secretPath, 'utf8').trim()
  const secret = randomUUID() + randomUUID()
  writeFileSync(secretPath, secret)
  return secret
}

export function isLead(user) {
  if (!user) return false
  if (user.discord && leadDiscordIds().includes(user.discord.id)) return true
  if (user.battlenet && leadBattlenetIds().includes(String(user.battlenet.id))) return true
  if (process.env.NODE_ENV !== 'production' && (demoEnabled('discord') || demoEnabled('battlenet'))) {
    return Boolean(user.lead)
  }
  return false
}

export function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    lead: isLead(user),
    displayName:
      user.discord?.globalName ||
      user.discord?.username ||
      user.battlenet?.battletag ||
      'Raider',
    discord: user.discord
      ? {
          id: user.discord.id,
          username: user.discord.username,
          globalName: user.discord.globalName || null,
        }
      : null,
    battlenet: user.battlenet
      ? {
          id: user.battlenet.id,
          battletag: user.battlenet.battletag,
        }
      : null,
  }
}

export function charactersFor(data, userId) {
  return Object.values(data.characters)
    .filter((c) => c.userId === userId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function findUserByProvider(data, provider, id) {
  return Object.values(data.users).find((user) => user[provider]?.id === id) || null
}

export function addCharacter(data, userId, input) {
  if (charactersFor(data, userId).length >= MAX_CHARACTERS) {
    throw fail(400, 'That account already has the maximum number of characters.')
  }
  const name = String(input.name || '').trim()
  if (!/^[A-Za-z]{2,12}$/.test(name)) {
    throw fail(400, 'Character names are 2–12 letters, same as in WoW.')
  }
  const className = WOW_CLASSES.includes(input.className) ? input.className : null
  if (!className) throw fail(400, 'Pick a class.')
  const role = ROLES.includes(input.role) ? input.role : null
  if (!role) throw fail(400, 'Pick tank, healer, or damage.')
  const spec = String(input.spec || '').trim().slice(0, 32)
  if (!spec) throw fail(400, 'Add a spec so the raid lead knows what you play.')
  const realm = String(input.realm || '').trim().slice(0, 32)
  const taken = charactersFor(data, userId).some(
    (c) => c.name.toLowerCase() === name.toLowerCase() && c.realm.toLowerCase() === realm.toLowerCase(),
  )
  if (taken) throw fail(409, `${name} is already on this account.`)
  const character = {
    id: `c_${randomUUID()}`,
    userId,
    name,
    className,
    spec,
    role,
    realm,
    source: input.source === 'battlenet' ? 'battlenet' : 'manual',
    lastPicks: Array.isArray(input.lastPicks)
      ? input.lastPicks.filter((n) => Number.isInteger(n) && n > 0 && n < 1e7).slice(0, 10)
      : [],
  }
  data.characters[character.id] = character
  return character
}

export function getRaid(data, id) {
  ensureRaids(data)
  const raid = data.raids[id]
  if (!raid) throw fail(404, 'That raid is not on the board.')
  return raid
}

export function canManage(user, raid) {
  if (!user) return false
  if (isLead(user)) return true
  return Boolean(raid.createdBy && raid.createdBy === user.id)
}

export function addManualRaider(data, raid, input) {
  const name = String(input.name || '').trim()
  if (!/^[A-Za-z]{2,12}$/.test(name)) {
    throw fail(400, 'Character names are 2–12 letters, same as in WoW.')
  }
  const className = WOW_CLASSES.includes(input.className) ? input.className : null
  if (!className) throw fail(400, 'Pick a class.')
  const role = ROLES.includes(input.role) ? input.role : null
  if (!role) throw fail(400, 'Pick tank, healer, or damage.')
  const spec = String(input.spec || '').trim().slice(0, 32)
  if (!spec) throw fail(400, 'Add a spec so the raid lead knows what they play.')

  const roster = raid.manualRoster || (raid.manualRoster = [])
  if (roster.length >= MAX_ROSTER) throw fail(400, 'This roster is full.')
  const alreadyListed = roster.some((r) => r.name.toLowerCase() === name.toLowerCase())
  const alreadySigned = Object.values(raid.signups || {}).some((signup) => {
    const character = data.characters[signup.characterId]
    return character?.name?.toLowerCase() === name.toLowerCase()
  })
  if (alreadyListed || alreadySigned) throw fail(409, `${name} is already on the roster.`)

  const raider = {
    id: `m_${randomUUID()}`,
    name,
    className,
    spec,
    role,
    signed: false,
    picks: [],
  }
  roster.push(raider)
  return raider
}

export function removeRosterMember(data, raid, id) {
  const roster = raid.manualRoster || (raid.manualRoster = [])
  const manualIndex = roster.findIndex((r) => r.id === id)
  if (manualIndex >= 0) {
    roster.splice(manualIndex, 1)
    return
  }
  if (!raid.signups?.[id]) throw fail(404, 'Raider not found.')
  delete raid.signups[id]
}

export function buildRoster(data, raid, youId) {
  const fromSignups = Object.values(raid.signups || {})
    .map((signup) => {
      const character = data.characters[signup.characterId]
      const user = data.users[signup.userId]
      if (!character) return null
      return {
        id: signup.userId,
        name: character.name,
        className: character.className,
        spec: character.spec,
        role: character.role,
        signed: true,
        picks: signup.picks || [],
        you: youId === signup.userId,
        discord: user?.discord?.username || null,
        battletag: user?.battlenet?.battletag || null,
      }
    })
    .filter(Boolean)

  const used = new Set(fromSignups.map((r) => r.name.toLowerCase()))
  const extras = (raid.manualRoster || []).filter((r) => !used.has(r.name.toLowerCase()))
  return [...extras, ...fromSignups]
}

export function raidPayload(data, raid, youId, user = null) {
  const instance = instanceById(raid.instanceId)
  return {
    id: raid.id,
    instanceId: raid.instanceId,
    instanceName: instance?.name || raid.name,
    name: raid.name,
    when: raid.when,
    dateLabel: raid.dateLabel,
    size: raid.size,
    pickLimit: raid.pickLimit,
    lockLabel: raid.lockLabel,
    locked: Boolean(raid.locked),
    discordUrl: raid.discordUrl || '',
    canManage: canManage(user, raid),
    roster: buildRoster(data, raid, youId),
  }
}

export function createRaid(data, user, body) {
  const owned = Object.values(data.raids || {}).filter((raid) => raid.createdBy === user.id).length
  if (owned >= MAX_RAIDS) throw fail(400, 'Delete an old raid before posting another.')
  const instance = instanceById(body.instanceId)
  if (!instance) throw fail(400, 'Pick a raid instance.')
  const id = `r_${randomUUID()}`
  const raid = {
    id,
    instanceId: instance.id,
    name: String(body.name || instance.name).trim().slice(0, 48) || instance.name,
    when: String(body.when || '').trim().slice(0, 48) || 'Tonight',
    dateLabel: String(body.dateLabel || '').trim().slice(0, 32) || '',
    size: Number(body.size) > 0 ? Math.min(40, Number(body.size)) : instance.size,
    pickLimit: Number(body.pickLimit) > 0 ? Math.min(10, Number(body.pickLimit)) : instance.pickLimit,
    lockLabel: String(body.lockLabel || '').trim().slice(0, 32) || 'Start',
    locked: false,
    discordUrl: normalizeDiscordUrl(body.discordUrl),
    signups: {},
    manualRoster: [],
    createdBy: user.id,
  }
  data.raids[id] = raid
  return raid
}

export function raidSummary(data, raid, user) {
  const instance = instanceById(raid.instanceId)
  const signed = Object.keys(raid.signups || {}).length
  return {
    id: raid.id,
    instanceId: raid.instanceId,
    instanceName: instance?.name || raid.name,
    name: raid.name,
    when: raid.when,
    dateLabel: raid.dateLabel,
    size: raid.size,
    pickLimit: raid.pickLimit,
    lockLabel: raid.lockLabel,
    locked: Boolean(raid.locked),
    signed,
    canManage: canManage(user, raid),
  }
}

export function fail(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

export function normalizeDiscordUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  let parsed
  try {
    parsed = new URL(withProtocol)
  } catch {
    throw fail(400, 'That Discord link is not valid.')
  }
  if (parsed.protocol !== 'https:') throw fail(400, 'Use an https Discord link.')
  if (parsed.username || parsed.password) throw fail(400, 'That Discord link is not valid.')
  const host = parsed.hostname.toLowerCase()
  const allowed = new Set([
    'discord.gg',
    'discord.com',
    'www.discord.com',
    'ptb.discord.com',
    'canary.discord.com',
    'discordapp.com',
    'www.discordapp.com',
  ])
  if (!allowed.has(host)) throw fail(400, 'Paste a discord.gg or discord.com link.')
  parsed.hash = ''
  parsed.search = host === 'discord.gg' ? '' : parsed.search
  const href = parsed.toString()
  if (href.length > 200) throw fail(400, 'That Discord link is too long.')
  return href
}
