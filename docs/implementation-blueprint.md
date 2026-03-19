# macOS Cleaner Implementation Blueprint

## Product Direction

- Product type: macOS-only local web app.
- Launch model: start a local Node service, bind to an available localhost port, open the browser automatically.
- Primary user flow: analyze -> review -> confirm -> clean -> report.
- Default mode: targeted analyzers for known developer and macOS storage hogs.
- Explicit non-goal: blind recursive scanning of `/` as the default behavior.

## Release Principles

- Use vendor-supported commands when a tool provides them.
- Use file-system deletion only for cache and artifact directories we explicitly trust.
- Never accept arbitrary delete paths from the client.
- Default file-based cleanup to move-to-trash behavior where practical.
- Require a stronger confirmation step for destructive categories like Docker volumes.

## Target Architecture

```text
macos-cleaner/
  client/
    src/
      app/
        state.ts
        sample-data.ts
      components/
        app-shell.ts
        progress-panel.ts
        category-card.ts
        cleanup-summary.ts
      screens/
        landing-screen.ts
        results-screen.ts
        confirm-screen.ts
      lib/
        api.ts
        format.ts
        events.ts
      styles/
        tokens.css
        layout.css
      main.ts
  server/
    src/
      app.ts
      config.ts
      routes/
        health.ts
        scan.ts
        cleanup.ts
        settings.ts
      analyzers/
        docker.ts
        homebrew.ts
        node-projects.ts
        package-caches.ts
        app-caches.ts
        xcode.ts
      executors/
        docker.ts
        homebrew.ts
        trash.ts
        package-caches.ts
      services/
        scan-engine.ts
        cleanup-engine.ts
        job-store.ts
      lib/
        command-runner.ts
        path-policy.ts
        size.ts
        logger.ts
  shared/
    src/
      contracts.ts
      analyzers.ts
      risks.ts
```

## Backend Design

### Command Runner

- Use `spawn` or `execFile` only.
- Pass arguments as arrays. Do not interpolate shell strings.
- Apply timeouts, cancellation, stdout size limits, and structured logging.
- Keep an allowlist of supported executables such as `docker`, `brew`, `npm`, `pnpm`, `yarn`, `bun`, `du`, `find`, and `xcrun`.

### Scan Engine

- A scan is a job with lifecycle states: `queued`, `running`, `completed`, `failed`, `cancelled`.
- Each analyzer emits progress events and a typed result payload.
- The engine aggregates totals by category and stores results server-side.
- The client only receives opaque `itemId` values and metadata needed for display.

### Cleanup Engine

- Cleanup takes a previously generated scan result plus a list of selected `itemId` values.
- The engine resolves `itemId` values to trusted actions.
- Each action has `mode`, `risk`, `preview`, and `execute` steps.
- `mode` values:
  - `vendor-command`
  - `move-to-trash`
  - `permanent-delete`

## Route Contracts

### `GET /api/health`

```json
{
  "status": "ok",
  "port": 3087,
  "platform": "darwin"
}
```

### `POST /api/scan`

Request:

```json
{
  "roots": ["/Users/example/Development", "/Users/example/Code"],
  "include": ["docker", "homebrew", "node-projects", "package-caches", "app-caches"],
  "deepScan": false
}
```

Response:

```json
{
  "jobId": "scan_01JXXX",
  "status": "queued"
}
```

### `GET /api/jobs/:jobId/events`

Server-Sent Events stream:

```text
event: progress
data: {"jobId":"scan_01JXXX","phase":"docker","percent":38,"message":"Inspecting reclaimable Docker data"}
```

```text
event: completed
data: {"jobId":"scan_01JXXX","summary":{"reclaimableBytes":12884901888,"items":46}}
```

### `GET /api/jobs/:jobId`

Response:

```json
{
  "jobId": "scan_01JXXX",
  "status": "completed",
  "summary": {
    "reclaimableBytes": 12884901888,
    "categoryCount": 4,
    "itemCount": 46
  },
  "categories": [
    {
      "id": "docker",
      "label": "Docker",
      "risk": "destructive",
      "reclaimableBytes": 8589934592,
      "items": [
        {
          "itemId": "item_docker_volumes",
          "label": "Unused volumes",
          "kind": "docker-volume",
          "risk": "destructive",
          "reclaimableBytes": 3221225472,
          "preview": {
            "type": "command",
            "command": ["docker", "volume", "prune", "--force"]
          }
        }
      ]
    }
  ]
}
```

### `POST /api/cleanup/plan`

Request:

```json
{
  "jobId": "scan_01JXXX",
  "itemIds": ["item_docker_volumes", "item_homebrew_cache"]
}
```

Response:

```json
{
  "jobId": "scan_01JXXX",
  "planId": "plan_01JYYY",
  "summary": {
    "itemCount": 2,
    "reclaimableBytes": 5368709120,
    "highestRisk": "destructive"
  },
  "actions": [
    {
      "id": "action_01",
      "mode": "vendor-command",
      "risk": "destructive",
      "description": "Prune unused Docker volumes",
      "preview": {
        "type": "command",
        "command": ["docker", "volume", "prune", "--force"]
      }
    }
  ]
}
```

### `POST /api/cleanup/execute`

Request:

```json
{
  "planId": "plan_01JYYY",
  "confirmation": "CLEAN_SELECTED_ITEMS"
}
```

Response:

```json
{
  "jobId": "cleanup_01JZZZ",
  "status": "queued"
}
```

## Analyzer Inventory

### V1

- `docker`
  - Inspect with `docker system df -v`.
  - Split into images, stopped containers, volumes, and build cache.
  - Cleanup uses tool-native prune commands.
- `homebrew`
  - Preview reclaimable data from Homebrew cache and stale downloads.
  - Cleanup uses `brew cleanup`.
- `node-projects`
  - Search configured project roots for `node_modules`, `.next`, `dist`, `build`, `coverage`, and Rust `target` folders.
  - Cleanup defaults to move-to-trash.
- `package-caches`
  - npm, pnpm, yarn, bun, Playwright, Puppeteer, pip, Poetry.
  - Prefer tool-native cleanup commands when available.
- `app-caches`
  - Opt-in scanning for selected apps under `~/Library/Caches`.
  - Warn when the app is still open.

### V1.1

- `xcode`
  - DerivedData
  - Archives
  - DeviceSupport
- `simulators`
  - Old simulator devices and unavailable runtimes
- `trash`
  - Empty Trash with a dedicated confirmation
- `downloads`
  - Analyze old DMGs, ZIPs, and installer packages
- `orbstack`
  - Inspect OrbStack data only if detected

## Risk Model

- `safe`
  - Rebuildable caches and generated artifacts
- `careful`
  - App caches and project folders that may affect local workflows
- `destructive`
  - Docker volumes, simulator devices, and any tool-native prune that deletes user-managed data

## UI Workflow

### Screen 1: Launch

- Explain what the app does.
- Show scan scope and selected analyzers.
- Primary action: `Analyze This Mac`.

### Screen 2: Live Analysis

- Stream progress with category-level messaging.
- Surface currently running analyzer.
- Show estimated reclaimable total as results arrive.

### Screen 3: Results

- Group results by category.
- Sort by reclaimable size.
- Allow item-level and category-level selection.
- Show risk badges and human-readable consequences.

### Screen 4: Cleanup Review

- Show exact commands or file actions before execution.
- Distinguish move-to-trash actions from permanent deletion.
- Require typed confirmation for destructive plans.

### Screen 5: Completion

- Show total reclaimed space.
- Show failures with direct remediation hints.
- Offer re-scan and exportable summary.

## Testing Strategy

- Unit tests for analyzer parsers and size formatting.
- Unit tests for command-runner validation and timeout behavior.
- Integration tests for scan and cleanup route contracts with mocked command output.
- UI tests for selection flow, risk badges, and cleanup confirmation.
- Playwright smoke test for analyze -> review -> confirm navigation.

## Migration Notes For This Repo

- Keep the current server running for now, but move it to `server/src` and TypeScript before adding new analyzers.
- Replace the current WebSocket-only progress path with SSE for one-way job updates.
- Replace path-based delete requests with job-bound `itemId` selections.
- Upgrade the current placeholder frontend into the planned dashboard before wiring real APIs.
