import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { app } from './app.mjs'
import { botInviteUrl, loadEmojis, registerCommands, syncRaidPosts } from './discord.mjs'
import { loadEnv, rootDir } from './env.mjs'

loadEnv()

const dist = join(rootDir, 'dist')
const indexPath = join(dist, 'index.html')
if (!existsSync(indexPath)) {
  console.error('Missing dist/. Run npm run build first.')
  process.exit(1)
}

const indexHtml = readFileSync(indexPath, 'utf8')

// The page itself must be re-checked on every visit, or browsers keep showing the build from before a deploy.
app.use('/*', async (c, next) => {
  await next()
  if (!c.req.path.startsWith('/assets/')) c.header('Cache-Control', 'no-cache')
})

app.use('/*', async (c, next) => {
  if (c.req.path.startsWith('/api')) return next()
  return serveStatic({ root: './dist' })(c, next)
})

app.get('*', (c) => {
  if (c.req.path.startsWith('/api')) return c.notFound()
  return c.html(indexHtml)
})

const port = Number(process.env.PORT || 5173)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
console.log(`raid-night on http://0.0.0.0:${port}`)

registerCommands()
  .then((ok) => ok && console.log(`Discord bot ready. Invite it: ${botInviteUrl()}`))
  .catch((err) => console.error(err.message))

loadEmojis()
  .then((ok) => ok && syncRaidPosts())
  .catch((err) => console.error(err.message))
