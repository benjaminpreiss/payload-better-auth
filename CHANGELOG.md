# [2.0.0](https://github.com/benjaminpreiss/payload-better-auth/compare/v1.1.6...v2.0.0) (2026-01-11)


* feat!: redesign sync architecture with SecondaryStorage and EventBus ([3fd85d9](https://github.com/benjaminpreiss/payload-better-auth/commit/3fd85d98319bf847059ab8af3fcbe99d560df401))


### BREAKING CHANGES

* Storage and EventBus are now required plugin options.
Removed InMemorySyncAdapter, InMemoryEventBus, and LMDB implementations.

Architecture changes:
- SecondaryStorage: Minimal KV interface (get/set/delete) for sessions,
  timestamps, and nonces. Implementations: SQLite (dev), Redis (prod)
- EventBus: Timestamp-based coordination between plugins.
  Implementations: SQLite polling (dev), Redis Pub/Sub (prod)
- Queue-based sync: All user operations go through reconcile queue
  with retry logic (no more direct sync or EventBus user events)
- Direct session validation: Payload reads sessions from storage,
  no HTTP calls to Better Auth

Key improvements:
- Instant session invalidation via shared storage
- Horizontal scaling with Redis adapters
- HMR-resilient with deduplicated logger
- SQLite adapters throw in staging/production environments

New exports:
- payload-better-auth/storage (SecondaryStorage, SQLite, Redis)
- payload-better-auth/eventBus (EventBus, SQLite polling, Redis Pub/Sub)

Removed:
- InMemorySyncAdapter, InMemoryEventBus, LmdbStorage
- Unused: verifySignature, createSignature, getPayloadCached,
  createAttachExternalIdInPayload, UserEvent types
- Empty directories: src/types/, src/collections/BetterAuthUsers/

Updated README and MANUAL with new architecture documentation.

## [1.1.6](https://github.com/benjaminpreiss/payload-better-auth/compare/v1.1.5...v1.1.6) (2026-01-11)


### Bug Fixes

* add repository field for npm provenance verification ([89e9b6a](https://github.com/benjaminpreiss/payload-better-auth/commit/89e9b6a317057e66bb9329c281ebc04be4a98d06))

## [1.1.5](https://github.com/benjaminpreiss/payload-better-auth/compare/v1.1.4...v1.1.5) (2026-01-11)


### Bug Fixes

* enable npmPublish in semantic-release ([1f54eb1](https://github.com/benjaminpreiss/payload-better-auth/commit/1f54eb10d2b40e730540ae9a3eb7f7695228800e))

## [1.1.4](https://github.com/benjaminpreiss/payload-better-auth/compare/v1.1.3...v1.1.4) (2026-01-11)


### Bug Fixes

* use Node 24 with npm 11 for better OIDC trusted publishing ([1502c07](https://github.com/benjaminpreiss/payload-better-auth/commit/1502c076d6010fc68e9878fa378ee5c6ce9a9931))

## [1.1.3](https://github.com/benjaminpreiss/payload-better-auth/compare/v1.1.2...v1.1.3) (2026-01-11)


### Bug Fixes

* add explicit @semantic-release/npm for OIDC support ([e505ad8](https://github.com/benjaminpreiss/payload-better-auth/commit/e505ad8db304d0faf53344a681424fb2540cb4cd))

## [1.1.2](https://github.com/benjaminpreiss/payload-better-auth/compare/v1.1.1...v1.1.2) (2026-01-11)


### Bug Fixes

* trigger npm publish with trusted publishing ([53acca6](https://github.com/benjaminpreiss/payload-better-auth/commit/53acca61dcba1ddf46bfd0c18066113f9d032e6f))

## [1.1.1](https://github.com/benjaminpreiss/payload-better-auth/compare/v1.1.0...v1.1.1) (2026-01-11)


### Performance Improvements

* add nx caching for tests and dev build ([7e7e6d1](https://github.com/benjaminpreiss/payload-better-auth/commit/7e7e6d18ed30d9beefa2621851171568e2bc84d6))

# [1.1.0](https://github.com/benjaminpreiss/payload-better-auth/compare/v1.0.0...v1.1.0) (2026-01-11)


### Bug Fixes

* revert prepare script workaround ([381cba9](https://github.com/benjaminpreiss/payload-better-auth/commit/381cba95882c58ef8ea4c087ce564ea137b447fd))


### Features

* **ci:** enable npm trusted publishing with provenance ([ac9cccf](https://github.com/benjaminpreiss/payload-better-auth/commit/ac9cccffe8bf07bbbdb216038e0c9076b048f4b6))

# 1.0.0 (2026-01-11)


### Bug Fixes

* adjust int test to reflect new auth methods endpoint ([940e87d](https://github.com/benjaminpreiss/payload-better-auth/commit/940e87d7ff58b6d2b9e989f844b3e7b5deeb2810))
* allow passing additional headers to payload plugin ([b324ee7](https://github.com/benjaminpreiss/payload-better-auth/commit/b324ee75c188c0ec2c5311d480ea7e61b35cad5d))
* **ci:** disable husky hooks during semantic-release ([b51ca61](https://github.com/benjaminpreiss/payload-better-auth/commit/b51ca6159c80d8c0ef1e67e168220050b5e48c25))
* fix dev environment payload plugin options ([3e07289](https://github.com/benjaminpreiss/payload-better-auth/commit/3e072895363b5c9b8925818eaa247e61f70481cd))
* fix magic link callback url ([894e5ec](https://github.com/benjaminpreiss/payload-better-auth/commit/894e5ece419d0c2127b05bea785041e4e27947c2))
* fix passing serverProps to payload login components ([c8bc3a6](https://github.com/benjaminpreiss/payload-better-auth/commit/c8bc3a62e33dadce057b5b1e4030e80e6018c009))
* fix payload plugin passing options to auth component ([e31f7f0](https://github.com/benjaminpreiss/payload-better-auth/commit/e31f7f0c1dd988f8ef7efa2d0aa953c598276f54))
* improve package.json for install directly from github ([f0c4493](https://github.com/benjaminpreiss/payload-better-auth/commit/f0c4493cdb6738db55900ffad50e12713a975973))
* include src in files published to npm ([b753b7c](https://github.com/benjaminpreiss/payload-better-auth/commit/b753b7c33a4c80ba6e52bad4237303bc5e0c7ae2))
* make dist package json export paths relative ([e551e09](https://github.com/benjaminpreiss/payload-better-auth/commit/e551e09c82ba7cbacd0a70fb9c537e4c0a818b18))
* remove better auth plugin init type error ([4a75bcb](https://github.com/benjaminpreiss/payload-better-auth/commit/4a75bcb541e5ee4fbeb2ef80eb137df6ee101262))
* rename payload plugin baseUrl option ([63f5c32](https://github.com/benjaminpreiss/payload-better-auth/commit/63f5c325abbab1efbbaa1c0c1e8e105f3f71bcb4))
* resolve Better Auth plugin integration issues ([763369a](https://github.com/benjaminpreiss/payload-better-auth/commit/763369a487dd3b5a379b0212b3d878b232c75524))
* setup testing script ([46ca634](https://github.com/benjaminpreiss/payload-better-auth/commit/46ca634386019741384f920a6c78d98a9de13098))
* switch from server url base detection to window.location.origin ([daf4ea1](https://github.com/benjaminpreiss/payload-better-auth/commit/daf4ea14c66f1f5ee955f34b395daa1c2e9b6397))


### Features

* add admin user creation and improve auth components ([a210e76](https://github.com/benjaminpreiss/payload-better-auth/commit/a210e766843d9dd9825d6faf90069807fa70f255))
* add locale to user database ([294866c](https://github.com/benjaminpreiss/payload-better-auth/commit/294866cfad983e4621ae114c442bc9980c599f98))
* add logging toggle to better-auth plugin ([795676f](https://github.com/benjaminpreiss/payload-better-auth/commit/795676fead952a74d19652792dbaefe24b116bed))
* add magicLink login ([1ab9ff5](https://github.com/benjaminpreiss/payload-better-auth/commit/1ab9ff514ce25feaf582da5e1992c53f80ad4406))
* add Nx caching for build, lint, and typecheck ([ed52b09](https://github.com/benjaminpreiss/payload-better-auth/commit/ed52b09a65483129d64b2a91b3f46d400f351062))
* add pnpm workspace for npm package ([951e70f](https://github.com/benjaminpreiss/payload-better-auth/commit/951e70f5fb830b85bf82cf16c6a01391b99cbc01))
* add semantic-release for automated versioning ([e3add4b](https://github.com/benjaminpreiss/payload-better-auth/commit/e3add4b5e995f6f8be70aa94055ecacb83272491))
* add separate internal/external base URLs for server/client auth requests ([3a09b54](https://github.com/benjaminpreiss/payload-better-auth/commit/3a09b5436edb72ea3e262471dc78f15c8f2ff12c))
* create basic better-auth sync solution ([2f442bf](https://github.com/benjaminpreiss/payload-better-auth/commit/2f442bf987b771b54a4874fce7c49178dc45da5b))
* fix payload plugin options ([f9033c0](https://github.com/benjaminpreiss/payload-better-auth/commit/f9033c02927c7162936c0c9fe6dd0b05bb5e57a1))
* further improve github publishing ([8d16c6a](https://github.com/benjaminpreiss/payload-better-auth/commit/8d16c6ab4699f523f70419ed92152f8669e566b7))
* improve github publishing ([130b9bd](https://github.com/benjaminpreiss/payload-better-auth/commit/130b9bd0cba60b60d656b4406ee323841d9f3974))
* init pnpm ([032d770](https://github.com/benjaminpreiss/payload-better-auth/commit/032d770c0192fb34e1c51e0c9665ba89226f5bb1))
* integrate Better Auth authentication system ([9c9c3f8](https://github.com/benjaminpreiss/payload-better-auth/commit/9c9c3f855258c0289c4b8eaec567eca70cb44c03))
* internalize db hooks and delete user in plugin ([d087d79](https://github.com/benjaminpreiss/payload-better-auth/commit/d087d7934f190419c07585e9ff08fdf303d4a375))
* migrate to bundler moduleResolution for Turbopack compatibility ([943a0b3](https://github.com/benjaminpreiss/payload-better-auth/commit/943a0b39a562899c1e29f1c21316cb081fd0992f))
* move code to package ([67ca385](https://github.com/benjaminpreiss/payload-better-auth/commit/67ca38541220c923c92d233aada7b3dbd45586eb))
* move migrations to dev/ and improve build config ([c85f8d7](https://github.com/benjaminpreiss/payload-better-auth/commit/c85f8d7c766f58cc54bf97f6cfbfe54e1172ccce))
* setup payload and better-auth plugins ([bf69c05](https://github.com/benjaminpreiss/payload-better-auth/commit/bf69c053f99152692336a52ab1678cf1104c10ca))
* setup payload with sqlite ([04dfd1d](https://github.com/benjaminpreiss/payload-better-auth/commit/04dfd1dbc4ebd0c0e27b331e9d2a1c1de6cde6f5))
