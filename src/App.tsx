import { useEffect, useMemo, useState } from 'react'
import {
  api,
  type Providers,
  type PublicUser,
  type RaidInstance,
  type RaidState,
  type RaidSummary,
  type SavedCharacter,
  type WowImport,
} from './api'
import { raid as raidFallback } from './data/roster'
import { copyText, gargulCsv, gargulExportString, playersForGargul } from './gargul'
import {
  bossesFor,
  classColor,
  composition,
  formatRaidDate,
  formatRaidWhen,
  iconUrl,
  itemById,
  itemsForRaid,
  lockLabelFrom,
  missingPicks,
  nextRaidDate,
  pickCount,
  roleLabel,
  usableBy,
  wowClasses,
} from './lib'
import type { Character, Raider, Role, View, WowClass } from './types'

const STORAGE = 'raid-night-v2'
const NEXT_KEY = 'raid-night-next'

function raidIdFromPath() {
  const match = window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]{3,80})\/?$/)
  return match ? match[1] : null
}

function reserveUrl(id: string) {
  return `${window.location.origin}/r/${id}`
}

type Saved = {
  view: View
  characterId: string
  raidId: string
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

export default function App() {
  const saved = load()
  const [view, setView] = useState<View>(raidIdFromPath() ? 'invite' : 'home')
  const [characterId, setCharacterId] = useState(saved?.characterId ?? '')
  const [raidId, setRaidId] = useState(saved?.raidId ?? '')
  const [raids, setRaids] = useState<RaidSummary[]>([])
  const [instances, setInstances] = useState<RaidInstance[]>([])
  const [roster, setRoster] = useState<Raider[]>([])
  const [locked, setLocked] = useState(false)
  const [canManageRaid, setCanManageRaid] = useState(false)
  const [picks, setPicks] = useState<number[]>([])
  const [raidInfo, setRaidInfo] = useState({
    ...raidFallback,
    id: '',
    instanceId: 'karazhan',
    instanceName: 'Karazhan',
    canManage: false,
  })
  const [user, setUser] = useState<PublicUser | null>(null)
  const [characters, setCharacters] = useState<SavedCharacter[]>([])
  const [providers, setProviders] = useState<Providers>({
    discord: false,
    battlenet: false,
    demo: { discord: true, battlenet: true },
  })
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [boss, setBoss] = useState('For you')
  const [showAll, setShowAll] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [exportBox, setExportBox] = useState('')
  const [linking, setLinking] = useState(false)

  const character = characters.find((c) => c.id === characterId) ?? characters[0] ?? null
  const youSigned = roster.some((r) => r.you && r.signed)
  const counts = composition(roster)
  const missing = missingPicks(roster, raidInfo.pickLimit)
  const demoLead = view === 'lead'

  function applyMe(payload: { user: PublicUser | null; characters: SavedCharacter[]; providers: Providers }) {
    setUser(payload.user)
    setCharacters(payload.characters)
    setProviders(payload.providers)
    setCharacterId((current) => {
      if (current && payload.characters.some((c) => c.id === current)) return current
      return payload.characters[0]?.id ?? ''
    })
  }

  function applyRaid(next: RaidState) {
    setRaidId(next.id)
    setCanManageRaid(Boolean(next.canManage))
    setRaidInfo({
      id: next.id,
      instanceId: next.instanceId,
      instanceName: next.instanceName,
      name: next.name,
      when: next.when,
      dateLabel: next.dateLabel,
      size: next.size,
      pickLimit: next.pickLimit,
      lockLabel: next.lockLabel,
      canManage: next.canManage,
    })
    setRoster(next.roster)
    setLocked(next.locked)
    const mine = next.roster.find((r) => r.you)
    if (mine) setPicks(mine.picks)
    else setPicks([])
  }

  async function refresh() {
    const [me, board, catalog] = await Promise.all([api.me(), api.raids(), api.instances()])
    applyMe(me)
    setRaids(board.raids)
    setInstances(catalog.instances)
    const fromLink = raidIdFromPath()
    if (fromLink) {
      try {
        applyRaid(await api.raid(fromLink))
        setView((current) => (current === 'login' || current === 'character' ? current : 'invite'))
      } catch {
        window.history.replaceState({}, '', '/')
        setView('home')
        flash('This reserve list is gone or the link is wrong.')
      }
    }
    return { me, raids: board.raids }
  }

  useEffect(() => {
    const data: Saved = { view, characterId, raidId }
    localStorage.setItem(STORAGE, JSON.stringify(data))
  }, [view, characterId, raidId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('auth_error')
    if (err) {
      setToast(err.slice(0, 160))
      window.history.replaceState({}, '', window.location.pathname)
    }

    refresh()
      .then(({ me }) => {
        const next = sessionStorage.getItem(NEXT_KEY) as View | null
        if (me.user && next) {
          sessionStorage.removeItem(NEXT_KEY)
          goAfterAuth(me.user, me.characters, next)
        }
      })
      .catch((err) => setToast(err instanceof Error ? err.message : 'Could not load the raid board.'))
      .finally(() => setReady(true))

    const onPop = () => {
      const id = raidIdFromPath()
      if (id) void openRaid(id)
      else setView('home')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function flash(message: string) {
    setToast(message)
  }

  function goAfterAuth(nextUser: PublicUser, nextCharacters: SavedCharacter[], next: View) {
    if (next === 'lead' && !nextUser.lead && !canManageRaid) {
      flash('You can still sign up. To run a raid, create one from the board.')
      setView('home')
      return
    }
    if ((next === 'confirm' || next === 'picks' || next === 'done') && nextCharacters.length === 0) {
      sessionStorage.setItem(NEXT_KEY, 'confirm')
      setView('character')
      return
    }
    setView(next)
  }

  function needsAuth(next: View, asLink = false) {
    if (!user) {
      sessionStorage.setItem(NEXT_KEY, next)
      setLinking(asLink)
      setView('login')
      return
    }
    goAfterAuth(user, characters, next)
  }

  async function signUpWith(nextCharacter: SavedCharacter, nextPicks: number[]) {
    if (!raidId) throw new Error('Pick a raid first.')
    const raid = await api.signup(raidId, { characterId: nextCharacter.id, picks: nextPicks })
    applyRaid(raid)
  }

  function commitPicks(next: number[]) {
    setPicks(next)
    if (youSigned && character && user) {
      signUpWith(character, next).catch((err) => flash(err instanceof Error ? err.message : 'Could not save picks.'))
    }
  }

  function togglePick(id: number) {
    if (locked) {
      flash('Picks are locked for tonight.')
      return
    }
    const selected = picks.includes(id)
    if (selected) {
      commitPicks(picks.filter((p) => p !== id))
      return
    }
    if (picks.length >= raidInfo.pickLimit) {
      flash(`You already have ${raidInfo.pickLimit} picks. Tap one to swap it.`)
      return
    }
    commitPicks([...picks, id])
  }

  async function keepLastWeek() {
    if (!character) return
    const last = character.lastPicks ?? []
    try {
      await signUpWith(character, last)
      setPicks(last)
      setView('picks')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  async function continueAs(next: SavedCharacter) {
    const classChanged = character ? next.className !== character.className : false
    const nextPicks = classChanged ? [] : picks
    setCharacterId(next.id)
    setPicks(nextPicks)
    try {
      await signUpWith(next, nextPicks)
      if (itemsForRaid(raidInfo.instanceId).length === 0) {
        setView('done')
        flash('You are signed. Loot reserves for this instance are not on the sheet yet.')
        return
      }
      setView('picks')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not sign up.')
    }
  }

  async function saveAndDone() {
    if (!character) return
    try {
      await signUpWith(character, picks)
      setView('done')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save picks.')
    }
  }

  async function onDemo(provider: 'discord' | 'battlenet', persona: 'nyx' | 'officer') {
    try {
      const me = await api.demoLogin(provider, persona)
      applyMe(me)
      if (raidId) applyRaid(await api.raid(raidId))
      setToast(null)
      const next = (sessionStorage.getItem(NEXT_KEY) as View | null) || (linking ? 'account' : 'home')
      sessionStorage.removeItem(NEXT_KEY)
      setLinking(false)
      if (me.user) goAfterAuth(me.user, me.characters, next)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Login failed.')
    }
  }

  async function onLogout() {
    await api.logout()
    setUser(null)
    setCharacters([])
    setPicks([])
    setCharacterId('')
    if (raidId) applyRaid(await api.raid(raidId))
    setView('home')
    flash('Signed out.')
  }

  async function onUnlink(provider: 'discord' | 'battlenet') {
    try {
      applyMe(await api.unlink(provider))
      flash(`${provider === 'discord' ? 'Discord' : 'Battle.net'} unlinked.`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not unlink.')
    }
  }

  async function onAddCharacter(body: {
    name: string
    className: WowClass
    spec: string
    role: Role
    realm?: string
  }) {
    const { character: created } = await api.addCharacter(body)
    const me = await api.me()
    applyMe(me)
    setCharacterId(created.id)
    const next = (sessionStorage.getItem(NEXT_KEY) as View | null) || 'confirm'
    sessionStorage.removeItem(NEXT_KEY)
    setView(next === 'character' ? 'confirm' : next)
    flash(`${created.name} is on your account.`)
  }

  function goMeta(next: 'feedback' | 'donate') {
    sessionStorage.setItem('raid-night-from', view)
    setView(next)
  }

  function backMeta() {
    const from = sessionStorage.getItem('raid-night-from') as View | null
    sessionStorage.removeItem('raid-night-from')
    if (from && from !== 'feedback' && from !== 'donate') setView(from)
    else setView('home')
  }

  async function openRaid(id: string) {
    try {
      applyRaid(await api.raid(id))
      setBoss('For you')
      setSearch('')
      window.history.pushState({}, '', `/r/${id}`)
      setView('invite')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not open that raid.')
    }
  }

  async function copyReserveLink() {
    if (!raidId) return
    const url = reserveUrl(raidId)
    const ok = await copyText(url)
    flash(ok ? 'Reserve link copied. Send that to pugs and guildies.' : `Copy this: ${url}`)
  }

  async function deleteRaid(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? The reserve link will stop working.`)) return
    try {
      await api.deleteRaid(id)
      setRaids((current) => current.filter((raid) => raid.id !== id))
      if (raidId === id) {
        setRaidId('')
        setRoster([])
        window.history.pushState({}, '', '/')
        setView('home')
      }
      flash(`${name} deleted.`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete that raid.')
    }
  }

  function goRaider() {
    setView(youSigned ? (picks.length ? 'done' : 'picks') : 'invite')
  }

  function goLead() {
    needsAuth('lead')
  }

  if (!ready) {
    return (
      <div className="app">
        <div className="frame">
          <section className="screen">
            <p className="eyebrow">Raid night</p>
            <h1>Loading…</h1>
            <p className="lede">Pulling the raid board.</p>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className={`app ${demoLead ? 'lead-mode' : ''} ${canManageRaid || user?.lead ? 'has-switcher' : ''}`}>
      <div className="frame">
        {view !== 'login' && (
          <SessionBar
            user={user}
            onAccount={() => (user ? setView('account') : needsAuth('account'))}
            onLogin={() => needsAuth('home')}
          />
        )}
        {view === 'home' && (
          <Home
            raids={raids}
            signedIn={Boolean(user)}
            onOpen={(id) => void openRaid(id)}
            onCreate={() => needsAuth('create')}
            onDelete={(id, name) => void deleteRaid(id, name)}
          />
        )}
        {view === 'create' && user && (
          <CreateRaid
            instances={instances}
            onBack={() => setView('home')}
            onSave={async (body) => {
              const created = await api.createRaid(body)
              applyRaid(created)
              setRaids((await api.raids()).raids)
              window.history.pushState({}, '', `/r/${created.id}`)
              setView('invite')
              const url = reserveUrl(created.id)
              const ok = await copyText(url)
              flash(ok ? `Posted. Reserve link copied — send it to the raid.` : `Posted. Link: ${url}`)
            }}
            flash={flash}
          />
        )}
        {view === 'invite' && (
          <Invite
            raid={raidInfo}
            counts={counts}
            onBack={() => {
              window.history.pushState({}, '', '/')
              setView('home')
            }}
            onJoin={() => needsAuth('confirm')}
            onLead={canManageRaid || user?.lead ? goLead : undefined}
            onCopyLink={() => void copyReserveLink()}
          />
        )}
        {view === 'login' && (
          <Login
            providers={providers}
            linking={linking}
            onDemo={onDemo}
            nextPath={raidIdFromPath() ? `/r/${raidIdFromPath()}` : '/'}
            onBack={() => {
              setLinking(false)
              setView(raidIdFromPath() ? 'invite' : 'home')
            }}
          />
        )}
        {view === 'account' && user && (
          <Account
            user={user}
            characters={characters}
            providers={providers}
            onBack={() => setView(youSigned ? 'done' : 'home')}
            onLogin={() => {
              setLinking(true)
              sessionStorage.setItem(NEXT_KEY, 'account')
              setView('login')
            }}
            onUnlink={onUnlink}
            onLogout={() => void onLogout()}
            onAdd={() => setView('character')}
            onSelect={(id) => {
              setCharacterId(id)
              setView('confirm')
            }}
            flash={flash}
          />
        )}
        {view === 'character' && user && (
          <CharacterForm
            onBack={() => setView(characters.length ? 'account' : 'home')}
            onSave={(body) => onAddCharacter(body)}
            flash={flash}
          />
        )}
        {view === 'confirm' && character && (
          <Confirm
            character={character}
            characters={characters}
            onBack={() => setView('invite')}
            onSelect={setCharacterId}
            onContinue={() => void continueAs(character)}
            onKeep={() => void keepLastWeek()}
            onAdd={() => {
              sessionStorage.setItem(NEXT_KEY, 'confirm')
              setView('character')
            }}
          />
        )}
        {view === 'picks' && character && (
          <Picker
            raid={raidInfo}
            character={character}
            picks={picks}
            roster={roster}
            locked={locked}
            search={search}
            boss={boss}
            showAll={showAll}
            onSearch={setSearch}
            onBoss={setBoss}
            onShowAll={setShowAll}
            onToggle={togglePick}
            onBack={() => setView(youSigned && picks.length ? 'done' : 'confirm')}
            onSave={() => void saveAndDone()}
          />
        )}
        {view === 'done' && character && (
          <Done
            raid={raidInfo}
            character={character}
            picks={picks}
            locked={locked}
            onEditPicks={() => setView('picks')}
            onEditCharacter={() => setView('confirm')}
          />
        )}
        {view === 'feedback' && <Feedback onBack={backMeta} />}
        {view === 'donate' && <Donate onBack={backMeta} />}
        {view === 'lead' && (
          <Lead
            raid={raidInfo}
            roster={roster}
            locked={locked}
            missing={missing}
            counts={counts}
            onLock={async () => {
              try {
                applyRaid(await api.lock(raidId, true))
                flash('Sheet locked. Picks are frozen.')
              } catch (err) {
                flash(err instanceof Error ? err.message : 'Could not lock.')
              }
            }}
            onUnlock={async () => {
              try {
                applyRaid(await api.lock(raidId, false))
                flash('Sheet unlocked. People can change picks again.')
              } catch (err) {
                flash(err instanceof Error ? err.message : 'Could not unlock.')
              }
            }}
            onNudge={() => {
              if (!missing.length) {
                flash('Everyone who signed has their picks.')
                return
              }
              flash(`Nudged ${missing.map((m) => m.name).join(' and ')}.`)
            }}
            exportBox={exportBox}
            onCopyGargul={async () => {
              const n = playersForGargul(roster).length
              if (!n) {
                flash('Nobody has picks to export yet.')
                return
              }
              const text = gargulExportString(roster)
              const ok = await copyText(text)
              if (ok) {
                setExportBox('')
                flash(`Copied Gargul string for ${n} players. In game: /gl sr then paste and Import.`)
              } else {
                setExportBox(text)
                flash('Clipboard blocked. The string is on the page — select it and copy.')
              }
            }}
            onCopyCsv={async () => {
              const n = playersForGargul(roster).length
              if (!n) {
                flash('Nobody has picks to export yet.')
                return
              }
              const text = gargulCsv(roster)
              const ok = await copyText(text)
              if (ok) {
                setExportBox('')
                flash('Copied CSV. Gargul still takes this, but prefers the Gargul string.')
              } else {
                setExportBox(text)
                flash('Clipboard blocked. The CSV is on the page — select it and copy.')
              }
            }}
            onCopyLink={() => void copyReserveLink()}
            onReset={async () => {
              try {
                applyRaid(await api.reset(raidId))
                setPicks([])
                flash('Signups cleared. Accounts stay linked.')
              } catch (err) {
                flash(err instanceof Error ? err.message : 'Could not reset.')
              }
            }}
            onDeleteRaid={() => void deleteRaid(raidId, raidInfo.name)}
            onAddRoster={async (body) => {
              try {
                applyRaid(await api.addRosterMember(raidId, body))
                flash(`${body.name} added to the roster.`)
              } catch (err) {
                flash(err instanceof Error ? err.message : 'Could not add raider.')
                throw err
              }
            }}
            onRemoveRoster={async (raider) => {
              try {
                applyRaid(await api.removeRosterMember(raidId, raider.id))
                flash(`${raider.name} removed from the roster.`)
              } catch (err) {
                flash(err instanceof Error ? err.message : 'Could not remove raider.')
              }
            }}
          />
        )}
      </div>

      {view !== 'login' && (
        <nav className="site-links">
          <button type="button" className="ghost" onClick={() => goMeta('feedback')}>
            Feedback
          </button>
          <button type="button" className="ghost" onClick={() => goMeta('donate')}>
            Donate
          </button>
        </nav>
      )}

      {(canManageRaid || user?.lead || view === 'lead') && (
        <nav className="switcher">
          <button type="button" className={!demoLead ? 'on' : ''} onClick={goRaider}>
            Raider
          </button>
          <button type="button" className={demoLead ? 'on' : ''} onClick={goLead}>
            Lead
          </button>
        </nav>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function SessionBar({
  user,
  onAccount,
  onLogin,
}: {
  user: PublicUser | null
  onAccount: () => void
  onLogin: () => void
}) {
  if (!user) {
    return (
      <div className="session-bar">
        <button type="button" className="ghost session-btn" onClick={onLogin}>
          Sign in
        </button>
      </div>
    )
  }
  const linked =
    user.discord && user.battlenet ? 'Discord + Battle.net' : user.discord ? 'Discord' : 'Battle.net'
  return (
    <div className="session-bar">
      <button type="button" className="ghost session-btn" onClick={onAccount}>
        <strong>{user.displayName}</strong>
        <small>{linked}</small>
      </button>
    </div>
  )
}

function Feedback({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const ready = message.trim().length > 0
  const subject = name.trim() ? `Raid Night feedback from ${name.trim()}` : 'Raid Night feedback'
  const href = `mailto:squirt@hey.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message.trim())}`

  return (
    <section className="screen">
      <button type="button" className="back" onClick={onBack}>
        ← Back
      </button>
      <p className="eyebrow">Feedback</p>
      <h1>Tell me what to fix</h1>
      <p className="lede">
        This opens an email to <a href="mailto:squirt@hey.com">squirt@hey.com</a>. Nothing is stored on the site.
      </p>
      <label className="field">
        <span>Your name (optional)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Message</span>
        <textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <a className={`primary mail-btn ${ready ? '' : 'is-disabled'}`} href={ready ? href : undefined} aria-disabled={!ready}>
        Send to squirt@hey.com
      </a>
    </section>
  )
}

function Donate({ onBack }: { onBack: () => void }) {
  return (
    <section className="screen">
      <button type="button" className="back" onClick={onBack}>
        ← Back
      </button>
      <p className="eyebrow">Donate</p>
      <h1>Buy the raid a flask</h1>
      <p className="lede">Scan this code with your phone to send a tip. Totally optional.</p>
      <div className="donate-card">
        <img src="/ui/donate-qr.png" alt="Donation QR code" className="donate-qr" />
      </div>
    </section>
  )
}

function Home({
  raids,
  signedIn,
  onOpen,
  onCreate,
  onDelete,
}: {
  raids: RaidSummary[]
  signedIn: boolean
  onOpen: (id: string) => void
  onCreate: () => void
  onDelete: (id: string, name: string) => void
}) {
  return (
    <section className="screen">
      <p className="eyebrow">Raid night</p>
      <header className="hero">
        <h1>Your raids</h1>
        <p className="lede">
          Schedule a night, then send the reserve link. Guild and pugs open that link to pick loot — they won&apos;t see
          anyone else&apos;s raids.
        </p>
      </header>
      <div className="raid-list">
        {raids.map((raid) => (
          <div key={raid.id} className="raid-card">
            <span className="raid-date">
              <strong>{raid.dateLabel || 'TBD'}</strong>
              <small>{raid.when}</small>
            </span>
            <span className="raid-copy">
              <strong>{raid.name}</strong>
              <small>
                {raid.instanceName} · {raid.signed}/{raid.size} signed
                {raid.locked ? ' · locked' : ''}
              </small>
            </span>
            <span className="raid-actions">
              <button type="button" className="ghost" onClick={() => onOpen(raid.id)}>
                Open
              </button>
              <button type="button" className="ghost danger" onClick={() => onDelete(raid.id, raid.name)}>
                Delete
              </button>
            </span>
          </div>
        ))}
      </div>
      {raids.length === 0 && (
        <p className="hint">
          {signedIn
            ? 'Nothing scheduled yet. Post a raid and copy the link for the group.'
            : 'Got a reserve link? Open it. Raid lead? Sign in to schedule a night.'}
        </p>
      )}
      <button type="button" className="primary" onClick={onCreate}>
        {signedIn ? 'Schedule a raid' : 'Sign in to schedule'}
      </button>
    </section>
  )
}

function MonthCal({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const selected = value ? new Date(`${value}T12:00:00`) : new Date()
  const [cursor, setCursor] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1))
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const blanks = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells = [...Array(blanks).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const today = new Date()
  const todayStamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="ghost" onClick={() => setCursor(new Date(year, month - 1, 1))}>
          ‹
        </button>
        <strong>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button type="button" className="ghost" onClick={() => setCursor(new Date(year, month + 1, 1))}>
          ›
        </button>
      </div>
      <div className="cal-week">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((day, i) => {
          if (!day) return <span key={`b-${i}`} />
          const stamp = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          return (
            <button
              type="button"
              key={stamp}
              className={`${stamp === value ? 'on' : ''} ${stamp === todayStamp ? 'today' : ''}`}
              onClick={() => onChange(stamp)}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NumericField({
  value,
  onChange,
  min,
  max,
  fallback,
}: {
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  fallback: number
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText(String(value))
  }, [value])

  function commit() {
    const parsed = Number.parseInt(text, 10)
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
    setText(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, '').slice(0, String(max).length))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

function CreateRaid({
  instances,
  onBack,
  onSave,
  flash,
}: {
  instances: RaidInstance[]
  onBack: () => void
  onSave: (body: {
    instanceId: string
    name: string
    when: string
    dateLabel: string
    size: number
    pickLimit: number
    lockLabel: string
  }) => Promise<void>
  flash: (message: string) => void
}) {
  const [instanceId, setInstanceId] = useState(instances[0]?.id || 'karazhan')
  const picked = instances.find((row) => row.id === instanceId)
  const [name, setName] = useState(picked?.name || 'Karazhan')
  const [date, setDate] = useState(nextRaidDate)
  const [time, setTime] = useState('20:00')
  const [size, setSize] = useState(picked?.size || 10)
  const [pickLimit, setPickLimit] = useState(picked?.pickLimit || 2)

  return (
    <section className="screen">
      <button type="button" className="back" onClick={onBack}>
        ← Board
      </button>
      <p className="eyebrow">Raid lead</p>
      <h1>Schedule a raid</h1>
      <p className="lede">Choose the instance, then pick the night and pull time. Raiders sign up on this sheet.</p>

      <p className="field-label">Instance</p>
      <div className="instance-grid">
        {instances.map((row) => (
          <button
            type="button"
            key={row.id}
            className={`instance-chip ${instanceId === row.id ? 'on' : ''}`}
            onClick={() => {
              setInstanceId(row.id)
              setName(row.name)
              setSize(row.size)
              setPickLimit(row.pickLimit)
            }}
          >
            <strong>{row.name}</strong>
            <small>{row.size}-man</small>
          </button>
        ))}
      </div>

      <label className="field">
        <span>Title</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Karazhan" />
      </label>

      <p className="field-label">Date</p>
      <MonthCal value={date} onChange={setDate} />

      <div className="when-row">
        <label className="field">
          <span>Pull time</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="field">
          <span>Size</span>
          <NumericField value={size} min={10} max={40} fallback={10} onChange={setSize} />
        </label>
        <label className="field">
          <span>Reserves</span>
          <NumericField value={pickLimit} min={1} max={10} fallback={2} onChange={setPickLimit} />
        </label>
      </div>

      <p className="hint">
        {formatRaidDate(date)} · {formatRaidWhen(date, time)}. Picks lock at {lockLabelFrom(time)}.
      </p>

      <button
        type="button"
        className="primary"
        onClick={() => {
          onSave({
            instanceId,
            name,
            when: formatRaidWhen(date, time),
            dateLabel: formatRaidDate(date),
            size,
            pickLimit,
            lockLabel: lockLabelFrom(time),
          }).catch((err) => flash(err instanceof Error ? err.message : 'Could not schedule the raid.'))
        }}
      >
        Post raid
      </button>
    </section>
  )
}

function Invite({
  raid,
  counts,
  onBack,
  onJoin,
  onLead,
  onCopyLink,
}: {
  raid: {
    name: string
    when: string
    dateLabel: string
    size: number
    pickLimit: number
    lockLabel: string
    instanceName?: string
  }
  counts: ReturnType<typeof composition>
  onBack: () => void
  onJoin: () => void
  onLead?: () => void
  onCopyLink: () => void
}) {
  return (
    <section className="screen">
      <button type="button" className="back" onClick={onBack}>
        ← Board
      </button>
      <p className="eyebrow">{raid.instanceName || 'Raid'} loot + signup</p>
      <header className="hero">
        <p className="kicker">{raid.dateLabel}</p>
        <h1>{raid.name}</h1>
        <p className="lede">Say you&apos;re coming and pick your reserves. Same sheet for the raid lead.</p>
      </header>

      <div className="card invite-card">
        <div className="invite-row">
          <span>When</span>
          <strong>{raid.when}</strong>
        </div>
        <div className="invite-row">
          <span>Signed</span>
          <strong>
            {counts.signed} / {raid.size}
          </strong>
        </div>
        <div className="invite-row">
          <span>Item picks</span>
          <strong>{raid.pickLimit} each</strong>
        </div>
        <div className="invite-row">
          <span>Change until</span>
          <strong>{raid.lockLabel}</strong>
        </div>
        <p className="hint">If an item drops, only the people who picked it roll. No other form.</p>
      </div>

      <button type="button" className="primary" onClick={onJoin}>
        I&apos;m in — pick reserves
      </button>
      <button type="button" className="secondary" onClick={onCopyLink}>
        Copy reserve link
      </button>
      {onLead && (
        <button type="button" className="ghost lead-entry" onClick={onLead}>
          Raid lead tools
        </button>
      )}
    </section>
  )
}

function Login({
  providers,
  linking,
  onDemo,
  onBack,
  nextPath,
}: {
  providers: Providers
  linking: boolean
  onDemo: (provider: 'discord' | 'battlenet', persona: 'nyx' | 'officer') => void
  onBack: () => void
  nextPath: string
}) {
  const [pick, setPick] = useState<'discord' | 'battlenet' | null>(null)

  function start(provider: 'discord' | 'battlenet') {
    if (providers.demo[provider]) {
      setPick(provider)
      return
    }
    window.location.href = `/api/auth/${provider}?next=${encodeURIComponent(nextPath || '/')}`
  }

  if (pick) {
    const label = pick === 'discord' ? 'Discord' : 'Battle.net'
    return (
      <section className="screen">
        <button type="button" className="back" onClick={() => setPick(null)}>
          ← Back
        </button>
        <p className="eyebrow">{label}</p>
        <h1>Who are you?</h1>
        <p className="lede">Local mode until you add a {label} app in .env. Same linking rules as the real login.</p>
        <div className="stack">
          <button type="button" className="card char-card" data-persona="nyx" onClick={() => onDemo(pick, 'nyx')}>
            <span className="dot" style={{ background: classColor.Warlock }} />
            <span>
              <strong>Nyx</strong>
              <small>Raider · Warlock + Mage already on the account</small>
            </span>
            <em>Continue</em>
          </button>
          <button type="button" className="card char-card" data-persona="officer" onClick={() => onDemo(pick, 'officer')}>
            <span className="dot" style={{ background: classColor.Warrior }} />
            <span>
              <strong>Officer</strong>
              <small>Raid lead · lock, reset, Gargul export</small>
            </span>
            <em>Continue</em>
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="screen">
      <button type="button" className="back" onClick={onBack}>
        ← Back
      </button>
      <p className="eyebrow">{linking ? 'Link account' : 'Sign in'}</p>
      <h1>{linking ? 'Connect the other one' : 'Sign in'}</h1>
      <p className="lede">
        Same idea as softres.it and Raid-Helper: Discord or Battle.net. Link both so either one signs you into this same
        account next time.
      </p>
      <div className="oauth">
        <button type="button" className="oauth-btn discord" onClick={() => start('discord')}>
          Continue with Discord
        </button>
        <button type="button" className="oauth-btn battlenet" onClick={() => start('battlenet')}>
          Continue with Battle.net
        </button>
      </div>
      {(providers.demo.discord || providers.demo.battlenet) && (
        <p className="hint">
          Local mode is on until you add Discord / Battle.net app credentials. Then these buttons go to the real login.
        </p>
      )}
    </section>
  )
}

function Account({
  user,
  characters,
  providers,
  onBack,
  onLogin,
  onUnlink,
  onLogout,
  onAdd,
  onSelect,
  flash,
}: {
  user: PublicUser
  characters: SavedCharacter[]
  providers: Providers
  onBack: () => void
  onLogin: () => void
  onUnlink: (provider: 'discord' | 'battlenet') => void
  onLogout: () => void
  onAdd: () => void
  onSelect: (id: string) => void
  flash: (message: string) => void
}) {
  const [wow, setWow] = useState<WowImport[] | null>(null)
  const [selectedWow, setSelectedWow] = useState<string[]>([])
  const canUnlinkDiscord = Boolean(user.discord && user.battlenet)
  const canUnlinkBattlenet = Boolean(user.discord && user.battlenet)

  async function loadWow() {
    try {
      const result = await api.wowCharacters()
      setWow(result.characters)
      if (!result.characters.length) flash('Battle.net did not return characters. Add TBC names by hand — Classic often is not in the profile API.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not read Battle.net characters.')
    }
  }

  async function importSelected() {
    if (!wow) return
    const chosen = wow.filter((ch) => selectedWow.includes(`${ch.name}|${ch.realm}`))
    if (!chosen.length) {
      flash('Pick at least one character to import.')
      return
    }
    try {
      await api.importWow(chosen.map((ch) => ({ ...ch, spec: ch.className, role: 'dps' })))
      window.location.reload()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not import.')
    }
  }

  return (
    <section className="screen">
      <button type="button" className="back" onClick={onBack}>
        ← Back
      </button>
      <p className="eyebrow">Account</p>
      <h1>{user.displayName}</h1>
      <p className="lede">Link Discord and Battle.net to the same login so raiders can use either, like softres.it.</p>

      <div className="card provider-card">
        <div>
          <strong>Discord</strong>
          <small>
            {user.discord
              ? `${user.discord.globalName || user.discord.username} · ${user.discord.id}`
              : 'Not linked'}
          </small>
        </div>
        {user.discord ? (
          <button type="button" className="ghost" disabled={!canUnlinkDiscord} onClick={() => onUnlink('discord')}>
            Unlink
          </button>
        ) : (
          <button type="button" className="secondary connect-provider" onClick={onLogin}>
            Connect
          </button>
        )}
      </div>

      <div className="card provider-card">
        <div>
          <strong>Battle.net</strong>
          <small>
            {user.battlenet ? `${user.battlenet.battletag} · ${user.battlenet.id}` : 'Not linked'}
          </small>
        </div>
        {user.battlenet ? (
          <button type="button" className="ghost" disabled={!canUnlinkBattlenet} onClick={() => onUnlink('battlenet')}>
            Unlink
          </button>
        ) : (
          <button type="button" className="secondary connect-provider" onClick={onLogin}>
            Connect
          </button>
        )}
      </div>

      <h2>Characters</h2>
      <div className="stack">
        {characters.map((c) => (
          <button type="button" key={c.id} className="card char-card" onClick={() => onSelect(c.id)}>
            <span className="dot" style={{ background: classColor[c.className] }} />
            <span>
              <strong style={{ color: classColor[c.className] }}>{c.name}</strong>
              <small>
                {c.spec} {c.className} · {roleLabel[c.role]}
                {c.realm ? ` · ${c.realm}` : ''}
              </small>
            </span>
            <em>Use</em>
          </button>
        ))}
      </div>
      <button type="button" className="secondary" onClick={onAdd}>
        Add a character
      </button>
      {user.battlenet && (
        <button type="button" className="ghost" onClick={() => void loadWow()}>
          Import from Battle.net
        </button>
      )}
      {wow && wow.length > 0 && (
        <div className="card">
          <p className="hint">Classic TBC names are often missing here. Import what Blizzard sent, or add the rest by hand.</p>
          <ul className="wow-import">
            {wow.map((ch) => {
              const key = `${ch.name}|${ch.realm}`
              return (
                <li key={key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedWow.includes(key)}
                      onChange={(e) =>
                        setSelectedWow((current) =>
                          e.target.checked ? [...current, key] : current.filter((k) => k !== key),
                        )
                      }
                    />
                    {ch.name}
                    {ch.realm ? `-${ch.realm}` : ''} · {ch.className}
                    {ch.level ? ` · ${ch.level}` : ''}
                  </label>
                </li>
              )
            })}
          </ul>
          <button type="button" className="secondary" onClick={() => void importSelected()}>
            Import selected
          </button>
        </div>
      )}
      {(!user.discord || !user.battlenet) && (providers.demo.discord || providers.demo.battlenet) ? (
        <p className="hint">To connect the other provider in local mode, tap Connect and pick the matching persona.</p>
      ) : null}
      <button type="button" className="ghost sign-out" onClick={onLogout}>
        Sign out
      </button>
    </section>
  )
}

function CharacterForm({
  onBack,
  onSave,
  flash,
}: {
  onBack: () => void
  onSave: (body: { name: string; className: WowClass; spec: string; role: Role; realm?: string }) => Promise<void>
  flash: (message: string) => void
}) {
  const [name, setName] = useState('')
  const [className, setClassName] = useState<WowClass>('Warlock')
  const [spec, setSpec] = useState('Affliction')
  const [role, setRole] = useState<Role>('dps')
  const [realm, setRealm] = useState('')

  return (
    <section className="screen">
      <button type="button" className="back" onClick={onBack}>
        ← Back
      </button>
      <h1>Add character</h1>
      <p className="lede">TBC Classic usually is not in the Battle.net character list, so type the name you raid on.</p>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nyx" maxLength={12} />
      </label>
      <label className="field">
        <span>Class</span>
        <select value={className} onChange={(e) => setClassName(e.target.value as WowClass)}>
          {wowClasses.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Spec</span>
        <input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="Affliction" />
      </label>
      <label className="field">
        <span>Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="tank">Tank</option>
          <option value="healer">Healer</option>
          <option value="dps">Damage</option>
        </select>
      </label>
      <label className="field">
        <span>Realm (optional)</span>
        <input value={realm} onChange={(e) => setRealm(e.target.value)} placeholder="Your realm" />
      </label>
      <button
        type="button"
        className="primary"
        onClick={() => {
          onSave({ name, className, spec, role, realm: realm || undefined }).catch((err) =>
            flash(err instanceof Error ? err.message : 'Could not add character.'),
          )
        }}
      >
        Save character
      </button>
    </section>
  )
}

function Confirm({
  character,
  characters,
  onBack,
  onSelect,
  onContinue,
  onKeep,
  onAdd,
}: {
  character: Character
  characters: SavedCharacter[]
  onBack: () => void
  onSelect: (id: string) => void
  onContinue: () => void
  onKeep: () => void
  onAdd: () => void
}) {
  const last = (character.lastPicks ?? []).map(itemById).filter(Boolean)

  return (
    <section className="screen">
      <button type="button" className="back" onClick={onBack}>
        ← Back
      </button>
      <h1>Coming as…</h1>
      <p className="lede">We already know you. Check this is the right character.</p>

      <div className="stack">
        {characters.map((c) => {
          const selected = c.id === character.id
          return (
            <button
              type="button"
              key={c.id}
              className={`card char-card ${selected ? 'selected' : ''}`}
              onClick={() => onSelect(c.id)}
            >
              <span className="dot" style={{ background: classColor[c.className] }} />
              <span>
                <strong style={{ color: classColor[c.className] }}>{c.name}</strong>
                <small>
                  {c.spec} {c.className} · {roleLabel[c.role]}
                </small>
              </span>
              {selected ? <em>This one</em> : <em>Switch</em>}
            </button>
          )
        })}
      </div>
      <button type="button" className="ghost" onClick={onAdd}>
        Add another character
      </button>

      {last.length === 2 && (
        <div className="card keep">
          <p>Last time you picked these on {character.name}.</p>
          <ul className="mini-picks">
            {last.map((item) => (
              <li key={item!.id}>
                <img src={iconUrl(item!.icon)} alt="" referrerPolicy="no-referrer" />
                {item!.name}
              </li>
            ))}
          </ul>
          <button type="button" className="secondary" onClick={onKeep}>
            Keep these, I&apos;ll adjust if I want
          </button>
        </div>
      )}

      <button type="button" className="primary" onClick={onContinue}>
        Pick items for {character.name}
      </button>
    </section>
  )
}

function Picker({
  raid,
  character,
  picks,
  roster,
  locked,
  search,
  boss,
  showAll,
  onSearch,
  onBoss,
  onShowAll,
  onToggle,
  onBack,
  onSave,
}: {
  raid: { pickLimit: number; lockLabel: string; instanceId?: string }
  character: Character
  picks: number[]
  roster: Raider[]
  locked: boolean
  search: string
  boss: string
  showAll: boolean
  onSearch: (v: string) => void
  onBoss: (v: string) => void
  onShowAll: (v: boolean) => void
  onToggle: (id: number) => void
  onBack: () => void
  onSave: () => void
}) {
  const instanceId = raid.instanceId || 'karazhan'
  const catalog = useMemo(() => itemsForRaid(instanceId), [instanceId])
  const bosses = bossesFor(instanceId)
  const activeBoss = bosses.includes(boss) ? boss : 'For you'
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return catalog.filter((item) => {
      if (!showAll && !usableBy(item, character.className)) return false
      if (activeBoss !== 'For you' && item.boss !== activeBoss) return false
      if (q && !`${item.name} ${item.slot} ${item.boss}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [character.className, search, activeBoss, showAll, catalog])

  return (
    <section className="screen picker">
      <button type="button" className="back" onClick={onBack}>
        ← Back
      </button>
      <header className="picker-head">
        <h1>Pick {raid.pickLimit} items</h1>
        <p className="lede">
          Showing what {/^[aeiou]/i.test(character.spec) ? 'an' : 'a'} {character.spec} {character.className} can use.
          {locked ? ' Picks are locked.' : ` Change until ${raid.lockLabel}.`}
        </p>
      </header>

      <div className="picks-bar">
        {Array.from({ length: raid.pickLimit }).map((_, i) => {
          const item = picks[i] ? itemById(picks[i]) : null
          return (
            <button type="button" key={i} className={`slot ${item ? 'filled' : ''}`} onClick={() => item && onToggle(item.id)}>
              {item ? (
                <>
                  <img src={iconUrl(item.icon)} alt="" referrerPolicy="no-referrer" />
                  <span>{item.name}</span>
                </>
              ) : (
                <span>
                  {i + 1} of {raid.pickLimit}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <label className="search">
        <span className="sr">Search items</span>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name, slot, or boss"
        />
      </label>

      <div className="chips">
        <button type="button" className={activeBoss === 'For you' ? 'on' : ''} onClick={() => onBoss('For you')}>
          All bosses
        </button>
        {bosses.map((name) => (
          <button type="button" key={name} className={activeBoss === name ? 'on' : ''} onClick={() => onBoss(name)}>
            {name}
          </button>
        ))}
      </div>

      <label className="toggle">
        <input type="checkbox" checked={showAll} onChange={(e) => onShowAll(e.target.checked)} />
        Show items my class cannot use
      </label>

      <ul className="item-list">
        {visible.map((item) => {
          const selected = picks.includes(item.id)
          const others = pickCount(roster, item.id)
          const mine = selected ? 1 : 0
          const crowd = others - mine
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`item ${selected ? 'selected' : ''} ${usableBy(item, character.className) ? '' : 'dim'}`}
                onClick={() => onToggle(item.id)}
              >
                <img src={iconUrl(item.icon)} alt="" referrerPolicy="no-referrer" />
                <span className="item-copy">
                  <strong>{item.name}</strong>
                  <small>
                    {item.slot} · {item.boss}
                    {crowd > 0 ? ` · ${crowd} other${crowd === 1 ? '' : 's'} picked this` : ''}
                  </small>
                </span>
                <span className="mark">{selected ? 'Picked' : 'Pick'}</span>
              </button>
            </li>
          )
        })}
        {catalog.length === 0 && <li className="empty">Loot for this instance is not on the sheet yet.</li>}
        {catalog.length > 0 && visible.length === 0 && (
          <li className="empty">Nothing matches. Try another boss or clear search.</li>
        )}
      </ul>

      <div className="sticky">
        <button type="button" className="primary" onClick={onSave} disabled={catalog.length > 0 && picks.length === 0}>
          {catalog.length === 0
            ? 'Continue without picks'
            : picks.length === raid.pickLimit
              ? 'Save my picks'
              : picks.length === 1
                ? 'Save 1 pick for now'
                : 'Pick at least one item'}
        </button>
      </div>
    </section>
  )
}

function Done({
  raid,
  character,
  picks,
  locked,
  onEditPicks,
  onEditCharacter,
}: {
  raid: typeof raidFallback & { instanceName?: string }
  character: Character
  picks: number[]
  locked: boolean
  onEditPicks: () => void
  onEditCharacter: () => void
}) {
  return (
    <section className="screen">
      <p className="eyebrow ok">You&apos;re in</p>
      <h1>See you in {raid.instanceName || raid.name}.</h1>
      <p className="lede">
        {character.name} · {character.spec} {character.className}.{' '}
        {locked ? 'Picks are locked.' : `You can change this until ${raid.lockLabel}.`}
      </p>

      <div className="card char-card readonly">
        <span className="dot" style={{ background: classColor[character.className] }} />
        <span>
          <strong style={{ color: classColor[character.className] }}>{character.name}</strong>
          <small>
            {character.spec} {character.className} · {roleLabel[character.role]}
          </small>
        </span>
      </div>

      <ul className="done-picks">
        {picks.map((id) => {
          const item = itemById(id)
          if (!item) return null
          return (
            <li key={id} className="card item readonly">
              <img src={iconUrl(item.icon)} alt="" referrerPolicy="no-referrer" />
              <span className="item-copy">
                <strong>{item.name}</strong>
                <small>
                  {item.slot} · {item.boss}
                </small>
              </span>
            </li>
          )
        })}
      </ul>

      {!locked && (
        <div className="stack">
          <button type="button" className="secondary" onClick={onEditPicks}>
            Change my picks
          </button>
          <button type="button" className="ghost" onClick={onEditCharacter}>
            Switch character
          </button>
        </div>
      )}
    </section>
  )
}

function Lead({
  raid,
  roster,
  locked,
  missing,
  counts,
  onLock,
  onUnlock,
  onNudge,
  onCopyGargul,
  onCopyCsv,
  onCopyLink,
  onReset,
  onDeleteRaid,
  onAddRoster,
  onRemoveRoster,
  exportBox,
}: {
  raid: typeof raidFallback
  roster: Raider[]
  locked: boolean
  missing: Raider[]
  counts: ReturnType<typeof composition>
  onLock: () => void
  onUnlock: () => void
  onNudge: () => void
  onCopyGargul: () => void
  onCopyCsv: () => void
  onCopyLink: () => void
  onReset: () => void
  onDeleteRaid: () => void
  onAddRoster: (body: { name: string; className: WowClass; spec: string; role: Role }) => Promise<void>
  onRemoveRoster: (raider: Raider) => Promise<void>
  exportBox: string
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [className, setClassName] = useState<WowClass>('Warrior')
  const [spec, setSpec] = useState('')
  const [role, setRole] = useState<Role>('dps')
  const signed = roster.filter((r) => r.signed)
  const unsigned = roster.filter((r) => !r.signed)

  async function addRaider(event: React.FormEvent) {
    event.preventDefault()
    try {
      await onAddRoster({ name, className, spec, role })
      setName('')
      setSpec('')
      setRole('dps')
      setAdding(false)
    } catch {
      // The parent has already shown the API error.
    }
  }

  function removeRaider(raider: Raider) {
    if (!window.confirm(`Remove ${raider.name} from this raid roster?`)) return
    void onRemoveRoster(raider)
  }

  return (
    <section className="screen lead">
      <p className="eyebrow">Raid lead</p>
      <h1>{raid.name}</h1>
      <p className="lede">
        {raid.when} · {counts.signed}/{raid.size} signed · {locked ? 'Locked' : `Open until ${raid.lockLabel}`}
      </p>

      <div className="stats">
        <div>
          <strong>{counts.tank}</strong>
          <span>Tanks</span>
        </div>
        <div>
          <strong>{counts.healer}</strong>
          <span>Healers</span>
        </div>
        <div>
          <strong>{counts.dps}</strong>
          <span>Damage</span>
        </div>
        <div>
          <strong>{missing.length}</strong>
          <span>Missing picks</span>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="card warn">
          <p>
            {missing.length === 1
              ? `${missing[0].name} has not finished picks.`
              : `${missing.map((m) => m.name).join(' and ')} have not finished picks.`}
          </p>
          <button type="button" className="secondary" onClick={onNudge}>
            Nudge them
          </button>
        </div>
      )}

      <div className="lead-actions">
        {locked ? (
          <button type="button" className="secondary" onClick={onUnlock}>
            Unlock picks
          </button>
        ) : (
          <button type="button" className="secondary" onClick={onLock}>
            Lock picks
          </button>
        )}
        <button type="button" className="secondary" onClick={onCopyLink}>
          Copy reserve link
        </button>
        <button type="button" className="primary" onClick={onCopyGargul}>
          Copy for Gargul
        </button>
      </div>

      <section className="card roster-admin">
        <div className="roster-admin-head">
          <span>
            <strong>Roster controls</strong>
            <small>Add a raider before they sign in, or remove a signup.</small>
          </span>
          <button type="button" className="secondary" onClick={() => setAdding((value) => !value)}>
            {adding ? 'Cancel' : 'Add raider'}
          </button>
        </div>
        {adding && (
          <form className="roster-form" onSubmit={(event) => void addRaider(event)}>
            <label className="field">
              Character name
              <input value={name} onChange={(event) => setName(event.target.value)} pattern="[A-Za-z]{2,12}" required />
            </label>
            <label className="field">
              Class
              <select value={className} onChange={(event) => setClassName(event.target.value as WowClass)}>
                {wowClasses.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="field">
              Spec
              <input value={spec} onChange={(event) => setSpec(event.target.value)} maxLength={32} required />
            </label>
            <label className="field">
              Role
              <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
                <option value="tank">Tank</option>
                <option value="healer">Healer</option>
                <option value="dps">Damage</option>
              </select>
            </label>
            <button type="submit" className="primary">Add to roster</button>
          </form>
        )}
      </section>

      <div className="card export">
        <p>
          Same path as softres.it. In WoW type <code>/gl sr</code>, paste, then Import. Gargul shows who reserved an item
          on tooltips and only those people can roll.
        </p>
        {exportBox && (
          <textarea className="export-box" readOnly value={exportBox} onFocus={(e) => e.target.select()} />
        )}
        <button type="button" className="ghost" onClick={onCopyCsv}>
          Copy CSV instead
        </button>
      </div>

      <h2>Signed</h2>
      <ul className="roster">
        {signed.map((raider) => (
          <li key={raider.id} className="card raider">
            <span className="dot" style={{ background: classColor[raider.className] }} />
            <span>
              <strong style={{ color: classColor[raider.className] }}>
                {raider.name}
                {raider.you ? ' · you' : ''}
              </strong>
              <small>
                {raider.spec} · {roleLabel[raider.role]}
                {raider.discord ? ` · ${raider.discord}` : ''}
                {raider.battletag ? ` · ${raider.battletag}` : ''}
              </small>
            </span>
            <span className="raider-picks">
              {raider.picks.length === 0 && <em>No picks yet</em>}
              {raider.picks.map((id) => {
                const item = itemById(id)
                return item ? (
                  <img key={id} src={iconUrl(item.icon)} title={item.name} alt={item.name} referrerPolicy="no-referrer" />
                ) : null
              })}
            </span>
            <button type="button" className="remove-raider" onClick={() => removeRaider(raider)} aria-label={`Remove ${raider.name}`}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      {unsigned.length > 0 && (
        <>
          <h2>Not signed</h2>
          <ul className="roster">
            {unsigned.map((raider) => (
              <li key={raider.id} className="card raider dim">
                <span className="dot" style={{ background: classColor[raider.className] }} />
                <span>
                  <strong style={{ color: classColor[raider.className] }}>{raider.name}</strong>
                  <small>
                    {raider.spec} · {roleLabel[raider.role]}
                  </small>
                </span>
                <button type="button" className="remove-raider" onClick={() => removeRaider(raider)} aria-label={`Remove ${raider.name}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" className="ghost" onClick={onReset}>
        Clear signups
      </button>
      <button type="button" className="ghost danger" onClick={onDeleteRaid}>
        Delete this raid
      </button>
    </section>
  )
}
