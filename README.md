# macOS Cleaner

A Nuxt 4 full-stack macOS storage cleaner.

## Stack

- Nuxt 4 + Nitro on Node
- Vue 3 + Composition API
- Tailwind CSS
- Single server in development and production

## What It Does

- Analyzes reclaimable storage across curated macOS and developer categories
- Streams scan and cleanup progress from Nitro server routes
- Builds cleanup plans from trusted item ids instead of raw client delete paths
- Moves file-based items to Trash and uses vendor commands for supported tool cleanup

## Current Categories

- Docker reclaimable data
- Homebrew cache
- Project artifacts like `node_modules`, `dist`, `build`, `.next`, and `target`
- Package caches such as pnpm, npm, Playwright, pip, Poetry, and Cargo
- App caches for Arc, Chrome, and Safari

## Usage

```bash
pnpm install
pnpm dev
```

The local app runs on `http://localhost:3000`.
