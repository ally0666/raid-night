import { createPublicKey, randomUUID, verify } from 'node:crypto'
import { publicUrl } from './env.mjs'
import { INSTANCES, WOW_CLASSES } from './seed.mjs'
import {
  addCharacter,
  buildRoster,
  canManage,
  charactersFor,
  createRaid,
  fail,
  findUserByProvider,
  getRaid,
  read,
  update,
} from './store.mjs'

export const INTERACTIONS_PATH = '/api/discord/interactions'

const API = 'https://discord.com/api/v10'
const EPHEMERAL = 64
const MAX_POSTS = 5
const MANAGE_EVENTS = String(1n << 33n)
// View Channel + Send Messages + Embed Links
const BOT_PERMISSIONS = String(1024 + 2048 + 16384)

const SPECS = {
  Warrior: [
    ['Protection', 'tank'],
    ['Fury', 'dps'],
    ['Arms', 'dps'],
  ],
  Paladin: [
    ['Holy', 'healer'],
    ['Protection', 'tank'],
    ['Retribution', 'dps'],
  ],
  Hunter: [
    ['Beast Mastery', 'dps'],
    ['Marksmanship', 'dps'],
    ['Survival', 'dps'],
  ],
  Rogue: [
    ['Combat', 'dps'],
    ['Assassination', 'dps'],
    ['Subtlety', 'dps'],
  ],
  Priest: [
    ['Holy', 'healer'],
    ['Discipline', 'healer'],
    ['Shadow', 'dps'],
  ],
  Shaman: [
    ['Restoration', 'healer'],
    ['Elemental', 'dps'],
    ['Enhancement', 'dps'],
  ],
  Mage: [
    ['Arcane', 'dps'],
    ['Fire', 'dps'],
    ['Frost', 'dps'],
  ],
  Warlock: [
    ['Affliction', 'dps'],
    ['Demonology', 'dps'],
    ['Destruction', 'dps'],
  ],
  Druid: [
    ['Restoration', 'healer'],
    ['Feral', 'tank', 'Feral (Bear)'],
    ['Feral', 'dps', 'Feral (Cat)'],
    ['Balance', 'dps'],
  ],
}

const SECTIONS = [
  ['tank', '🛡️ Tanks'],
  ['healer', '💚 Healers'],
  ['melee', '⚔️ Melee'],
  ['caster', '🔮 Casters & Ranged'],
]
const BLANK_FIELD = { name: '​', value: '​', inline: true }

// Spec is free text on the site, so melee is decided by class first.
function section(raider) {
  if (raider.role !== 'dps') return raider.role
  const spec = String(raider.spec || '')
  if (['Warrior', 'Rogue', 'Paladin'].includes(raider.className)) return 'melee'
  if (raider.className === 'Shaman' && /enh/i.test(spec)) return 'melee'
  if (raider.className === 'Druid' && /feral|cat/i.test(spec)) return 'melee'
  return 'caster'
}
const ROLE_NAME = { tank: 'Tank', healer: 'Healer', dps: 'Damage' }

const COMMANDS = [
  {
    name: 'raid',
    description: 'Raid night signups',
    default_member_permissions: MANAGE_EVENTS,
    contexts: [0],
    options: [
      {
        type: 1,
        name: 'post',
        description: 'Post one of your raids in this channel with signup buttons',
        options: [{ type: 3, name: 'raid', description: 'Which raid', required: true, autocomplete: true }],
      },
      {
        type: 1,
        name: 'create',
        description: 'Schedule a raid and post it in this channel',
        options: [
          {
            type: 3,
            name: 'instance',
            description: 'Which raid instance',
            required: true,
            choices: INSTANCES.map((row) => ({ name: row.name, value: row.id })),
          },
          { type: 3, name: 'date', description: 'Raid date, YYYY-MM-DD', required: true },
          { type: 3, name: 'time', description: 'Start in server time, 24h HH:MM (default 20:00)' },
        ],
      },
    ],
  },
]

export function botConfigured() {
  return Boolean(
    process.env.DISCORD_CLIENT_ID && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_PUBLIC_KEY,
  )
}

export function botInviteUrl() {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID || '',
    scope: 'bot applications.commands',
    permissions: BOT_PERMISSIONS,
  })
  return `https://discord.com/oauth2/authorize?${params}`
}

function discord(method, path, body) {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function registerCommands() {
  if (!botConfigured()) return false
  const res = await discord('PUT', `/applications/${process.env.DISCORD_CLIENT_ID}/commands`, COMMANDS)
  if (!res.ok) throw new Error(`Discord rejected the slash commands (${res.status}).`)
  return true
}

const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex')

export function validSignature(body, signature, timestamp) {
  const hex = process.env.DISCORD_PUBLIC_KEY || ''
  if (!/^[0-9a-f]{64}$/i.test(hex) || !/^[0-9a-f]{128}$/i.test(signature || '') || !timestamp) return false
  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_ED25519, Buffer.from(hex, 'hex')]),
      format: 'der',
      type: 'spki',
    })
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}

function esc(text) {
  return String(text).replace(/[\\*_~`|>[\]]/g, '\\$&')
}

function raidUrl(raid) {
  return `${publicUrl()}/r/${raid.id}`
}

function roleField(label, raiders, pickLimit) {
  const lines = [...raiders]
    .sort((a, b) => WOW_CLASSES.indexOf(a.className) - WOW_CLASSES.indexOf(b.className) || a.name.localeCompare(b.name))
    .map((r) => `${r.className} (${esc(r.spec)}) · **${esc(r.name)}** · ${r.picks.length}/${pickLimit}`)
  let value = ''
  let shown = 0
  for (const line of lines) {
    if (value.length + line.length > 950) break
    value += `${line}\n`
    shown += 1
  }
  if (shown < lines.length) value += `…and ${lines.length - shown} more`
  return { name: `${label} (${raiders.length})`, value: value.trim() || '—', inline: true }
}

function rsvpField(data, raid, status, label) {
  const names = Object.entries(raid.rsvp || {})
    .filter(([, value]) => value === status)
    .map(([userId]) => data.users[userId])
    .filter(Boolean)
    .map((user) => (user.discord ? `<@${user.discord.id}>` : esc(user.battlenet?.battletag || 'Raider')))
  if (!names.length) return null
  return { name: `${label} (${names.length})`, value: names.slice(0, 40).join(', '), inline: false }
}

export function raidMessage(data, raid) {
  const roster = buildRoster(data, raid)
  const locked = Boolean(raid.locked)
  const when = [raid.dateLabel, raid.when].filter(Boolean).join(' · ')
  const fields = SECTIONS.map(([key, label]) =>
    roleField(
      label,
      roster.filter((r) => section(r) === key),
      raid.pickLimit,
    ),
  )
  // Discord fits three inline fields per row; a blank third keeps the sections two by two.
  fields.splice(2, 0, BLANK_FIELD)
  fields.push(BLANK_FIELD)
  for (const [status, label] of [
    ['tentative', '❔ Tentative'],
    ['absent', '🚫 Not attending'],
  ]) {
    const field = rsvpField(data, raid, status, label)
    if (field) fields.push(field)
  }
  return {
    embeds: [
      {
        title: raid.name,
        url: raidUrl(raid),
        color: locked ? 0x6b6b6b : 0xc79c6e,
        description: [
          `📅 **${esc(when)}**`,
          `👥 **${roster.length}/${raid.size}** signed · ${raid.pickLimit} soft reserves each`,
          locked ? '🔒 **Signups and picks are locked.**' : `🔒 Picks lock at ${esc(raid.lockLabel)}`,
        ].join('\n'),
        fields,
        footer: { text: 'Raid night · the number after each name is reserves picked' },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Attending', custom_id: `rn:join:${raid.id}`, disabled: locked },
          { type: 2, style: 2, label: 'Tentative', custom_id: `rn:tentative:${raid.id}`, disabled: locked },
          { type: 2, style: 4, label: 'Not attending', custom_id: `rn:absent:${raid.id}`, disabled: locked },
          { type: 2, style: 5, label: 'Pick reserves', url: raidUrl(raid) },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  }
}

// messageId -> last payload Discord accepted, so unchanged posts are not re-sent
const sent = new Map()
let syncing = Promise.resolve()

async function runSync() {
  const data = read()
  const gone = []
  for (const raid of Object.values(data.raids)) {
    for (const post of raid.discordPosts || []) {
      const payload = raidMessage(data, raid)
      const json = JSON.stringify(payload)
      if (sent.get(post.messageId) === json) continue
      const res = await discord('PATCH', `/channels/${post.channelId}/messages/${post.messageId}`, payload)
      if (res.ok) sent.set(post.messageId, json)
      else if (res.status === 404) gone.push([raid.id, post.messageId])
    }
  }
  if (!gone.length) return
  await update((next) => {
    for (const [raidId, messageId] of gone) {
      const raid = next.raids[raidId]
      if (raid?.discordPosts) raid.discordPosts = raid.discordPosts.filter((p) => p.messageId !== messageId)
      sent.delete(messageId)
    }
  })
}

export function syncRaidPosts() {
  if (!botConfigured()) return Promise.resolve()
  syncing = syncing.then(runSync).catch((err) => console.error('discord sync failed', err))
  return syncing
}

export async function cancelRaidPosts(raid) {
  if (!botConfigured()) return
  for (const post of raid?.discordPosts || []) {
    sent.delete(post.messageId)
    await discord('PATCH', `/channels/${post.channelId}/messages/${post.messageId}`, {
      embeds: [{ title: `~~${esc(raid.name)}~~`, description: 'This raid was cancelled.', color: 0x6b6b6b }],
      components: [],
    }).catch((err) => console.error('discord cancel failed', err))
  }
}

function ephemeral(content, components = []) {
  return { type: 4, data: { content, components, flags: EPHEMERAL, allowed_mentions: { parse: [] } } }
}

function swap(content, components = []) {
  return { type: 7, data: { content, components } }
}

function select(customId, placeholder, options) {
  return { type: 1, components: [{ type: 3, custom_id: customId, placeholder, options }] }
}

function siteUser(data, who) {
  if (!who?.id) throw fail(400, 'Could not read your Discord account.')
  const identity = {
    id: String(who.id),
    username: who.username,
    globalName: who.global_name || who.username,
  }
  const existing = findUserByProvider(data, 'discord', identity.id)
  if (existing) {
    existing.discord = { ...existing.discord, ...identity }
    return existing
  }
  const user = {
    id: `u_${randomUUID()}`,
    createdAt: Date.now(),
    discord: identity,
    battlenet: null,
    lead: false,
  }
  data.users[user.id] = user
  return user
}

function classSelect(raidId) {
  return select(
    `rn:class:${raidId}`,
    'Pick a class',
    WOW_CLASSES.map((name, i) => ({ label: name, value: String(i) })),
  )
}

function joinPrompt(data, raid, user) {
  const characters = charactersFor(data, user.id)
  if (!characters.length) return ['What class are you bringing?', [classSelect(raid.id)]]
  const current = raid.signups[user.id]?.characterId
  const options = characters.slice(0, 24).map((ch) => ({
    label: ch.name,
    description: `${ch.spec} ${ch.className} · ${ROLE_NAME[ch.role]}`.slice(0, 100),
    value: ch.id,
    default: ch.id === current,
  }))
  options.push({ label: 'New character', value: 'new', emoji: { name: '➕' } })
  return ['Who are you bringing?', [select(`rn:char:${raid.id}`, 'Pick a character', options)]]
}

function signUp(data, raid, user, character) {
  const existing = raid.signups[user.id]
  if (raid.locked) throw fail(403, existing ? 'Picks are locked for tonight.' : 'Signups are locked for tonight.')
  const previous = existing ? data.characters[existing.characterId] : null
  const keep = previous && previous.className === character.className
  raid.signups[user.id] = {
    userId: user.id,
    characterId: character.id,
    picks: keep ? existing.picks || [] : [],
  }
  if (raid.rsvp) delete raid.rsvp[user.id]
  const have = raid.signups[user.id].picks.length
  const picks =
    have >= raid.pickLimit
      ? `Your ${have} reserves are in — [change them](${raidUrl(raid)})`
      : `Now [pick your ${raid.pickLimit} reserves](${raidUrl(raid)})`
  return `✅ Signed up as **${character.name}** (${esc(character.spec)} ${character.className}). ${picks} — same Discord login.`
}

function specFrom(classIndex, specIndex) {
  const className = WOW_CLASSES[Number(classIndex)]
  const spec = SPECS[className]?.[Number(specIndex)]
  if (!spec) throw fail(400, 'Pick a class and spec again.')
  return { className, spec: spec[0], role: spec[1] }
}

async function component(interaction, who) {
  const [, action, raidId, classIndex, specIndex] = String(interaction.data.custom_id || '').split(':')
  const value = interaction.data.values?.[0]

  if (action === 'join') {
    const [content, components] = await update((data) => {
      const raid = getRaid(data, raidId)
      if (raid.locked) throw fail(403, 'Signups are locked for tonight.')
      return joinPrompt(data, raid, siteUser(data, who))
    })
    return ephemeral(content, components)
  }

  if (action === 'tentative' || action === 'absent') {
    const payload = await update((data) => {
      const raid = getRaid(data, raidId)
      if (raid.locked) throw fail(403, 'Signups are locked for tonight.')
      const user = siteUser(data, who)
      const rsvp = raid.rsvp || (raid.rsvp = {})
      const repeat = rsvp[user.id] === action
      delete raid.signups[user.id]
      if (repeat) delete rsvp[user.id]
      else rsvp[user.id] = action
      return raidMessage(data, raid)
    })
    if (interaction.message?.id) sent.set(interaction.message.id, JSON.stringify(payload))
    void syncRaidPosts()
    return { type: 7, data: payload }
  }

  if (action === 'char' && value === 'new') return swap('What class are you bringing?', [classSelect(raidId)])

  if (action === 'char') {
    const content = await update((data) => {
      const raid = getRaid(data, raidId)
      const user = siteUser(data, who)
      const character = data.characters[value]
      if (!character || character.userId !== user.id) throw fail(400, 'Pick one of your characters.')
      return signUp(data, raid, user, character)
    })
    void syncRaidPosts()
    return swap(content)
  }

  if (action === 'class') {
    const className = WOW_CLASSES[Number(value)]
    if (!className) throw fail(400, 'Pick a class.')
    return swap(`${className} — which spec?`, [
      select(
        `rn:spec:${raidId}:${Number(value)}`,
        'Pick a spec',
        SPECS[className].map(([spec, role, label], i) => ({
          label: label || spec,
          description: ROLE_NAME[role],
          value: String(i),
        })),
      ),
    ])
  }

  if (action === 'spec') {
    specFrom(classIndex, value)
    const nick = interaction.member?.nick || who.global_name || ''
    return {
      type: 9,
      data: {
        custom_id: `rn:name:${raidId}:${Number(classIndex)}:${Number(value)}`,
        title: 'Character name',
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: 'name',
                label: 'Name in game',
                style: 1,
                min_length: 2,
                max_length: 12,
                required: true,
                ...(/^[A-Za-z]{2,12}$/.test(nick) ? { value: nick } : {}),
              },
            ],
          },
        ],
      },
    }
  }

  if (action === 'name') {
    const name = String(interaction.data.components?.[0]?.components?.[0]?.value || '').trim()
    const picked = specFrom(classIndex, specIndex)
    const content = await update((data) => {
      const raid = getRaid(data, raidId)
      const user = siteUser(data, who)
      if (raid.locked) throw fail(403, 'Signups are locked for tonight.')
      const mine = charactersFor(data, user.id).find((ch) => ch.name.toLowerCase() === name.toLowerCase())
      if (mine && mine.className !== picked.className) {
        throw fail(409, `${mine.name} is already on your account as a ${mine.className}.`)
      }
      if (mine) Object.assign(mine, { spec: picked.spec, role: picked.role })
      const character = mine || addCharacter(data, user.id, { name, ...picked })
      return signUp(data, raid, user, character)
    })
    void syncRaidPosts()
    return interaction.message ? swap(content) : ephemeral(content)
  }

  throw fail(400, 'That button is out of date. Ask the raid lead to post the raid again.')
}

function raidLabels(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail(400, 'Write the date as YYYY-MM-DD, like 2026-10-06.')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw fail(400, 'Write the time as 24h HH:MM, like 20:00.')
  const start = new Date(`${date}T${time}:00Z`)
  if (Number.isNaN(start.getTime())) throw fail(400, 'That date does not exist.')
  const lock = new Date(start.getTime() - 15 * 60_000)
  const clock = { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }
  return {
    when: `${start.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}, ${start.toLocaleTimeString('en-US', clock)}`,
    dateLabel: start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    lockLabel: lock.toLocaleTimeString('en-US', clock),
  }
}

async function postRaid(raidId, channelId) {
  if (!/^\d{5,25}$/.test(String(channelId || ''))) throw fail(400, 'Use this in a server channel.')
  const data = read()
  const payload = raidMessage(data, getRaid(data, raidId))
  const res = await discord('POST', `/channels/${channelId}/messages`, payload)
  if (res.status === 403 || res.status === 404) {
    throw fail(403, 'I cannot post in this channel. Give me View Channel, Send Messages and Embed Links here, then try again.')
  }
  const message = await res.json().catch(() => null)
  if (!res.ok || !message?.id) throw fail(502, 'Discord did not accept the post. Try again in a minute.')
  sent.set(message.id, JSON.stringify(payload))
  await update((next) => {
    const raid = next.raids[raidId]
    if (!raid) return
    const posts = [...(raid.discordPosts || []), { channelId: String(channelId), messageId: message.id }]
    raid.discordPosts = posts.slice(-MAX_POSTS)
  })
  // Someone may have signed up between rendering and saving the post.
  void syncRaidPosts()
}

function option(options, name) {
  return options?.find((row) => row.name === name)?.value
}

async function command(interaction, who) {
  const sub = interaction.data.options?.[0]
  if (interaction.data.name !== 'raid' || !sub) throw fail(400, 'Unknown command.')
  if (!interaction.guild_id) throw fail(400, 'Use this in a server channel.')

  if (sub.name === 'post') {
    const raidId = String(option(sub.options, 'raid') || '')
    const raid = await update((data) => {
      const user = siteUser(data, who)
      const found = /^[A-Za-z0-9_-]{3,80}$/.test(raidId) ? data.raids[raidId] : null
      if (!found || !canManage(user, found)) {
        throw fail(404, `Pick one of your raids from the list. No raids yet? Use /raid create, or schedule one at ${publicUrl()}`)
      }
      return found
    })
    await postRaid(raid.id, interaction.channel_id)
    return ephemeral(`Posted **${esc(raid.name)}**. The post updates itself as people sign up here or on the site.`)
  }

  if (sub.name === 'create') {
    const labels = raidLabels(String(option(sub.options, 'date') || '').trim(), String(option(sub.options, 'time') || '20:00').trim())
    const raid = await update((data) =>
      createRaid(data, siteUser(data, who), { instanceId: option(sub.options, 'instance'), ...labels }),
    )
    try {
      await postRaid(raid.id, interaction.channel_id)
    } catch (err) {
      if (!err.status) throw err
      return ephemeral(`Scheduled **${esc(raid.name)}**, but it is not posted yet: ${err.message} Then run /raid post.`)
    }
    return ephemeral(`Scheduled and posted **${esc(raid.name)}**. Lead tools (lock, Gargul export): ${raidUrl(raid)}`)
  }

  throw fail(400, 'Unknown command.')
}

function autocomplete(interaction, who) {
  const data = read()
  const user = findUserByProvider(data, 'discord', String(who?.id || ''))
  const typed = String(interaction.data.options?.[0]?.options?.find((row) => row.focused)?.value || '').toLowerCase()
  const choices = Object.values(data.raids)
    .filter((raid) => user && canManage(user, raid))
    .map((raid) => ({
      name: [raid.name, raid.dateLabel, raid.when].filter(Boolean).join(' · ').slice(0, 100),
      value: raid.id,
    }))
    .filter((choice) => choice.name.toLowerCase().includes(typed))
    .slice(0, 25)
  return { type: 8, data: { choices } }
}

export async function handleInteraction(interaction) {
  if (interaction.type === 1) return { type: 1 }
  const who = interaction.member?.user || interaction.user
  if (interaction.type === 4) return autocomplete(interaction, who)
  try {
    if (interaction.type === 2) return await command(interaction, who)
    if (interaction.type === 3 || interaction.type === 5) return await component(interaction, who)
    throw fail(400, 'Unknown interaction.')
  } catch (err) {
    if (!err.status) console.error(err)
    return ephemeral(err.status ? err.message : 'Something went wrong. Try again.')
  }
}
