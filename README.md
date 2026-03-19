# macOS Cleaner

Local web app (Nuxt 4 + Nitro) that scans **curated** macOS / developer storage categories, shows reclaimable space, and runs cleanup after confirmation. **macOS only** — it shells out to system tools and expects macOS paths and Trash behavior.

## Requirements

- macOS
- [Node.js](https://nodejs.org/) 20+ (LTS recommended)
- [pnpm](https://pnpm.io/) 9+

## Quick start

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production build

```bash
pnpm build
pnpm preview   # or: pnpm start
```

## What it does

- Scans known categories (Docker reclaim, Homebrew cache, project artifacts, package caches, browser caches, etc.)
- Streams scan/cleanup progress from Nitro API routes
- Builds cleanup plans from **server-trusted item ids** — not arbitrary paths from the browser
- Prefers **move to Trash** for file-based cleanup where applicable; uses vendor commands (e.g. Docker, brew) where supported

## Safety

This tool can **delete or reclaim large amounts of data**. Read each category and confirmation step carefully. You are responsible for what you clean. There is no warranty — use at your own risk.

## Project layout

| Path | Role |
|------|------|
| `app/` | Nuxt UI (Vue 3, Composition API, Tailwind) |
| `server/` | Nitro routes and scan/cleanup implementation |
| `shared/` | Types and logic shared with the server bundle |
| `docs/implementation-blueprint.md` | Product/architecture notes |

## Stack

- Nuxt 4, Vue 3, Tailwind CSS 4
- Nitro (Node server preset)

## License

MIT — see [LICENSE](./LICENSE).
