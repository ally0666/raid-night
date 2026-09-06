import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rootDir } from './env.mjs'
import { raidMeta, ROLES, seedRoster, WOW_CLASSES } from './seed.mjs'

const dataDir = process.env.DATA_DIR || join(rootDir, 'data')
const storePath = join(dataDir, 'store.json')
const secretPath = join(dataDir, 'session-secret')

function emptyData() {
  return {
    users: {},
    characters: {},
    sessions: {},
    oauthStates: {},
    raid: {
      locked: false,
      signups: {},
      manualRoster: seedRoster,
    },
  }
}

function loadFile() {
  if (!existsSync(storePath)) return emptyData()
  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8'))
    return {
      ...emptyData(),
      ...parsed,
      users: parsed.users || {},
      characters: parsed.characters || {},
      sessions: parsed.sessions || {},
      oauthStates: parsed.oauthStates || {},
      raid: {
        locked: Boolean(parsed.raid?.locked),
        signups: parsed.raid?.signups || {},
        // Existing deployments used the static seed roster. Preserve it as the
        // starting point the first time a lead edits the roster.
        manualRoster: Array.isArray(parsed.raid?.manualRoster) ? parsed.raid.manualRoster : seedRoster,
      },
    }
  } catch {
    return emptyData()
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

export function addManualRaider(data, input) {
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

  const roster = data.raid.manualRoster || (data.raid.manualRoster = [...seedRoster])
  const alreadyListed = roster.some((r) => r.name.toLowerCase() === name.toLowerCase())
  const alreadySigned = Object.values(data.raid.signups).some((signup) => {
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

export function removeRosterMember(data, id) {
  const roster = data.raid.manualRoster || (data.raid.manualRoster = [...seedRoster])
  const manualIndex = roster.findIndex((r) => r.id === id)
  if (manualIndex >= 0) {
    roster.splice(manualIndex, 1)
    return
  }
  if (!data.raid.signups[id]) throw fail(404, 'Raider not found.')
  delete data.raid.signups[id]
}

export function buildRoster(data, youId) {
  const fromSignups = Object.values(data.raid.signups)
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
  const manualRoster = data.raid.manualRoster || seedRoster
  const extras = manualRoster.filter((r) => !used.has(r.name.toLowerCase()))
  return [...extras, ...fromSignups]
}

export function raidPayload(data, youId) {
  return {
    ...raidMeta,
    locked: Boolean(data.raid.locked),
    roster: buildRoster(data, youId),
  }
}

export function fail(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}
