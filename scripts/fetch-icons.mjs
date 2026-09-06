import { writeFileSync } from 'node:fs'

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
const HERO = ['Hunter', 'Mage', 'Warlock']
const CHAMPION = ['Paladin', 'Rogue', 'Shaman']
const DEFENDER = ['Warrior', 'Priest', 'Druid']
const CLOAK_CASTER = ['Mage', 'Warlock', 'Priest', 'Druid', 'Shaman']
const CLOAK_HEAL = ['Priest', 'Paladin', 'Shaman', 'Druid']
const CLOAK_STR = ['Warrior', 'Paladin']
const CLOAK_AGI = ['Rogue', 'Hunter', 'Warrior', 'Druid', 'Shaman']
const RING_CASTER = CASTER
const RING_HEAL = HEALER
const RING_TANK = TANK
const RING_AGI = AGI
const NECK_CASTER = CASTER
const NECK_HEAL = HEALER
const NECK_TANK = TANK
const NECK_AGI = AGI

const raw = [
  [30480, 'Mount', 'Attumen', ALL],
  [28504, 'Ranged', 'Attumen', HUNTER_RANGED],
  [28508, 'Hands', 'Attumen', CLOTH_HEAL],
  [28507, 'Hands', 'Attumen', CLOTH_CASTER],
  [28477, 'Wrist', 'Attumen', CLOTH_HEAL],
  [28453, 'Wrist', 'Attumen', LEATHER_HEAL],
  [28506, 'Hands', 'Attumen', LEATHER_AGI],
  [28454, 'Wrist', 'Attumen', MAIL_AGI],
  [28503, 'Wrist', 'Attumen', MAIL_HEAL],
  [28505, 'Hands', 'Attumen', PLATE_HEAL],
  [28502, 'Wrist', 'Attumen', PLATE_TANK],
  [28510, 'Finger', 'Attumen', RING_CASTER],
  [28509, 'Neck', 'Attumen', NECK_AGI],

  [28528, 'Trinket', 'Moroes', TANK],
  [28565, 'Waist', 'Moroes', CLOTH_HEAL],
  [28545, 'Feet', 'Moroes', LEATHER_AGI],
  [28567, 'Waist', 'Moroes', MAIL_HEAL],
  [28569, 'Feet', 'Moroes', PLATE_HEAL],
  [28566, 'Waist', 'Moroes', PLATE_TANK],
  [28529, 'Back', 'Moroes', CLOAK_STR],
  [28570, 'Back', 'Moroes', CLOAK_CASTER],
  [28530, 'Neck', 'Moroes', NECK_CASTER],
  [28524, 'One-Hand', 'Moroes', AGI_DAGGER],
  [28525, 'Off-hand', 'Moroes', HEALER],
  [28568, 'Relic', 'Moroes', ['Druid']],

  [28514, 'Wrist', 'Maiden', LEATHER_AGI],
  [28511, 'Wrist', 'Maiden', CLOTH_HEAL],
  [28515, 'Wrist', 'Maiden', CLOTH_CASTER],
  [28516, 'Neck', 'Maiden', NECK_TANK],
  [28517, 'Feet', 'Maiden', CLOTH_CASTER],
  [28512, 'Wrist', 'Maiden', PLATE_HEAL],
  [28520, 'Hands', 'Maiden', MAIL_HEAL],
  [28519, 'Hands', 'Maiden', MAIL_AGI],
  [28518, 'Hands', 'Maiden', PLATE_TANK],
  [28521, 'Hands', 'Maiden', LEATHER_HEAL],
  [28522, 'Main Hand', 'Maiden', MACE_HEAL],
  [28523, 'Relic', 'Maiden', ['Shaman']],

  [28581, 'Ranged', 'Opera', HUNTER_RANGED],
  [28583, 'Head', 'Opera', MAIL_HEAL],
  [28584, 'Main Hand', 'Opera', FIST],
  [28582, 'Back', 'Opera', CLOAK_HEAL],
  [28594, 'Legs', 'Opera', CLOTH_CASTER],
  [28589, 'Shoulder', 'Opera', MAIL_AGI],
  [28593, 'Head', 'Opera', PLATE_TANK],
  [28592, 'Relic', 'Opera', ['Paladin']],
  [28590, 'Trinket', 'Opera', HEALER],
  [28591, 'Legs', 'Opera', LEATHER_HEAL],
  [28585, 'Feet', 'Opera', CLOTH_CASTER],
  [28586, 'Head', 'Opera', CLOTH_CASTER],
  [28588, 'Ranged', 'Opera', WAND],
  [28587, 'Two-Hand', 'Opera', AXE_2H],
  [28573, 'Two-Hand', 'Opera', SWORD_2H],
  [28578, 'Chest', 'Opera', CLOTH_HEAL],
  [28572, 'One-Hand', 'Opera', AGI_DAGGER],
  [28579, 'Trinket', 'Opera', AGI],

  [29757, 'Token', 'Curator', CHAMPION],
  [29758, 'Token', 'Curator', DEFENDER],
  [29756, 'Token', 'Curator', HERO],
  [28647, 'Shoulder', 'Curator', LEATHER_HEAL],
  [28612, 'Shoulder', 'Curator', CLOTH_HEAL],
  [28631, 'Shoulder', 'Curator', MAIL_HEAL],
  [28649, 'Finger', 'Curator', RING_AGI],
  [28633, 'Two-Hand', 'Curator', CASTER_STAFF],
  [28621, 'Legs', 'Curator', PLATE_TANK],

  [28657, 'Main Hand', 'Illhoof', MACE_MELEE],
  [28661, 'Finger', 'Illhoof', RING_HEAL],
  [28662, 'Chest', 'Illhoof', PLATE_HEAL],
  [28652, 'Waist', 'Illhoof', CLOTH_HEAL],
  [28655, 'Waist', 'Illhoof', MAIL_AGI],
  [28654, 'Waist', 'Illhoof', CLOTH_CASTER],
  [28653, 'Back', 'Illhoof', CLOAK_HEAL],
  [28658, 'Two-Hand', 'Illhoof', HEAL_STAFF],
  [28785, 'Trinket', 'Illhoof', CASTER],
  [28659, 'Thrown', 'Illhoof', THROWN],

  [28728, 'Off-hand', 'Aran', HEALER],
  [28663, 'Feet', 'Aran', CLOTH_HEAL],
  [28670, 'Feet', 'Aran', CLOTH_CASTER],
  [28672, 'Back', 'Aran', CLOAK_AGI],
  [28726, 'Shoulder', 'Aran', CLOTH_CASTER],
  [28666, 'Shoulder', 'Aran', PLATE_HEAL],
  [28727, 'Trinket', 'Aran', CASTER],
  [28669, 'Feet', 'Aran', LEATHER_AGI],
  [28674, 'Neck', 'Aran', NECK_AGI],
  [28675, 'Finger', 'Aran', RING_TANK],
  [28671, 'Head', 'Aran', MAIL_AGI],
  [28673, 'Ranged', 'Aran', WAND],

  [28732, 'Head', 'Netherspite', LEATHER_AGI],
  [28733, 'Waist', 'Netherspite', PLATE_HEAL],
  [28734, 'Off-hand', 'Netherspite', CASTER],
  [28730, 'Finger', 'Netherspite', RING_TANK],
  [28731, 'Neck', 'Netherspite', NECK_HEAL],
  [28744, 'Head', 'Netherspite', CLOTH_CASTER],
  [28735, 'Chest', 'Netherspite', MAIL_HEAL],
  [28743, 'Shoulder', 'Netherspite', PLATE_TANK],
  [28742, 'Legs', 'Netherspite', CLOTH_HEAL],
  [28740, 'Legs', 'Netherspite', MAIL_AGI],
  [28741, 'Legs', 'Netherspite', LEATHER_AGI],
  [28729, 'One-Hand', 'Netherspite', SWORD_1H],

  [28746, 'Feet', 'Chess', MAIL_AGI],
  [28751, 'Legs', 'Chess', MAIL_HEAL],
  [28749, 'One-Hand', 'Chess', SWORD_1H],
  [28748, 'Legs', 'Chess', PLATE_HEAL],
  [28745, 'Neck', 'Chess', NECK_AGI],
  [28754, 'Shield', 'Chess', SHIELD],
  [28747, 'Feet', 'Chess', PLATE_TANK],
  [28755, 'Shoulder', 'Chess', LEATHER_AGI],
  [28752, 'Feet', 'Chess', LEATHER_HEAL],
  [28750, 'Waist', 'Chess', LEATHER_AGI],
  [28756, 'Head', 'Chess', CLOTH_HEAL],
  [28753, 'Finger', 'Chess', RING_CASTER],

  [29759, 'Token', 'Prince', HERO],
  [29761, 'Token', 'Prince', DEFENDER],
  [29760, 'Token', 'Prince', CHAMPION],
  [28764, 'Back', 'Prince', CLOAK_AGI],
  [28762, 'Neck', 'Prince', NECK_CASTER],
  [28773, 'Two-Hand', 'Prince', AXE_2H],
  [28763, 'Finger', 'Prince', RING_HEAL],
  [28771, 'Main Hand', 'Prince', MACE_HEAL],
  [28768, 'One-Hand', 'Prince', AGI_DAGGER],
  [28770, 'Main Hand', 'Prince', CASTER_DAGGER],
  [28757, 'Finger', 'Prince', RING_AGI],
  [28766, 'Back', 'Prince', CLOAK_CASTER],
  [28765, 'Back', 'Prince', CLOAK_HEAL],
  [28767, 'Main Hand', 'Prince', AXE_1H],
  [28772, 'Ranged', 'Prince', BOW],

  [28611, 'Shield', 'Nightbane', SHIELD],
  [28600, 'Chest', 'Nightbane', LEATHER_HEAL],
  [28601, 'Chest', 'Nightbane', LEATHER_AGI],
  [28609, 'Neck', 'Nightbane', NECK_HEAL],
  [28610, 'Feet', 'Nightbane', MAIL_AGI],
  [28608, 'Feet', 'Nightbane', PLATE_DPS],
  [28604, 'Two-Hand', 'Nightbane', HEAL_STAFF],
  [28597, 'Chest', 'Nightbane', PLATE_TANK],
  [28602, 'Chest', 'Nightbane', CLOTH_CASTER],
  [28599, 'Chest', 'Nightbane', MAIL_AGI],
  [28603, 'Off-hand', 'Nightbane', CASTER],
  [28606, 'Shield', 'Nightbane', SHIELD],
]

async function tooltip(id) {
  const res = await fetch(`https://nether.wowhead.com/tooltip/item/${id}?dataEnv=8`)
  if (!res.ok) throw new Error(`${id} ${res.status}`)
  return res.json()
}

const items = []
for (const [id, slot, boss, classes] of raw) {
  const data = await tooltip(id)
  items.push({
    id,
    name: data.name,
    icon: data.icon,
    slot,
    boss,
    classes,
  })
  console.log(id, data.name, data.icon)
}

const file = `import type { Item } from '../types'

export const items: Item[] = ${JSON.stringify(items, null, 2)}
`
writeFileSync(new URL('../src/data/items.ts', import.meta.url), file)
console.log('wrote', items.length, 'items')
