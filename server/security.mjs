import { originFromRequest } from './env.mjs'

const hits = new Map()

function clientIp(c) {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 64)
  return c.req.header('cf-connecting-ip') || 'local'
}

export function rateLimit({ windowMs, max, name }) {
  return async (c, next) => {
    const now = Date.now()
    if (hits.size > 20000) {
      for (const [key, bucket] of hits) {
        if (now > bucket.reset) hits.delete(key)
      }
    }
    const key = `${name}:${clientIp(c)}`
    let bucket = hits.get(key)
    if (!bucket || now > bucket.reset) {
      bucket = { n: 0, reset: now + windowMs }
      hits.set(key, bucket)
    }
    bucket.n += 1
    if (bucket.n > max) {
      return c.json({ error: 'Too many requests. Wait a minute and try again.' }, 429)
    }
    await next()
  }
}

export function safeNextPath(next) {
  if (typeof next !== 'string') return '/'
  if (next === '/') return '/'
  if (/^\/r\/[A-Za-z0-9_-]{3,80}$/.test(next)) return next
  return '/'
}

export function safeRaidId(id) {
  if (typeof id !== 'string') return null
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(id)) return null
  return id
}

export async function sameOriginMutations(c, next) {
  if (/^(GET|HEAD|OPTIONS)$/.test(c.req.method)) return next()
  const site = c.req.header('sec-fetch-site')
  if (site === 'cross-site') return c.json({ error: 'Blocked.' }, 403)
  const origin = c.req.header('origin')
  if (origin && origin !== originFromRequest(c)) return c.json({ error: 'Blocked.' }, 403)
  return next()
}
