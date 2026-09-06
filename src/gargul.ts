import { deflate } from 'pako'
import type { Raider } from './types'

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function classKey(className: string) {
  return className.toLowerCase()
}

export function playersForGargul(roster: Raider[]) {
  return roster.filter((r) => r.signed && r.picks.length > 0)
}

export function gargulPayload(roster: Raider[], raidId = 'kara-night') {
  const now = Math.floor(Date.now() / 1000)
  return {
    metadata: {
      id: raidId,
      createdAt: now,
      updatedAt: now,
      discordUrl: '',
      hidden: false,
      url: '',
      raidStartsAt: now,
    },
    softreserves: playersForGargul(roster).map((raider) => ({
      name: raider.name.toLowerCase(),
      class: classKey(raider.className),
      note: '',
      plusOnes: 0,
      items: raider.picks.map((id) => ({ id })),
    })),
    hardreserves: [] as { id: number; for: string; note: string }[],
  }
}

export function gargulExportString(roster: Raider[]) {
  const json = JSON.stringify(gargulPayload(roster))
  const compressed = deflate(new TextEncoder().encode(json))
  return bytesToBase64(compressed)
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.left = '-9999px'
    document.body.appendChild(field)
    field.select()
    const ok = document.execCommand('copy')
    field.remove()
    return ok
  }
}

export function gargulCsv(roster: Raider[]) {
  const lines = ['ItemId,Name,Class,Note,Plus']
  for (const raider of playersForGargul(roster)) {
    for (const id of raider.picks) {
      lines.push(`${id},${raider.name.toLowerCase()},${classKey(raider.className)},,0`)
    }
  }
  return lines.join('\n')
}
