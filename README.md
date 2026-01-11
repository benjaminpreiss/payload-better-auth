# payload-better-auth

A Payload CMS plugin that integrates [Better Auth](https://better-auth.com) for seamless user authentication and management.

## Features

- **Better Auth as Single Source of Truth** — All user operations managed through Better Auth
- **Real-time Sync** — Automatic synchronization via database hooks
- **Background Reconciliation** — Periodic full sync ensures data consistency
- **Cryptographic Security** — Signed operations prevent unauthorized modifications
- **Custom Login UI** — Replaces Payload's default login with Better Auth authentication

## Installation

```bash
pnpm add payload-better-auth better-auth
```

**Requirements:** Node.js 18.20.2+, Better Auth 1.4.10+, Payload CMS 3.37.0+

## Quick Start

### 1. Configure Better Auth

```typescript
// lib/auth.ts
import { betterAuth } from 'better-auth'
import { admin, apiKey } from 'better-auth/plugins'
import Database from 'better-sqlite3'
import { payloadBetterAuthPlugin } from 'payload-better-auth'
import buildConfig from './payload.config.js'

export const auth = betterAuth({
  database: new Database(process.env.BETTER_AUTH_DB_PATH || './better-auth.db'),
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },
  plugins: [
    admin(),
    apiKey(),
    payloadBetterAuthPlugin({
      payloadConfig: buildConfig,
      token: process.env.RECONCILE_TOKEN,
    }),
  ],
})
```

### 2. Configure Payload

```typescript
// payload.config.ts
import { buildConfig } from 'payload'
import { betterAuthPlugin } from 'payload-better-auth'
import { auth } from './lib/auth.js'

export default buildConfig({
  plugins: [betterAuthPlugin({ betterAuth: auth })],
  // ... rest of your config
})
```

### 3. Set Environment Variables

```bash
BETTER_AUTH_SECRET=your-secret-min-32-chars
BETTER_AUTH_DB_PATH=./better-auth.db
BA_TO_PAYLOAD_SECRET=your-sync-secret
RECONCILE_TOKEN=your-api-token
PAYLOAD_SECRET=your-payload-secret
DATABASE_URI=file:./payload.db
```

## Documentation

For detailed configuration options, API endpoints, architecture details, and production considerations, see the **[MANUAL.md](./MANUAL.md)**.

## Development

### Getting Started

```bash
# Install dependencies
pnpm install

# Reset databases and run migrations
pnpm reset

# Start development server
pnpm dev
```

The dev server starts at [http://localhost:3000](http://localhost:3000) with a mail server at port 1080.

### Git Hooks

This project uses [Husky](https://typicode.github.io/husky/) for Git hooks:

- **pre-commit**: Automatically builds the plugin and stages the `dist/` folder
- **pre-push**: Runs lint, typecheck, and tests before pushing

When you're happy with your changes, just commit — the build is handled for you!

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start dev server with mail server |
| `pnpm build` | Build the plugin |
| `pnpm reset` | Reset databases and run all migrations |
| `pnpm test` | Run all tests |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm generate:types` | Generate Payload types |

### Project Structure

```
├── src/                    # Plugin source code
│   ├── better-auth/        # Better Auth integration
│   ├── collections/        # Payload collections
│   ├── components/         # React components
│   ├── payload/            # Payload plugin
│   └── exports/            # Client/RSC exports
├── dev/                    # Development environment
│   ├── app/                # Next.js app
│   ├── lib/                # Dev configuration
│   └── tests/              # Test files
└── dist/                   # Built output
```

## License

MIT
