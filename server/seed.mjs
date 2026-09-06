export const WOW_CLASSES = [
  'Warrior',
  'Paladin',
  'Hunter',
  'Rogue',
  'Priest',
  'Shaman',
  'Mage',
  'Warlock',
  'Druid',
]

export const ROLES = ['tank', 'healer', 'dps']

export const CLASS_BY_ID = {
  1: 'Warrior',
  2: 'Paladin',
  3: 'Hunter',
  4: 'Rogue',
  5: 'Priest',
  7: 'Shaman',
  8: 'Mage',
  9: 'Warlock',
  11: 'Druid',
}

export const raidMeta = {
  name: 'Karazhan',
  when: 'Tuesday · 8:00 PM',
  dateLabel: 'Tue, Sep 8',
  size: 10,
  pickLimit: 2,
  lockLabel: '7:45 PM',
}

export const seedRoster = [
  {
    id: 'brannok',
    name: 'Brannok',
    className: 'Warrior',
    spec: 'Protection',
    role: 'tank',
    signed: true,
    picks: [28502, 28597],
  },
  {
    id: 'mirielle',
    name: 'Mirielle',
    className: 'Paladin',
    spec: 'Holy',
    role: 'healer',
    signed: true,
    picks: [28590, 28771],
  },
  {
    id: 'thistlepaw',
    name: 'Thistlepaw',
    className: 'Druid',
    spec: 'Restoration',
    role: 'healer',
    signed: true,
    picks: [],
  },
  {
    id: 'keldra',
    name: 'Keldra',
    className: 'Priest',
    spec: 'Shadow',
    role: 'dps',
    signed: true,
    picks: [28515, 28744],
  },
  {
    id: 'vexin',
    name: 'Vexin',
    className: 'Rogue',
    spec: 'Combat',
    role: 'dps',
    signed: true,
    picks: [28545],
  },
  {
    id: 'stormhorn',
    name: 'Stormhorn',
    className: 'Shaman',
    spec: 'Enhancement',
    role: 'dps',
    signed: true,
    picks: [28584, 28746],
  },
  {
    id: 'faelorn',
    name: 'Faelorn',
    className: 'Hunter',
    spec: 'Beast Mastery',
    role: 'dps',
    signed: true,
    picks: [28772, 28581],
  },
  {
    id: 'aelira',
    name: 'Aelira',
    className: 'Mage',
    spec: 'Frost',
    role: 'dps',
    signed: true,
    picks: [28633, 28770],
  },
  {
    id: 'grokk',
    name: 'Grokk',
    className: 'Warrior',
    spec: 'Fury',
    role: 'dps',
    signed: false,
    picks: [],
  },
]

const nyxCharacters = [
  {
    name: 'Nyx',
    className: 'Warlock',
    spec: 'Affliction',
    role: 'dps',
    lastPicks: [29756, 28633],
  },
  {
    name: 'Nyxara',
    className: 'Mage',
    spec: 'Frost',
    role: 'dps',
    lastPicks: [28633, 28770],
  },
]

export const demoPersonas = {
  discord: {
    nyx: {
      identity: { id: 'demo-discord-nyx', username: 'nyx', globalName: 'Nyx' },
      lead: false,
      characters: nyxCharacters,
    },
    officer: {
      identity: { id: 'demo-discord-officer', username: 'officer', globalName: 'Officer' },
      lead: true,
      characters: [],
    },
  },
  battlenet: {
    nyx: {
      identity: { id: 'demo-bnet-nyx', battletag: 'Nyx#1234' },
      lead: false,
      characters: nyxCharacters,
    },
    officer: {
      identity: { id: 'demo-bnet-officer', battletag: 'Officer#0000' },
      lead: true,
      characters: [],
    },
  },
}
