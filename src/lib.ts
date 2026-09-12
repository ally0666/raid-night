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

export function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function nextRaidDate() {
  const d = new Date()
  const add = (2 - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + add)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function formatRaidWhen(date: string, time: string) {
  const d = new Date(`${date}T${time}:00`)
  if (Number.isNaN(d.getTime())) return time
  return d.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })
}

export function formatRaidDate(date: string) {
  const d = new Date(`${date}T12:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function lockLabelFrom(time: string) {
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 'Start'
  const total = (((h * 60 + m - 15) % (24 * 60)) + 24 * 60) % (24 * 60)
  const d = new Date()
  d.setHours(Math.floor(total / 60), total % 60, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
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
