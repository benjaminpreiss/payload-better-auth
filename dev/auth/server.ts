import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { auth } from '../lib/auth'

const app = new Hono()

const payloadPortRaw = process.env.PAYLOAD_PORT
if (payloadPortRaw === undefined) throw new Error('PAYLOAD_PORT is required')
const authOrigin = `http://localhost:${payloadPortRaw}`

app.use(
  '/api/auth/*',
  cors({
    allowHeaders: ['Content-Type', 'Authorization', 'x-reconcile-token'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    credentials: true,
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    origin: authOrigin,
  }),
)

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

const portRaw = process.env.BETTER_AUTH_PORT
if (portRaw === undefined) throw new Error('BETTER_AUTH_PORT is required')
const port = Number(portRaw)

serve({ fetch: app.fetch, port }, (info: { port: number }) => {
  // eslint-disable-next-line no-console -- auth process startup log
  console.log(`[auth] Better Auth server at http://localhost:${info.port}/api/auth`)
})
