// Drives the Discord bot end to end against a throwaway store, with Discord's API stubbed.
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const dataDir = mkdtempSync(join(tmpdir(), 'raid-night-'))
process.env.DATA_DIR = dataDir
process.env.DISCORD_CLIENT_ID = '111111111111111111'
process.env.DISCORD_BOT_TOKEN = 'test-token'
process.env.DISCORD_PUBLIC_KEY = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
process.env.PUBLIC_URL = 'https://raid.test'

const calls = []
let nextMessage = 9000
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null
  calls.push({ method: init.method, url: String(url), body })
  if (init.method === 'POST') return Response.json({ id: String((nextMessage += 1)) })
  return Response.json({})
}

const { app } = await import('../server/app.mjs')
const { registerCommands, syncRaidPosts } = await import('../server/discord.mjs')
const { read } = await import('../server/store.mjs')

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function send(payload, { forge = false } = {}) {
  const body = JSON.stringify(payload)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = sign(null, Buffer.from(timestamp + (forge ? 'x' : '') + body), privateKey).toString('hex')
  const res = await app.request('/api/discord/interactions', {
    method: 'POST',
    headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp },
    body,
  })
  return { status: res.status, json: await res.json() }
}

const lead = { id: '200000000000000001', username: 'lead', global_name: 'Lead' }
const raider = { id: '200000000000000002', username: 'nyx', global_name: 'Nyx' }
const base = { guild_id: '300000000000000001', channel_id: '400000000000000001' }
const click = (user, custom_id, values, extra = {}) =>
  send({ type: 3, ...base, member: { user }, data: { custom_id, values }, ...extra })

try {
  assert(await registerCommands(), 'commands register')
  assert(calls[0].method === 'PUT' && calls[0].body[0].name === 'raid', 'command payload')

  assert((await send({ type: 1 }, { forge: true })).status === 401, 'forged signature rejected')
  assert((await send({ type: 1 })).json.type === 1, 'ping')

  const created = await send({
    type: 2,
    ...base,
    member: { user: lead },
    data: {
      name: 'raid',
      options: [
        {
          name: 'create',
          options: [
            { name: 'instance', value: 'karazhan' },
            { name: 'date', value: '2026-10-06' },
          ],
        },
      ],
    },
  })
  assert(created.json.data.content.startsWith('Scheduled and posted'), `create: ${created.json.data.content}`)
  const raid = Object.values(read().raids)[0]
  assert(raid.when === 'Tuesday, 8:00 PM' && raid.dateLabel === 'Tue, Oct 6' && raid.lockLabel === '7:45 PM', 'labels')
  assert(raid.discordPosts?.[0]?.messageId === '9001', 'post saved')
  const posted = calls.find((call) => call.method === 'POST')
  assert(posted.url.endsWith('/channels/400000000000000001/messages'), 'posted to channel')
  assert(posted.body.embeds[0].description.includes('0/10'), 'empty roster count')

  const auto = await send({
    type: 4,
    ...base,
    member: { user: lead },
    data: { name: 'raid', options: [{ name: 'post', options: [{ name: 'raid', value: 'kara', focused: true }] }] },
  })
  assert(auto.json.data.choices[0]?.value === raid.id, 'lead autocompletes own raid')
  const stranger = await send({
    type: 2,
    ...base,
    member: { user: raider },
    data: { name: 'raid', options: [{ name: 'post', options: [{ name: 'raid', value: raid.id }] }] },
  })
  assert(stranger.json.data.content.startsWith('Pick one of your raids'), 'raiders cannot post a lead raid')

  const join = await click(raider, `rn:join:${raid.id}`)
  assert(join.json.type === 4 && join.json.data.flags === 64, 'join prompt is private')
  assert(join.json.data.components[0].components[0].custom_id === `rn:class:${raid.id}`, 'new raider picks a class')
  const specs = await click(raider, `rn:class:${raid.id}`, ['8'])
  assert(specs.json.data.components[0].components[0].options.length === 4, 'druid specs')
  const modal = await click(raider, `rn:spec:${raid.id}:8`, ['1'], { member: { user: raider, nick: 'Thistlepaw' } })
  assert(modal.json.type === 9 && modal.json.data.components[0].components[0].value === 'Thistlepaw', 'name modal')

  const patchesBefore = calls.filter((call) => call.method === 'PATCH').length
  const named = await send({
    type: 5,
    ...base,
    member: { user: raider },
    message: { id: '1' },
    data: {
      custom_id: modal.json.data.custom_id,
      components: [{ components: [{ custom_id: 'name', value: 'Thistlepaw' }] }],
    },
  })
  assert(named.json.type === 7 && named.json.data.content.includes('Signed up as **Thistlepaw**'), 'signed up')
  await syncRaidPosts()
  const patches = calls.filter((call) => call.method === 'PATCH')
  assert(patches.length === patchesBefore + 1, 'post edited once')
  const tanks = patches.at(-1).body.embeds[0].fields[0]
  assert(tanks.name === '🛡️ Tanks (1)' && tanks.value.includes('Thistlepaw') && tanks.value.includes('0/2'), 'roster shows tank')
  await syncRaidPosts()
  assert(calls.filter((call) => call.method === 'PATCH').length === patchesBefore + 1, 'unchanged post not re-sent')

  const again = await click(raider, `rn:join:${raid.id}`)
  const options = again.json.data.components[0].components[0].options
  assert(options[0].label === 'Thistlepaw' && options[0].default && options[1].value === 'new', 'returning raider picks a character')

  const absent = await click(raider, `rn:absent:${raid.id}`, undefined, { message: { id: '9001' } })
  const fields = absent.json.data.embeds[0].fields
  assert(absent.json.type === 7 && fields[0].name === '🛡️ Tanks (0)', 'absent leaves roster')
  assert(fields.at(-1).name === '🚫 Absent (1)' && fields.at(-1).value === `<@${raider.id}>`, 'absent listed')

  const back = await click(raider, `rn:char:${raid.id}`, [options[0].value])
  assert(back.json.data.content.includes('Signed up as'), 'sign back up')
  assert(!read().raids[raid.id].rsvp[Object.keys(read().raids[raid.id].signups)[0]], 'rsvp cleared')

  console.log('discord checks ok')
} finally {
  rmSync(dataDir, { recursive: true, force: true })
}
