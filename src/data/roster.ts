import type { Character, Raider } from '../types'

export const youCharacters: Character[] = [
  {
    id: 'you-main',
    name: 'Nyx',
    className: 'Warlock',
    spec: 'Affliction',
    role: 'dps',
  },
  {
    id: 'you-alt',
    name: 'Nyxara',
    className: 'Mage',
    spec: 'Frost',
    role: 'dps',
  },
]

export const lastWeekPicks: Record<string, number[]> = {
  'you-main': [29756, 28633],
  'you-alt': [28633, 28770],
}

export const seedRoster: Raider[] = [
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

export const raid = {
  name: 'Karazhan',
  when: 'Tuesday · 8:00 PM',
  dateLabel: 'Tue, Sep 1',
  size: 10,
  pickLimit: 2,
  lockLabel: '7:45 PM',
}
