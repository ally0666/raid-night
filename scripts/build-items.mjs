import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CACHE_PATH = fileURLToPath(new URL('./.tooltip-cache.json', import.meta.url))
const ATLAS_URL =
  'https://raw.githubusercontent.com/Hoizame/AtlasLootClassic/master/AtlasLootClassic_DungeonsAndRaids/data-tbc.lua'

const ALL = ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Priest', 'Shaman', 'Mage', 'Warlock', 'Druid']
const CLOTH_CASTER = ['Mage', 'Warlock', 'Priest']
const CLOTH_HEAL = ['Priest']
const LEATHER_AGI = ['Rogue', 'Druid']
const LEATHER_HEAL = ['Druid']
const MAIL_AGI = ['Hunter', 'Shaman']
const MAIL_HEAL = ['Shaman']
const PLATE_TANK = ['Warrior', 'Paladin']
const PLATE_HEAL = ['Paladin']
const PLATE_DPS = ['Warrior', 'Paladin']
const CASTER = ['Mage', 'Warlock', 'Priest']
const HEALER = ['Priest', 'Paladin', 'Shaman', 'Druid']
const TANK = ['Warrior', 'Paladin', 'Druid']
const AGI = ['Rogue', 'Hunter', 'Warrior', 'Druid', 'Shaman']
const STR = ['Warrior', 'Paladin']
const CASTER_STAFF = ['Mage', 'Warlock', 'Priest', 'Druid']
const HEAL_STAFF = ['Priest', 'Druid', 'Shaman']
const CASTER_DAGGER = ['Mage', 'Warlock', 'Priest', 'Druid', 'Shaman']
const AGI_DAGGER = ['Rogue', 'Hunter']
const WAND = ['Mage', 'Warlock', 'Priest']
const HUNTER_RANGED = ['Hunter', 'Warrior', 'Rogue']
const BOW = ['Hunter', 'Warrior']
const SHIELD = ['Warrior', 'Paladin', 'Shaman']
const AXE_2H = ['Warrior', 'Paladin', 'Hunter', 'Shaman']
const AXE_1H = ['Warrior', 'Paladin', 'Hunter', 'Shaman']
const SWORD_1H = ['Warrior', 'Paladin', 'Rogue', 'Hunter', 'Mage']
const SWORD_2H = ['Warrior', 'Paladin']
const MACE_HEAL = ['Paladin', 'Priest', 'Druid', 'Shaman']
const MACE_MELEE = ['Warrior', 'Paladin', 'Druid', 'Shaman', 'Rogue']
const FIST = ['Rogue', 'Shaman', 'Druid', 'Hunter', 'Warrior']
const THROWN = ['Rogue', 'Warrior']
const POLEARM = ['Warrior', 'Paladin', 'Hunter', 'Druid']
const HERO = ['Hunter', 'Mage', 'Warlock']
const CHAMPION = ['Paladin', 'Rogue', 'Shaman']
const DEFENDER = ['Warrior', 'Priest', 'Druid']
const CONQUEROR = ['Paladin', 'Priest', 'Warlock']
const PROTECTOR = ['Warrior', 'Hunter', 'Shaman']
const VANQUISHER = ['Rogue', 'Mage', 'Druid']

const RAIDS = {
  GruulsLair: 'gruul',
  MagtheridonsLair: 'magtheridon',
  SerpentshrineCavern: 'ssc',
  TempestKeep: 'tk',
  HyjalSummit: 'hyjal',
  BlackTemple: 'bt',
  ZulAman: 'za',
  SunwellPlateau: 'swp',
}

const BOSS_SHORT = {
  'High King Maulgar': 'Maulgar',
  'Gruul the Dragonkiller': 'Gruul',
  Magtheridon: 'Magtheridon',
  'Hydross the Unstable': 'Hydross',
  'The Lurker Below': 'Lurker',
  'Leotheras the Blind': 'Leotheras',
  'Fathom-Lord Karathress': 'Karathress',
  'Morogrim Tidewalker': 'Morogrim',
  'Lady Vashj': 'Vashj',
  "Al'ar": "Al'ar",
  'Void Reaver': 'Void Reaver',
  'High Astromancer Solarian': 'Solarian',
  "Kael'thas Sunstrider": "Kael'thas",
  'Rage Winterchill': 'Winterchill',
  Anetheron: 'Anetheron',
  "Kaz'rogal": "Kaz'rogal",
  Azgalor: 'Azgalor',
  Archimonde: 'Archimonde',
  "High Warlord Naj'entus": "Naj'entus",
  Supremus: 'Supremus',
  'Shade of Akama': 'Akama',
  'Teron Gorefiend': 'Teron',
  'Gurtogg Bloodboil': 'Gurtogg',
  'Reliquary of the Lost': 'Reliquary',
  'Mother Shahraz': 'Shahraz',
  'The Illidari Council': 'Council',
  'Illidan Stormrage': 'Illidan',
  "Akil'zon": "Akil'zon",
  Nalorakk: 'Nalorakk',
  "Jan'alai": "Jan'alai",
  Halazzi: 'Halazzi',
  'Hex Lord Malacrass': 'Hex Lord',
  "Zul'jin": "Zul'jin",
  'Timed Chest': 'Timed Chest',
  Kalecgos: 'Kalecgos',
  Brutallus: 'Brutallus',
  Felmyst: 'Felmyst',
  'Eredar Twins': 'Twins',
  "M'uru": "M'uru",
  "Kil'jaeden": "Kil'jaeden",
}

const SKIP_BOSSES = new Set(['Trash', 'Keys', 'Patterns', 'Legendaries', 'World Bosses'])
const SKIP_IDS = new Set([29434, 21524, 21525])
const SKIP_NAME = /^(Pattern|Formula|Plans|Schematic|Design|Recipe|Glyph):/i

function braceBlock(src, openIdx) {
  let depth = 0
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return src.slice(openIdx, i + 1)
    }
  }
  return src.slice(openIdx)
}

function extractDataBlock(src, key) {
  const needle = `data["${key}"]`
  const start = src.indexOf(needle)
  if (start < 0) throw new Error(`missing ${key}`)
  const open = src.indexOf('{', start)
  return braceBlock(src, open)
}

function parseBosses(block) {
  const itemsIdx = block.indexOf('items =')
  if (itemsIdx < 0) return []
  const itemsBlock = braceBlock(block, block.indexOf('{', itemsIdx))
  const bosses = []
  const nameRe = /name\s*=\s*AL\["([^"]+)"\]/g
  let match
  while ((match = nameRe.exec(itemsBlock))) {
    const name = match[1]
    const after = itemsBlock.slice(match.index, match.index + 1800)
    const extra = /ExtraList\s*=\s*true/.test(after.split('[NORMAL_DIFF]')[0] || after)
    const normalIdx = itemsBlock.indexOf('[NORMAL_DIFF]', match.index)
    const nextName = itemsBlock.indexOf('name =', match.index + 8)
    if (normalIdx < 0 || (nextName > 0 && normalIdx > nextName)) continue
    const open = itemsBlock.indexOf('{', normalIdx)
    const loot = braceBlock(itemsBlock, open)
    const ids = []
    const idRe = /\{\s*\d+\s*,\s*(\d+)\s*\}/g
    let idMatch
    while ((idMatch = idRe.exec(loot))) ids.push(Number(idMatch[1]))
    bosses.push({ name, extra, ids })
  }
  return bosses
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function has(text, re) {
  return re.test(text)
}

function classLine(text) {
  const match = text.match(/Classes?:\s*([A-Za-z]+(?:\s*,\s*[A-Za-z]+)*)/i)
  if (!match) return null
  const names = match[1].split(/\s*,\s*/).filter((n) => ALL.includes(n))
  return names.length ? names : null
}

function detectSlot(text, name) {
  if (/Mount|summons a/i.test(text) || /reins of/i.test(name)) return 'Mount'
  if (/\bToken\b|Vanquished|Fallen (?:Champion|Defender|Hero)|Forgotten (?:Conqueror|Protector|Vanquisher)/i.test(name)) {
    return 'Token'
  }
  if (/\bHeld In Off-hand\b/i.test(text) || /\bHeld in Off-hand\b/i.test(text)) return 'Off-hand'
  if (/\bOff Hand\b/i.test(text) || /\bOff-Hand\b/i.test(text)) return 'Off-hand'
  if (/\bMain Hand\b/i.test(text)) return 'Main Hand'
  if (/\bTwo-Hand\b/i.test(text)) return 'Two-Hand'
  if (/\bOne-Hand\b/i.test(text)) return 'One-Hand'
  if (/\bThrown\b/i.test(text)) return 'Thrown'
  if (/\bRelic\b|\bIdol\b|\bLibram\b|\bTotem\b/i.test(text)) return 'Relic'
  if (/\bShield\b/i.test(text)) return 'Shield'
  if (/\bRanged\b|\bGun\b|\bBow\b|\bCrossbow\b|\bWand\b/i.test(text) && /\bRanged\b|\bWand\b/.test(text)) {
    if (/\bWand\b/i.test(text)) return 'Ranged'
    if (/\bRanged\b/i.test(text)) return 'Ranged'
  }
  const slots = [
    'Head',
    'Neck',
    'Shoulder',
    'Back',
    'Chest',
    'Wrist',
    'Hands',
    'Waist',
    'Legs',
    'Feet',
    'Finger',
    'Trinket',
    'Shirt',
    'Tabard',
  ]
  for (const slot of slots) {
    if (new RegExp(`\\b${slot}\\b`).test(text)) return slot
  }
  if (/\bWand\b/i.test(text)) return 'Ranged'
  if (/\b(Gun|Bow|Crossbow)\b/i.test(text)) return 'Ranged'
  if (/\bStaff\b/i.test(text)) return 'Two-Hand'
  if (/\bPolearm\b/i.test(text)) return 'Two-Hand'
  return 'Other'
}

function armorType(text) {
  if (/\bCloth\b/.test(text)) return 'Cloth'
  if (/\bLeather\b/.test(text)) return 'Leather'
  if (/\bMail\b/.test(text)) return 'Mail'
  if (/\bPlate\b/.test(text)) return 'Plate'
  return null
}

function weaponType(text) {
  if (/\bWand\b/i.test(text)) return 'Wand'
  if (/\bThrown\b/i.test(text)) return 'Thrown'
  if (/\bFist Weapon\b/i.test(text)) return 'Fist'
  if (/\bCrossbow\b/i.test(text)) return 'Crossbow'
  if (/\bBow\b/i.test(text)) return 'Bow'
  if (/\bGun\b/i.test(text)) return 'Gun'
  if (/\bPolearm\b/i.test(text)) return 'Polearm'
  if (/\bStaff\b/i.test(text)) return 'Staff'
  if (/\bDagger\b/i.test(text)) return 'Dagger'
  if (/\bSword\b/i.test(text)) return 'Sword'
  if (/\bAxe\b/i.test(text)) return 'Axe'
  if (/\bMace\b/i.test(text)) return 'Mace'
  if (/\bShield\b/i.test(text)) return 'Shield'
  return null
}

function isHeal(text) {
  return /Increases healing done by up to/i.test(text) && !/damage and healing done by magical spells/i.test(text)
}

function isSpell(text) {
  return (
    /damage and healing done by magical spells/i.test(text) ||
    /spell damage/i.test(text) ||
    /spell power/i.test(text)
  )
}

function isTank(text) {
  return /defense rating|increased defense|dodge rating|parry rating|block rating|shield block/i.test(text)
}

function isAgi(text) {
  return /attack power|armor penetration|expertise rating|\+[\d]+ Agility/i.test(text)
}

function isStr(text) {
  return /\+\d+ Strength/i.test(text)
}

// What each class can equip in TBC. Cloth is everyone (and cloaks are cloth), so it is not listed.
const CAN_WEAR = {
  Leather: ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Shaman', 'Druid'],
  Mail: ['Warrior', 'Paladin', 'Hunter', 'Shaman'],
  Plate: ['Warrior', 'Paladin'],
}
const CAN_WIELD = {
  Wand: ['Mage', 'Warlock', 'Priest'],
  Thrown: ['Rogue', 'Warrior', 'Hunter'],
  Fist: ['Rogue', 'Shaman', 'Druid', 'Hunter', 'Warrior'],
  Bow: ['Hunter', 'Warrior', 'Rogue'],
  Gun: ['Hunter', 'Warrior', 'Rogue'],
  Crossbow: ['Hunter', 'Warrior', 'Rogue'],
  Polearm: ['Warrior', 'Paladin', 'Hunter', 'Druid'],
  Staff: ['Mage', 'Warlock', 'Priest', 'Druid', 'Shaman', 'Hunter', 'Warrior'],
  Dagger: ['Rogue', 'Hunter', 'Warrior', 'Mage', 'Warlock', 'Priest', 'Druid', 'Shaman'],
  Sword: ['Warrior', 'Paladin', 'Rogue', 'Hunter', 'Mage', 'Warlock'],
  Sword2H: ['Warrior', 'Paladin', 'Hunter'],
  Axe: ['Warrior', 'Paladin', 'Hunter', 'Shaman'],
  Mace: ['Warrior', 'Paladin', 'Rogue', 'Priest', 'Shaman', 'Druid'],
  Mace2H: ['Warrior', 'Paladin', 'Shaman', 'Druid'],
  Shield: ['Warrior', 'Paladin', 'Shaman'],
}
// Who wants the stats. Hybrids (Paladin, Shaman, Druid) are in both, so they see everything they can equip.
const WANTS_SPELL = ['Mage', 'Warlock', 'Priest', 'Paladin', 'Shaman', 'Druid']
const WANTS_PHYSICAL = ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Shaman', 'Druid']
const WANTS_HEALING = ['Priest', 'Paladin', 'Shaman', 'Druid']
const WANTS_TANKING = ['Warrior', 'Paladin', 'Druid']

// An item is listed for every class that can equip it and has a use for its stats. The old rule
// guessed one "intended" group per item, which hid cloaks, rings, weapons and off-armor pieces
// from classes that really do reserve them.
function classesFor(name, text, slot) {
  const listed = classLine(text)
  if (listed) return listed

  if (/Fallen Champion|Vanquished Champion/i.test(name)) return CHAMPION
  if (/Fallen Defender|Vanquished Defender/i.test(name)) return DEFENDER
  if (/Fallen Hero|Vanquished Hero/i.test(name)) return HERO
  if (/Forgotten Conqueror/i.test(name)) return CONQUEROR
  if (/Forgotten Protector/i.test(name)) return PROTECTOR
  if (/Forgotten Vanquisher/i.test(name)) return VANQUISHER

  if (slot === 'Mount' || slot === 'Recipe' || slot === 'Gem' || slot === 'Quest' || slot === 'Other') return ALL
  if (slot === 'Relic') {
    if (/Idol/i.test(text) || /Idol/i.test(name)) return ['Druid']
    if (/Libram/i.test(text) || /Libram/i.test(name)) return ['Paladin']
    if (/Totem/i.test(text) || /Totem/i.test(name)) return ['Shaman']
  }

  let equip = ALL
  const armor = slot === 'Back' ? null : armorType(text)
  const weapon = weaponType(text)
  if (armor && CAN_WEAR[armor]) equip = CAN_WEAR[armor]
  else if (weapon === 'Shield' || slot === 'Shield') equip = CAN_WIELD.Shield
  else if (weapon && slot === 'Two-Hand' && CAN_WIELD[`${weapon}2H`]) equip = CAN_WIELD[`${weapon}2H`]
  else if (weapon && CAN_WIELD[weapon]) equip = CAN_WIELD[weapon]

  const caster = isHeal(text) || isSpell(text)
  const physical = isTank(text) || isAgi(text) || isStr(text)
  // Dodge alone also shows up on rogue and feral gear, so it does not make an item tank-only.
  const tankOnly = /defense rating|increased defense|parry rating|block rating|block value|shield block/i.test(text)
  let wants = ALL
  if (caster && !physical) wants = isHeal(text) ? WANTS_HEALING : WANTS_SPELL
  else if (physical && !caster) wants = tankOnly ? WANTS_TANKING : WANTS_PHYSICAL

  const both = ALL.filter((cls) => equip.includes(cls) && wants.includes(cls))
  return both.length ? both : equip
}

// Bosses keep the strict filter. Trash and recipe lists are exactly the small stuff people asked
// to reserve, so they keep rares, recipes and gems.
function shouldSkip(data, name, text, loose) {
  if (!data || !name) return true
  if (/\b\d+\s+Slot Bag\b|\bBag\b/.test(text) && /Slot/.test(text)) return true
  if (/Satchel|Sack of Gems|Black Sack/i.test(name)) return true
  if (loose) return data.quality != null && data.quality < 3
  if (SKIP_NAME.test(name)) return true
  if (data.quality != null && data.quality < 4 && !/mount|reins/i.test(name)) return true
  if (/Matches a .+ Socket/i.test(text)) return true
  return false
}

function looseSlot(text, name, slot) {
  if (SKIP_NAME.test(name)) return 'Recipe'
  if (/Matches a .+ Socket/i.test(text)) return 'Gem'
  if (/Begins a Quest/i.test(text)) return 'Quest'
  return slot
}

function loadCache() {
  if (!existsSync(CACHE_PATH)) return {}
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveCache(cache) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache))
}

async function tooltip(id, cache) {
  const key = String(id)
  if (cache[key]) return cache[key]
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://nether.wowhead.com/tooltip/item/${id}?dataEnv=5`)
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
      continue
    }
    if (!res.ok) throw new Error(`${id} ${res.status}`)
    const data = await res.json()
    cache[key] = data
    return data
  }
  throw new Error(`${id} rate limited`)
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return out
}

const CLASS_NAME = Object.fromEntries(ALL.map((name) => [name.toUpperCase(), name]))

// The released addon's Data.lua can be ahead of items.ts, so both are read and merged.
function loadExisting() {
  const src = readFileSync(new URL('../src/data/items.ts', import.meta.url), 'utf8')
  const start = src.indexOf('= [')
  if (start < 0) throw new Error('could not find items array')
  const items = JSON.parse(src.slice(start + 2)).map((item) => ({ ...item, raidId: item.raidId || 'karazhan' }))
  const luaPath = new URL('../wow-addon/RaidNight/Data.lua', import.meta.url)
  if (!existsSync(luaPath)) return items
  const have = new Set(items.map((item) => `${item.raidId}:${item.id}`))
  const unquote = (text) => text.replace(/\\(.)/g, '$1')
  const field = '"((?:[^"\\\\]|\\\\.)*)"'
  const row = new RegExp(
    `\\{ id = (\\d+), name = ${field}, icon = ${field}, slot = ${field}, boss = ${field}, raid = ${field}, classes = ${field} \\}`,
    'g',
  )
  for (const m of readFileSync(luaPath, 'utf8').matchAll(row)) {
    const item = {
      id: Number(m[1]),
      name: unquote(m[2]),
      icon: unquote(m[3]),
      slot: unquote(m[4]),
      boss: unquote(m[5]),
      classes: m[7].split(',').map((cls) => CLASS_NAME[cls]).filter(Boolean),
      raidId: unquote(m[6]),
    }
    if (have.has(`${item.raidId}:${item.id}`)) continue
    have.add(`${item.raidId}:${item.id}`)
    // Keep it next to the rest of its boss.
    let at = -1
    items.forEach((other, i) => {
      if (other.raidId === item.raidId && other.boss === item.boss) at = i
    })
    if (at < 0) items.forEach((other, i) => (other.raidId === item.raidId ? (at = i) : null))
    items.splice(at + 1, 0, item)
  }
  return items
}

const lua = await (await fetch(ATLAS_URL)).text()
const cache = loadCache()
const existing = loadExisting()
const seen = new Set(existing.map((item) => `${item.raidId}:${item.id}`))
const added = []

const EXTRA_LISTS = { Trash: 'Trash', Patterns: 'Recipes' }

for (const [atlasKey, raidId] of Object.entries({ Karazhan: 'karazhan', ...RAIDS })) {
  const bosses = parseBosses(extractDataBlock(lua, atlasKey))
  for (const boss of bosses) {
    const loose = Boolean(EXTRA_LISTS[boss.name])
    if (!loose) {
      // Karazhan's boss loot is a hand-checked list; only its trash and recipes come from here.
      if (raidId === 'karazhan') continue
      if (SKIP_BOSSES.has(boss.name)) continue
      if (boss.extra && boss.name !== 'Timed Chest') continue
    }
    const short =
      EXTRA_LISTS[boss.name] || BOSS_SHORT[boss.name] || boss.name.replace(/^(The|High Warlord|High King|Shade of)\s+/i, '')
    const unique = [...new Set(boss.ids.filter((id) => !SKIP_IDS.has(id) && !seen.has(`${raidId}:${id}`)))]
    const rows = await mapPool(unique, 8, async (id) => {
      try {
        const data = await tooltip(id, cache)
        const text = stripHtml(data.tooltip)
        if (shouldSkip(data, data.name, text, loose)) return null
        const slot = looseSlot(text, data.name, detectSlot(text, data.name))
        // A boss's quest starters turn in for loot (Magtheridon's Head, Verdant Sphere), so they stay.
        if (!loose && slot === 'Other') return null
        return { id, name: data.name, icon: data.icon, slot, boss: short, classes: ALL, raidId }
      } catch (err) {
        console.warn('skip', id, err.message)
        return null
      }
    })
    for (const row of rows.filter(Boolean)) {
      if (seen.has(`${raidId}:${row.id}`)) continue
      seen.add(`${raidId}:${row.id}`)
      added.push(row)
    }
    console.log(raidId, short, `+${rows.filter(Boolean).length}`)
  }
  saveCache(cache)
}

// Per raid: the existing rows in their order, then anything new grouped after its boss.
const RAID_ORDER = ['karazhan', 'gruul', 'magtheridon', 'ssc', 'tk', 'hyjal', 'bt', 'za', 'swp']
const merged = []
for (const raidId of RAID_ORDER) {
  const rows = existing.filter((item) => item.raidId === raidId)
  for (const item of added.filter((row) => row.raidId === raidId)) {
    let at = -1
    rows.forEach((other, i) => (other.boss === item.boss ? (at = i) : null))
    rows.splice(at < 0 ? rows.length : at + 1, 0, item)
  }
  merged.push(...rows)
}

// Every item gets its class list from the same rule, including the ones already on the list.
let changed = 0
await mapPool(merged, 8, async (item) => {
  try {
    const data = await tooltip(item.id, cache)
    const text = stripHtml(data.tooltip)
    // An older build read "Mounting" in an item's name as a mount.
    if (item.slot === 'Mount' && item.raidId !== 'karazhan') item.slot = detectSlot(text, item.name)
    const classes = classesFor(item.name, text, item.slot)
    if (classes.join() !== item.classes.join()) changed += 1
    item.classes = classes
  } catch (err) {
    console.warn('kept old classes for', item.id, err.message)
  }
})
saveCache(cache)

const file = `import type { Item } from '../types'

export const items: Item[] = ${JSON.stringify(merged, null, 2)}
`
writeFileSync(new URL('../src/data/items.ts', import.meta.url), file)
console.log('wrote', merged.length, 'items:', added.length, 'new,', changed, 'class lists changed')
mkdirSync(dirname(CACHE_PATH), { recursive: true })
