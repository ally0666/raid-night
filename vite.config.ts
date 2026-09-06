import { getRequestListener } from '@hono/node-server'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'raid-api',
      async configureServer(server) {
        // @ts-expect-error JS server module
        const { app } = await import('./server/app.mjs')
        const listener = getRequestListener(app.fetch)
        server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.url?.startsWith('/api')) {
            listener(req, res)
            return
          }
          next()
        })
      },
    },
  ],
  server: {
    host: true,
    port: 5173,
  },
})
