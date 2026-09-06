import { inflate } from 'pako'
import { gargulExportString, gargulPayload } from '../src/gargul.ts'
import { seedRoster } from '../src/data/roster.ts'

const roster = [
  ...seedRoster,
  {
    id: 'you',
    name: 'Nyx',
    className: 'Warlock',
    spec: 'Affliction',
    role: 'dps',
    signed: true,
    picks: [29756, 28633],
    you: true,
  },
]

const payload = gargulPayload(roster)
if (!payload.metadata.id) throw new Error('missing metadata.id')
if (!Array.isArray(payload.softreserves)) throw new Error('softreserves')
if (!Array.isArray(payload.hardreserves)) throw new Error('hardreserves')
const nyx = payload.softreserves.find((p) => p.name === 'nyx')
if (!nyx || nyx.class !== 'warlock') throw new Error('nyx class')
if (nyx.items[0].id !== 29756) throw new Error('item id')

const encoded = gargulExportString(roster)
if (encoded.includes(',')) throw new Error('comma would trip Gargul CSV path')

const binary = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
const json = new TextDecoder().decode(inflate(binary))
const decoded = JSON.parse(json)
if (decoded.softreserves.length !== payload.softreserves.length) throw new Error('roundtrip count')
if (!decoded.metadata.id) throw new Error('roundtrip id')
console.log('ok', decoded.softreserves.length, 'players', encoded.length, 'chars')
