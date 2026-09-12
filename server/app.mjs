import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
  battlenetConfigured,
  demoEnabled,
  discordConfigured,
  leadBattlenetIds,
  leadDiscordIds,
  loadEnv,
  originFromRequest,
  providers,
} from './env.mjs'
import { CLASS_BY_ID, demoPersonas, INSTANCES, ROLES, WOW_CLASSES } from './seed.mjs'
import {
  addCharacter,
  addManualRaider,
  canManage,
  charactersFor,
  createRaid,
  fail,
  findUserByProvider,
  getRaid,
  publicUser,
  raidPayload,
  raidSummary,
  read,
  removeRosterMember,
  update,
} from './store.mjs'

loadEnv()

const COOKIE = 'raid_night_sid'
const MONTH = 60 * 60 * 24 * 30

export const app = new Hono()

app.onError((err, c) => {
  const status = err.status || 500
  if (!err.status) console.error(err)
  return c.json({ error: err.status ? err.message : 'Something went wrong.' }, status)
})

function cookieOpts(c) {
  const origin = originFromRequest(c)
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure: origin.startsWith('https'),
    maxAge: MONTH,
  }
}

function sessionUser(data, c) {
  const sid = getCookie(c, COOKIE)
  if (!sid) return null
  const session = data.sessions[sid]
  if (!session || session.expiresAt < Date.now()) return null
  return data.users[session.userId] || null
}

function requireUser(user) {
  if (!user) throw fail(401, 'Sign in with Discord or Battle.net first.')
  return user
}

function requireLead(user) {
  requireUser(user)
  if (!user.lead) throw fail(403, 'Only a raid lead can do that.')
  return user
}

function applyLeadFlags(user) {
  if (user.discord && leadDiscordIds().includes(user.discord.id)) user.lead = true
  if (user.battlenet && leadBattlenetIds().includes(String(user.battlenet.id))) user.lead = true
}

function seedCharactersIfEmpty(data, user, list) {
  if (!list?.length) return
  if (charactersFor(data, user.id).length) return
  for (const ch of list) addCharacter(data, user.id, ch)
}

function loginOrLink(data, { provider, identity, currentUserId, seed, lead }) {
  const taken = findUserByProvider(data, provider, identity.id)
  const label = provider === 'discord' ? 'Discord' : 'Battle.net'

  if (currentUserId) {
    const user = data.users[currentUserId]
    if (!user) throw fail(401, 'Sign in again, then link.')
    if (taken && taken.id !== user.id) {
      throw fail(409, `That ${label} account is already linked to someone else.`)
    }
    if (user[provider] && user[provider].id !== identity.id) {
      throw fail(409, `Unlink the current ${label} account before connecting a different one.`)
    }
    user[provider] = identity
    if (lead) user.lead = true
    applyLeadFlags(user)
    seedCharactersIfEmpty(data, user, seed)
    return user
  }

  if (taken) {
    taken[provider] = { ...taken[provider], ...identity }
    if (lead) taken.lead = true
    applyLeadFlags(taken)
    seedCharactersIfEmpty(data, taken, seed)
    return taken
  }

  const user = {
    id: `u_${randomUUID()}`,
    createdAt: Date.now(),
    discord: null,
    battlenet: null,
    lead: Boolean(lead),
  }
  user[provider] = identity
  applyLeadFlags(user)
  data.users[user.id] = user
  seedCharactersIfEmpty(data, user, seed)
  return user
}

function createSession(data, c, userId) {
  const sid = randomUUID()
  data.sessions[sid] = {
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + MONTH * 1000,
  }
  setCookie(c, COOKIE, sid, cookieOpts(c))
}

function mePayload(data, user) {
  return {
    user: publicUser(user),
    characters: user ? charactersFor(data, user.id) : [],
    providers: providers(),
  }
}

function redirectAuthError(c, message, origin = originFromRequest(c)) {
  return c.redirect(`${origin}/?auth_error=${encodeURIComponent(message)}`)
}

function discordAuthorize(state, origin) {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/discord/callback`,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'consent',
  })
  return `https://discord.com/oauth2/authorize?${params}`
}

function battlenetAuthorize(state, origin) {
  const params = new URLSearchParams({
    client_id: process.env.BATTLENET_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/battlenet/callback`,
    response_type: 'code',
    scope: 'openid wow.profile',
    state,
  })
  return `https://oauth.battle.net/authorize?${params}`
}

async function discordIdentity(code, origin) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${origin}/api/auth/discord/callback`,
  })
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const token = await tokenRes.json()
  if (!tokenRes.ok) throw fail(400, 'Discord did not accept this login.')
  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  const me = await meRes.json()
  if (!meRes.ok || !me.id) throw fail(400, 'Could not read the Discord account.')
  return {
    id: String(me.id),
    username: me.username,
    globalName: me.global_name || me.username,
  }
}

async function battlenetIdentity(code, origin) {
  const basic = Buffer.from(
    `${process.env.BATTLENET_CLIENT_ID}:${process.env.BATTLENET_CLIENT_SECRET}`,
  ).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${origin}/api/auth/battlenet/callback`,
  })
  const tokenRes = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const token = await tokenRes.json()
  if (!tokenRes.ok) throw fail(400, 'Battle.net did not accept this login.')
  const meRes = await fetch('https://oauth.battle.net/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  const me = await meRes.json()
  const id = me.sub || me.id
  if (!meRes.ok || !id) throw fail(400, 'Could not read the Battle.net account.')
  return {
    id: String(id),
    battletag: me.battletag || me.battle_tag || `Player#${id}`,
    accessToken: token.access_token,
    tokenExpiresAt: Date.now() + (Number(token.expires_in) || 0) * 1000,
  }
}

async function startOAuth(c, provider) {
  const configured = provider === 'discord' ? discordConfigured() : battlenetConfigured()
  if (!configured) {
    return c.json(
      { error: `${provider === 'discord' ? 'Discord' : 'Battle.net'} login is not configured.` },
      400,
    )
  }
  const origin = originFromRequest(c)
  const state = randomUUID()
  await update((data) => {
    const current = sessionUser(data, c)
    const next = c.req.query('next')
    data.oauthStates[state] = {
      provider,
      userId: current?.id || null,
      createdAt: Date.now(),
      origin,
      next: next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/api') ? next : '/',
    }
  })
  const url = provider === 'discord' ? discordAuthorize(state, origin) : battlenetAuthorize(state, origin)
  return c.redirect(url)
}

async function oauthCallback(c, provider) {
  const origin = originFromRequest(c)
  if (c.req.query('error')) return redirectAuthError(c, 'Login was cancelled.', origin)
  const code = c.req.query('code')
  const state = c.req.query('state')
  if (!code || !state) return redirectAuthError(c, 'Login did not finish. Try again.', origin)
  try {
    const pending = read().oauthStates[state]
    if (!pending || pending.provider !== provider) {
      throw fail(400, 'Login expired. Try again.')
    }
    if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
      throw fail(400, 'Login expired. Try again.')
    }
    const redirectOrigin = pending.origin || origin
    const identity =
      provider === 'discord' ? await discordIdentity(code, redirectOrigin) : await battlenetIdentity(code, redirectOrigin)
    await update((data) => {
      const still = data.oauthStates[state]
      delete data.oauthStates[state]
      if (!still || still.provider !== provider) throw fail(400, 'Login expired. Try again.')
      const linked = loginOrLink(data, {
        provider,
        identity,
        currentUserId: still.userId,
        lead: false,
      })
      createSession(data, c, linked.id)
    })
    const next = pending.next && pending.next.startsWith('/') ? pending.next : '/'
    return c.redirect(`${redirectOrigin}${next}`)
  } catch (err) {
    return redirectAuthError(c, err.status ? err.message : 'Could not finish login.', origin)
  }
}

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/api/me', (c) => {
  const data = read()
  return c.json(mePayload(data, sessionUser(data, c)))
})

app.get('/api/instances', (c) => c.json({ instances: INSTANCES }))

app.get('/api/raids', (c) => {
  const data = read()
  const user = sessionUser(data, c)
  const list = Object.values(data.raids)
    .filter((raid) => user && canManage(user, raid))
    .map((raid) => raidSummary(data, raid, user))
    .sort((a, b) => a.name.localeCompare(b.name))
  return c.json({ raids: list })
})

app.get('/api/raids/:id', (c) => {
  const data = read()
  const user = sessionUser(data, c)
  const raid = getRaid(data, c.req.param('id'))
  return c.json(raidPayload(data, raid, user?.id, user))
})

app.post('/api/raids', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const data = read()
  const user = requireUser(sessionUser(data, c))
  const raid = await update((next) => {
    const live = next.users[user.id]
    if (!live) throw fail(401, 'Sign in again.')
    const created = createRaid(next, live, body)
    return raidPayload(next, created, live.id, live)
  })
  return c.json(raid)
})

app.get('/api/raid', (c) => {
  const data = read()
  const user = sessionUser(data, c)
  const id = c.req.query('id') || Object.keys(data.raids)[0]
  const raid = getRaid(data, id)
  return c.json(raidPayload(data, raid, user?.id, user))
})

app.get('/api/auth/discord', (c) => startOAuth(c, 'discord'))
app.get('/api/auth/battlenet', (c) => startOAuth(c, 'battlenet'))
app.get('/api/auth/discord/callback', (c) => oauthCallback(c, 'discord'))
app.get('/api/auth/battlenet/callback', (c) => oauthCallback(c, 'battlenet'))

app.post('/api/auth/demo', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const provider = body.provider === 'battlenet' ? 'battlenet' : body.provider === 'discord' ? 'discord' : null
  const persona = body.persona === 'officer' ? 'officer' : body.persona === 'nyx' ? 'nyx' : null
  if (!provider || !persona) throw fail(400, 'Pick Discord or Battle.net, then who you are.')
  if (!demoEnabled(provider)) {
    throw fail(400, 'Local demo login is off. Use the real Discord / Battle.net buttons.')
  }
  const demo = demoPersonas[provider][persona]
  const user = await update((data) => {
    const live = sessionUser(data, c)
    const linked = loginOrLink(data, {
      provider,
      identity: demo.identity,
      currentUserId: live?.id || null,
      seed: demo.characters,
      lead: demo.lead,
    })
    createSession(data, c, linked.id)
    return linked
  })
  const latest = read()
  return c.json(mePayload(latest, latest.users[user.id]))
})

app.post('/api/auth/logout', async (c) => {
  const sid = getCookie(c, COOKIE)
  if (sid) {
    await update((data) => {
      delete data.sessions[sid]
    })
  }
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

app.post('/api/auth/unlink', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const provider = body.provider === 'battlenet' ? 'battlenet' : body.provider === 'discord' ? 'discord' : null
  if (!provider) throw fail(400, 'Pick Discord or Battle.net to unlink.')
  const data = read()
  const user = requireUser(sessionUser(data, c))
  const other = provider === 'discord' ? 'battlenet' : 'discord'
  if (!user[other]) {
    throw fail(400, 'Link the other account first so you can still sign in.')
  }
  await update((next) => {
    const live = next.users[user.id]
    if (!live) throw fail(401, 'Sign in again.')
    live[provider] = null
  })
  const latest = read()
  return c.json(mePayload(latest, latest.users[user.id]))
})

app.post('/api/characters', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const data = read()
  const user = requireUser(sessionUser(data, c))
  const character = await update((next) => addCharacter(next, user.id, body))
  return c.json({ character })
})

app.patch('/api/characters/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const data = read()
  const user = requireUser(sessionUser(data, c))
  const character = await update((next) => {
    const ch = next.characters[id]
    if (!ch || ch.userId !== user.id) throw fail(404, 'Character not found.')
    if (body.name) {
      const name = String(body.name).trim()
      if (!/^[A-Za-z]{2,12}$/.test(name)) throw fail(400, 'Character names are 2–12 letters.')
      ch.name = name
    }
    if (body.className) {
      if (!WOW_CLASSES.includes(body.className)) throw fail(400, 'Pick a class.')
      if (body.className !== ch.className) {
        ch.lastPicks = []
        const signup = next.raid.signups[user.id]
        if (signup?.characterId === ch.id) signup.picks = []
      }
      ch.className = body.className
    }
    if (body.spec) ch.spec = String(body.spec).trim().slice(0, 32)
    if (body.role) {
      if (!ROLES.includes(body.role)) throw fail(400, 'Pick tank, healer, or damage.')
      ch.role = body.role
    }
    if (body.realm != null) ch.realm = String(body.realm).trim().slice(0, 32)
    return ch
  })
  return c.json({ character })
})

app.delete('/api/characters/:id', async (c) => {
  const id = c.req.param('id')
  const data = read()
  const user = requireUser(sessionUser(data, c))
  await update((next) => {
    const ch = next.characters[id]
    if (!ch || ch.userId !== user.id) throw fail(404, 'Character not found.')
    const signup = next.raid.signups[user.id]
    if (signup?.characterId === id) delete next.raid.signups[user.id]
    delete next.characters[id]
  })
  return c.json({ ok: true })
})

app.get('/api/wow/characters', async (c) => {
  const data = read()
  const user = requireUser(sessionUser(data, c))
  const live = data.users[user.id]
  const token = live?.battlenet?.accessToken
  const expires = live?.battlenet?.tokenExpiresAt || 0
  if (!token || expires < Date.now() + 5000) {
    throw fail(401, 'Link Battle.net again to import characters.')
  }
  const region = process.env.BATTLENET_REGION || 'us'
  const namespaces = [
    `profile-${region}`,
    `profile-classic-${region}`,
    `profile-classic1x-${region}`,
  ]
  const found = []
  for (const namespace of namespaces) {
    const res = await fetch(
      `https://${region}.api.blizzard.com/profile/user/wow?namespace=${namespace}&locale=en_US`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) continue
    const json = await res.json()
    for (const account of json.wow_accounts || []) {
      for (const ch of account.characters || []) {
        const className =
          CLASS_BY_ID[ch.playable_class?.id] ||
          (WOW_CLASSES.includes(ch.playable_class?.name) ? ch.playable_class.name : null)
        if (!className || !ch.name) continue
        found.push({
          name: ch.name,
          realm: ch.realm?.name || ch.realm?.slug || '',
          className,
          level: ch.level || 0,
          namespace,
        })
      }
    }
  }
  const uniq = []
  const seen = new Set()
  for (const ch of found) {
    const key = `${ch.name.toLowerCase()}|${ch.realm.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    uniq.push(ch)
  }
  return c.json({ characters: uniq })
})

app.post('/api/wow/import', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const list = Array.isArray(body.characters) ? body.characters : []
  const data = read()
  const user = requireUser(sessionUser(data, c))
  const added = await update((next) => {
    const created = []
    for (const ch of list) {
      try {
        created.push(
          addCharacter(next, user.id, {
            name: ch.name,
            className: ch.className,
            spec: ch.spec || ch.className,
            role: ROLES.includes(ch.role) ? ch.role : 'dps',
            realm: ch.realm || '',
            source: 'battlenet',
          }),
        )
      } catch (err) {
        if (err.status !== 409) throw err
      }
    }
    return created
  })
  return c.json({ characters: added })
})

app.post('/api/raids/:id/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const data = read()
  const user = requireUser(sessionUser(data, c))
  const raid = await update((next) => {
    const live = next.users[user.id]
    if (!live) throw fail(401, 'Sign in again.')
    const current = getRaid(next, c.req.param('id'))
    const character = next.characters[body.characterId]
    if (!character || character.userId !== live.id) throw fail(400, 'Pick one of your characters.')
    const existing = current.signups[live.id]
    if (current.locked && !existing) throw fail(403, 'Signups are locked for tonight.')
    if (current.locked && existing) throw fail(403, 'Picks are locked for tonight.')
    let picks = Array.isArray(body.picks)
      ? body.picks.filter((n) => Number.isInteger(n)).slice(0, current.pickLimit)
      : existing?.picks || []
    const previous = existing ? next.characters[existing.characterId] : null
    if (previous && previous.className !== character.className) picks = Array.isArray(body.picks) ? picks : []
    current.signups[live.id] = {
      userId: live.id,
      characterId: character.id,
      picks,
    }
    character.lastPicks = picks
    return raidPayload(next, current, live.id, live)
  })
  return c.json(raid)
})

app.post('/api/raids/:id/lock', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const data = read()
  const user = requireUser(sessionUser(data, c))
  const raid = await update((next) => {
    const live = next.users[user.id]
    const current = getRaid(next, c.req.param('id'))
    if (!canManage(live, current)) throw fail(403, 'Only the raid lead can do that.')
    current.locked = Boolean(body.locked)
    return raidPayload(next, current, live.id, live)
  })
  return c.json(raid)
})

app.post('/api/raids/:id/reset', async (c) => {
  const data = read()
  const user = requireUser(sessionUser(data, c))
  const raid = await update((next) => {
    const live = next.users[user.id]
    const current = getRaid(next, c.req.param('id'))
    if (!canManage(live, current)) throw fail(403, 'Only the raid lead can do that.')
    current.locked = false
    current.signups = {}
    return raidPayload(next, current, live.id, live)
  })
  return c.json(raid)
})

app.delete('/api/raids/:id', async (c) => {
  const data = read()
  const user = requireUser(sessionUser(data, c))
  await update((next) => {
    const live = next.users[user.id]
    const current = getRaid(next, c.req.param('id'))
    if (!canManage(live, current)) throw fail(403, 'Only the raid lead can do that.')
    delete next.raids[current.id]
  })
  return c.json({ ok: true })
})

app.post('/api/raids/:id/roster', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const data = read()
  const user = requireUser(sessionUser(data, c))
  const raid = await update((next) => {
    const live = next.users[user.id]
    const current = getRaid(next, c.req.param('id'))
    if (!canManage(live, current)) throw fail(403, 'Only the raid lead can do that.')
    addManualRaider(next, current, body)
    return raidPayload(next, current, live.id, live)
  })
  return c.json(raid)
})

app.delete('/api/raids/:id/roster/:memberId', async (c) => {
  const data = read()
  const user = requireUser(sessionUser(data, c))
  const raid = await update((next) => {
    const live = next.users[user.id]
    const current = getRaid(next, c.req.param('id'))
    if (!canManage(live, current)) throw fail(403, 'Only the raid lead can do that.')
    removeRosterMember(next, current, c.req.param('memberId'))
    return raidPayload(next, current, live.id, live)
  })
  return c.json(raid)
})
