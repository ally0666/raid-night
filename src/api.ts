import type { Character, Raider, Role, WowClass } from './types'

export type PublicUser = {
  id: string
  lead: boolean
  displayName: string
  discord: { id: string; username: string; globalName: string | null } | null
  battlenet: { id: string; battletag: string } | null
}

export type Providers = {
  discord: boolean
  battlenet: boolean
  demo: { discord: boolean; battlenet: boolean }
}

export type SavedCharacter = Character & {
  userId: string
  realm: string
  source: 'manual' | 'battlenet'
  lastPicks: number[]
}

export type RaidState = {
  name: string
  when: string
  dateLabel: string
  size: number
  pickLimit: number
  lockLabel: string
  locked: boolean
  roster: Raider[]
}

export type WowImport = {
  name: string
  realm: string
  className: WowClass
  spec?: string
  role?: Role
  level?: number
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  })
  const text = await res.text()
  let data: { error?: string } | T | null = null
  if (text) {
    try {
      data = JSON.parse(text) as T
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const errBody = data as { error?: unknown } | null
    const message = typeof errBody?.error === 'string' ? errBody.error : res.statusText
    throw new ApiError(res.status, message)
  }
  return data as T
}

export const api = {
  me: () =>
    req<{ user: PublicUser | null; characters: SavedCharacter[]; providers: Providers }>('/api/me'),
  raid: () => req<RaidState>('/api/raid'),
  demoLogin: (provider: 'discord' | 'battlenet', persona: 'nyx' | 'officer') =>
    req<{ user: PublicUser | null; characters: SavedCharacter[]; providers: Providers }>(
      '/api/auth/demo',
      { method: 'POST', body: JSON.stringify({ provider, persona }) },
    ),
  logout: () => req<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  unlink: (provider: 'discord' | 'battlenet') =>
    req<{ user: PublicUser | null; characters: SavedCharacter[]; providers: Providers }>(
      '/api/auth/unlink',
      { method: 'POST', body: JSON.stringify({ provider }) },
    ),
  addCharacter: (body: {
    name: string
    className: WowClass
    spec: string
    role: Role
    realm?: string
  }) => req<{ character: SavedCharacter }>('/api/characters', { method: 'POST', body: JSON.stringify(body) }),
  wowCharacters: () => req<{ characters: WowImport[] }>('/api/wow/characters'),
  importWow: (characters: WowImport[]) =>
    req<{ characters: SavedCharacter[] }>('/api/wow/import', {
      method: 'POST',
      body: JSON.stringify({ characters }),
    }),
  signup: (body: { characterId: string; picks: number[] }) =>
    req<RaidState>('/api/raid/signup', { method: 'POST', body: JSON.stringify(body) }),
  lock: (locked: boolean) =>
    req<RaidState>('/api/raid/lock', { method: 'POST', body: JSON.stringify({ locked }) }),
  reset: () => req<RaidState>('/api/raid/reset', { method: 'POST' }),
  addRosterMember: (body: { name: string; className: WowClass; spec: string; role: Role }) =>
    req<RaidState>('/api/raid/roster', { method: 'POST', body: JSON.stringify(body) }),
  removeRosterMember: (id: string) => req<RaidState>(`/api/raid/roster/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
