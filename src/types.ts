export type WowClass =
  | 'Warrior'
  | 'Paladin'
  | 'Hunter'
  | 'Rogue'
  | 'Priest'
  | 'Shaman'
  | 'Mage'
  | 'Warlock'
  | 'Druid'

export type Role = 'tank' | 'healer' | 'dps'

export type View =
  | 'home'
  | 'create'
  | 'invite'
  | 'login'
  | 'account'
  | 'character'
  | 'confirm'
  | 'picks'
  | 'done'
  | 'lead'

export type Item = {
  id: number
  name: string
  icon: string
  slot: string
  boss: string
  classes: WowClass[]
  raidId?: string
}

export type Character = {
  id: string
  name: string
  className: WowClass
  spec: string
  role: Role
  realm?: string
  lastPicks?: number[]
  source?: 'manual' | 'battlenet'
}

export type Raider = {
  id: string
  name: string
  className: WowClass
  spec: string
  role: Role
  signed: boolean
  picks: number[]
  you?: boolean
  discord?: string | null
  battletag?: string | null
}
