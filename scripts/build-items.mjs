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
  if (/Mount|summons a/i.test(text) || /reins of/i.test(name)) return 'Mount'
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

function classesFor(name, text, slot) {
  const listed = classLine(text)
  if (listed) return listed

  if (/Fallen Champion|Vanquished Champion/i.test(name)) return CHAMPION
  if (/Fallen Defender|Vanquished Defender/i.test(name)) return DEFENDER
  if (/Fallen Hero|Vanquished Hero/i.test(name)) return HERO
  if (/Forgotten Conqueror/i.test(name)) return CONQUEROR
  if (/Forgotten Protector/i.test(name)) return PROTECTOR
  if (/Forgotten Vanquisher/i.test(name)) return VANQUISHER

  if (slot === 'Mount') return ALL
  if (slot === 'Relic') {
    if (/Idol/i.test(text) || /Idol/i.test(name)) return ['Druid']
    if (/Libram/i.test(text) || /Libram/i.test(name)) return ['Paladin']
    if (/Totem/i.test(text) || /Totem/i.test(name)) return ['Shaman']
  }

  const armor = armorType(text)
  const weapon = weaponType(text)
  const heal = isHeal(text)
  const spell = isSpell(text)
  const tank = isTank(text)
  const agi = isAgi(text)
  const str = isStr(text)

  if (armor === 'Cloth') return heal && !spell ? CLOTH_HEAL : CLOTH_CASTER
  if (armor === 'Leather') return heal && !agi ? LEATHER_HEAL : LEATHER_AGI
  if (armor === 'Mail') return heal && !agi ? MAIL_HEAL : MAIL_AGI
  if (armor === 'Plate') {
    if (heal && !str && !tank) return PLATE_HEAL
    if (tank && !str) return PLATE_TANK
    if (heal) return PLATE_HEAL
    if (tank) return PLATE_TANK
    return PLATE_DPS
  }

  if (weapon === 'Wand') return WAND
  if (weapon === 'Thrown') return THROWN
  if (weapon === 'Fist') return FIST
  if (weapon === 'Bow' || weapon === 'Gun') return BOW
  if (weapon === 'Crossbow') return HUNTER_RANGED
  if (weapon === 'Polearm') return POLEARM
  if (weapon === 'Staff') return heal ? HEAL_STAFF : CASTER_STAFF
  if (weapon === 'Dagger') {
    if (spell || heal) return CASTER_DAGGER
    return AGI_DAGGER
  }
  if (weapon === 'Sword') {
    if (slot === 'Two-Hand') return SWORD_2H
    if (spell) return ['Mage', 'Warlock']
    return SWORD_1H
  }
  if (weapon === 'Axe') return slot === 'Two-Hand' ? AXE_2H : AXE_1H
  if (weapon === 'Mace') return heal || spell ? MACE_HEAL : MACE_MELEE
  if (weapon === 'Shield' || slot === 'Shield') return SHIELD

  if (tank) return TANK
  if (heal && !agi && !str) return HEALER
  if (spell && !agi && !str) return CASTER
  if (agi && !str) return AGI
  if (str && !agi) return STR
  return ALL
}

function shouldSkip(data, name, text) {
  if (!data || !name) return true
  if (SKIP_NAME.test(name)) return true
  if (data.quality != null && data.quality < 4 && !/mount|reins/i.test(name)) return true
  if (/Begins a Quest|This Item Begins a Quest/i.test(text)) return true
  if (/\b\d+\s+Slot Bag\b|\bBag\b/.test(text) && /Slot/.test(text)) return true
  if (/Matches a .+ Socket/i.test(text)) return true
  if (/Satchel|Sack of Gems|Black Sack/i.test(name)) return true
  return false
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

function loadKara() {
  const src = readFileSync(new URL('../src/data/items.ts', import.meta.url), 'utf8')
  const start = src.indexOf('= [')
  if (start < 0) throw new Error('could not find items array')
  const items = JSON.parse(src.slice(start + 2))
  return items.map((item) => ({ ...item, raidId: item.raidId || 'karazhan' }))
}

const lua = await (await fetch(ATLAS_URL)).text()
const cache = loadCache()
const extra = []

for (const [atlasKey, raidId] of Object.entries(RAIDS)) {
  const block = extractDataBlock(lua, atlasKey)
  const bosses = parseBosses(block)
  for (const boss of bosses) {
    if (SKIP_BOSSES.has(boss.name)) continue
    if (boss.extra && boss.name !== 'Timed Chest') continue
    const short = BOSS_SHORT[boss.name] || boss.name.replace(/^(The|High Warlord|High King|Shade of)\s+/i, '')
    const unique = [...new Set(boss.ids.filter((id) => !SKIP_IDS.has(id)))]
    console.log(raidId, short, unique.length)
    const rows = await mapPool(unique, 8, async (id) => {
      try {
        const data = await tooltip(id, cache)
        const text = stripHtml(data.tooltip)
        if (shouldSkip(data, data.name, text)) return null
        const slot = detectSlot(text, data.name)
        if (slot === 'Other' && /quest/i.test(text)) return null
        return {
          id,
          name: data.name,
          icon: data.icon,
          slot,
          boss: short,
          classes: classesFor(data.name, text, slot),
          raidId,
        }
      } catch (err) {
        console.warn('skip', id, err.message)
        return null
      }
    })
    extra.push(...rows.filter(Boolean))
  }
  saveCache(cache)
}

const kara = loadKara().filter((item) => (item.raidId || 'karazhan') === 'karazhan')
const seen = new Set(kara.map((item) => `${item.raidId}:${item.id}`))
const merged = [...kara]
for (const item of extra) {
  const key = `${item.raidId}:${item.id}`
  if (seen.has(key)) continue
  seen.add(key)
  merged.push(item)
}

const file = `import type { Item } from '../types'

export const items: Item[] = ${JSON.stringify(merged, null, 2)}
`
writeFileSync(new URL('../src/data/items.ts', import.meta.url), file)
console.log('wrote', merged.length, 'items', `(kara ${kara.length}, extra ${extra.length})`)
mkdirSync(dirname(CACHE_PATH), { recursive: true })
saveCache(cache)
