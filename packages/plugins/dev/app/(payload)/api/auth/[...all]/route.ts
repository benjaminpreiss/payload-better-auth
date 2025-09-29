import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from 'lib/auth.js'

export const { GET, POST } = toNextJsHandler(auth)
