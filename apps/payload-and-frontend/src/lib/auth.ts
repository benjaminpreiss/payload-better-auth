import { betterAuth } from 'better-auth'
import Database from 'better-sqlite3'
export const auth = betterAuth({
  database: new Database('./better-auth.db'),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    deleteUser: {
      enabled: true,
    },
  },
})
