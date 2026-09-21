import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CLASS_FILE = {
  Warrior: 'WARRIOR',
  Paladin: 'PALADIN',
  Hunter: 'HUNTER',
  Rogue: 'ROGUE',
  Priest: 'PRIEST',
  Shaman: 'SHAMAN',
  Mage: 'MAGE',
  Warlock: 'WARLOCK',
  Druid: 'DRUID',
}

const INSTANCES = [
  { id: 'karazhan', name: 'Karazhan' },
  { id: 'gruul', name: "Gruul's Lair" },
  { id: 'magtheridon', name: "Magtheridon's Lair" },
  { id: 'ssc', name: 'Serpentshrine Cavern' },
  { id: 'tk', name: 'The Eye' },
  { id: 'hyjal', name: 'Hyjal Summit' },
  { id: 'bt', name: 'Black Temple' },
  { id: 'za', name: "Zul'Aman" },
  { id: 'swp', name: 'Sunwell Plateau' },
]

const src = readFileSync(new URL('../src/data/items.ts', import.meta.url), 'utf8')
const items = JSON.parse(src.slice(src.indexOf('= [') + 2))

function luaString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const lines = []
lines.push('-- Generated from src/data/items.ts. Do not edit by hand.')
lines.push('RaidNightData = RaidNightData or {}')
lines.push('RaidNightData.instances = {')
for (const row of INSTANCES) {
  lines.push(`  { id = ${luaString(row.id)}, name = ${luaString(row.name)} },`)
}
lines.push('}')
lines.push('RaidNightData.items = {')
for (const item of items) {
  const raid = item.raidId || 'karazhan'
  const classes = (item.classes || []).map((name) => CLASS_FILE[name]).filter(Boolean).join(',')
  lines.push(
    `  { id = ${item.id}, name = ${luaString(item.name)}, icon = ${luaString(item.icon)}, slot = ${luaString(item.slot)}, boss = ${luaString(item.boss)}, raid = ${luaString(raid)}, classes = ${luaString(classes)} },`,
  )
}
lines.push('}')
lines.push('')

const outDir = fileURLToPath(new URL('../wow-addon/RaidNight', import.meta.url))
mkdirSync(outDir, { recursive: true })
writeFileSync(new URL('../wow-addon/RaidNight/Data.lua', import.meta.url), lines.join('\n'))
console.log('wrote', items.length, 'items')
