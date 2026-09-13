import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rootDir } from './env.mjs'
import { INSTANCES, raidMeta, ROLES, WOW_CLASSES } from './seed.mjs'

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

function saveFile(data) {
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

export function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    lead: Boolean(user.lead),
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
      ? input.lastPicks.filter((n) => Number.isInteger(n)).slice(0, 4)
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
  if (user.lead) return true
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
    canManage: canManage(user, raid),
    roster: buildRoster(data, raid, youId),
  }
}

export function createRaid(data, user, body) {
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
