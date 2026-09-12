import type { Item, Raider, Role, WowClass } from './types'
import { items } from './data/items'

export const classColor: Record<WowClass, string> = {
  Warrior: '#C79C6E',
  Paladin: '#F58CBA',
  Hunter: '#ABD473',
  Rogue: '#FFF569',
  Priest: '#FFFFFF',
  Shaman: '#0070DE',
  Mage: '#69CCF0',
  Warlock: '#9482C9',
  Druid: '#FF7D0A',
}

export const roleLabel: Record<Role, string> = {
  tank: 'Tank',
  healer: 'Healer',
  dps: 'Damage',
}

export const wowClasses: WowClass[] = [
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

export function itemsForRaid(instanceId: string) {
  return items.filter((item) => (item.raidId || 'karazhan') === instanceId)
}

export function bossesFor(instanceId: string) {
  return [...new Set(itemsForRaid(instanceId).map((item) => item.boss))]
}

export function iconUrl(icon: string) {
  return `https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg`
}

export function itemById(id: number) {
  return items.find((item: Item) => item.id === id)
}

export function usableBy(item: Item, className: WowClass) {
  return item.classes.includes(className)
}

export function pickCount(roster: Raider[], itemId: number) {
  return roster.reduce((n, raider) => n + raider.picks.filter((id) => id === itemId).length, 0)
}

export function missingPicks(roster: Raider[], limit: number) {
  return roster.filter((raider) => raider.signed && raider.picks.length < limit)
}

export function composition(roster: Raider[]) {
  const signed = roster.filter((r) => r.signed)
  return {
    signed: signed.length,
    tank: signed.filter((r) => r.role === 'tank').length,
    healer: signed.filter((r) => r.role === 'healer').length,
    dps: signed.filter((r) => r.role === 'dps').length,
  }
}
