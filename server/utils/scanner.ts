import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import type { AnalyzerOption, Risk, ScanCategory, ScanItem, ScanResult } from '~~/shared/cleaner'
import { commandExists, runCommand } from './command'
import { getPathSize } from './fs'
import { formatBytes, parseHumanSize, toDisplayPath } from './format'

const DEFAULT_ANALYZERS = [
  'docker',
  'homebrew',
  'node-projects',
  'package-caches',
  'app-caches'
]

const DEFAULT_ROOT_SEGMENTS = ['Development', 'Projects', 'Code', 'dev', 'projects']

export interface ScannerOptions {
  roots?: string[]
  include?: string[]
}

export class Scanner {
  private home = homedir()
  private roots: string[]
  private include: string[]

  constructor(options: ScannerOptions = {}) {
    this.roots = this.resolveRoots(options.roots)
    this.include = Array.isArray(options.include) && options.include.length > 0
      ? options.include
      : DEFAULT_ANALYZERS
  }

  async scanAll(progressCallback?: (progress: { progress: number; message: string; phase: string }) => void) {
    const analyzers = [
      {
        id: 'docker',
        label: 'Inspecting Docker reclaimable data',
        run: () => this.scanDocker()
      },
      {
        id: 'homebrew',
        label: 'Inspecting Homebrew cleanup targets',
        run: () => this.scanHomebrew()
      },
      {
        id: 'node-projects',
        label: 'Walking configured project roots',
        run: () => this.scanProjectArtifacts()
      },
      {
        id: 'package-caches',
        label: 'Measuring package manager caches',
        run: () => this.scanPackageCaches()
      },
      {
        id: 'app-caches',
        label: 'Reviewing app cache candidates',
        run: () => this.scanAppCaches()
      }
    ].filter((entry) => this.include.includes(entry.id))

    const categories: ScanCategory[] = []

    for (let index = 0; index < analyzers.length; index += 1) {
      const analyzer = analyzers[index]!
      progressCallback?.({
        progress: Math.round((index / Math.max(analyzers.length, 1)) * 100),
        message: analyzer.label,
        phase: analyzer.id
      })

      categories.push(await analyzer.run())
    }

    const totalBytes = categories.reduce((sum, category) => sum + category.totalBytes, 0)
    const totalItems = categories.reduce((sum, category) => sum + category.items.length, 0)

    progressCallback?.({
      progress: 100,
      message: 'Analysis complete',
      phase: 'complete'
    })

    return {
      scannedAt: new Date().toISOString(),
      platform: process.platform,
      roots: this.roots,
      summary: {
        totalBytes,
        totalSizeFormatted: formatBytes(totalBytes),
        totalItems,
        totalCategories: categories.length
      },
      categories
    } satisfies Omit<ScanResult, 'jobId'>
  }

  private resolveRoots(inputRoots?: string[]) {
    const candidates = Array.isArray(inputRoots) && inputRoots.length > 0
      ? inputRoots
      : DEFAULT_ROOT_SEGMENTS.map((segment) => join(this.home, segment))

    return [...new Set(candidates.map((entry) => entry.trim()).filter(Boolean))]
  }

  private async scanDocker() {
    const available = await commandExists('docker')

    if (!available) {
      return this.createCategory({
        id: 'docker',
        label: 'Docker',
        summary: 'Images, stopped containers, volumes, and build cache.',
        risk: 'destructive',
        accent: 'ember',
        warning: 'Volume pruning removes persistent container data.',
        note: 'Docker CLI is not available on this Mac.',
        items: []
      })
    }

    const result = await runCommand('docker', ['system', 'df', '--format', '{{json .}}'], {
      allowFailure: true,
      timeoutMs: 20_000
    })

    if (result.code !== 0 || !result.stdout) {
      return this.createCategory({
        id: 'docker',
        label: 'Docker',
        summary: 'Images, stopped containers, volumes, and build cache.',
        risk: 'destructive',
        accent: 'ember',
        warning: 'Volume pruning removes persistent container data.',
        note: result.stderr || 'Docker is installed but reclaimable data could not be inspected.',
        items: []
      })
    }

    const commands: Record<string, string[]> = {
      Images: ['docker', 'image', 'prune', '--force'],
      Containers: ['docker', 'container', 'prune', '--force'],
      'Local Volumes': ['docker', 'volume', 'prune', '--force'],
      'Build Cache': ['docker', 'builder', 'prune', '--force']
    }

    const items = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const row = JSON.parse(line) as {
            Type?: string
            TotalCount?: string
            Active?: string
            Reclaimable?: string
          }

          const type = row.Type ?? ''
          const reclaimableBytes = parseHumanSize(row.Reclaimable)
          const command = commands[type]

          if (!command || reclaimableBytes <= 0) {
            return []
          }

          return [
            this.createItem({
              id: `docker-${slug(type)}`,
              name: type,
              subtitle: `${row.TotalCount ?? '0'} total, ${row.Active ?? '0'} active`,
              path: command.join(' '),
              sizeBytes: reclaimableBytes,
              risk: type === 'Local Volumes' ? 'destructive' : 'careful',
              mode: 'command',
              command
            })
          ]
        } catch {
          return []
        }
      })

    return this.createCategory({
      id: 'docker',
      label: 'Docker',
      summary: 'Images, stopped containers, volumes, and build cache.',
      risk: 'destructive',
      accent: 'ember',
      warning: 'Volume pruning removes persistent container data.',
      items
    })
  }

  private async scanHomebrew() {
    const cachePath = join(this.home, 'Library/Caches/Homebrew')
    const sizeBytes = await getPathSize(cachePath)
    const available = await commandExists('brew')
    const items: ScanItem[] = []

    if (sizeBytes > 0) {
      items.push(this.createItem({
        id: 'homebrew-cleanup',
        name: 'Homebrew downloads',
        subtitle: 'Cached bottles and downloads that can be removed with Homebrew cleanup',
        path: toDisplayPath(cachePath),
        sizeBytes,
        risk: 'safe',
        mode: available ? 'command' : 'trash',
        command: available ? ['brew', 'cleanup'] : null
      }))
    }

    return this.createCategory({
      id: 'homebrew',
      label: 'Homebrew',
      summary: 'Bottle downloads and cached package data managed by Homebrew.',
      risk: 'safe',
      accent: 'olive',
      note: available ? null : 'Homebrew CLI not found. Cleanup falls back to moving the cache path to Trash.',
      items
    })
  }

  private async scanProjectArtifacts() {
    const names = ['node_modules', 'dist', 'build', '.next', 'coverage', 'out', 'target']
    const matches: ScanItem[] = []

    for (const root of this.roots) {
      const result = await runCommand('find', [
        root,
        '-type',
        'd',
        '(',
        '-name',
        'node_modules',
        '-o',
        '-name',
        'dist',
        '-o',
        '-name',
        'build',
        '-o',
        '-name',
        '.next',
        '-o',
        '-name',
        'coverage',
        '-o',
        '-name',
        'out',
        '-o',
        '-name',
        'target',
        ')',
        '-prune',
        '-print'
      ], {
        allowFailure: true,
        timeoutMs: 20_000,
        maxBuffer: 1024 * 1024
      })

      if (result.code !== 0 || !result.stdout) {
        continue
      }

      const paths = result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 150)

      for (const targetPath of paths) {
        const folderName = basename(targetPath)
        if (!names.includes(folderName)) continue

        const sizeBytes = await getPathSize(targetPath)
        if (sizeBytes < 25 * 1024 * 1024) continue

        matches.push(this.createItem({
          id: `artifact-${slug(targetPath)}`,
          name: toDisplayPath(targetPath),
          subtitle: describeArtifact(folderName),
          path: toDisplayPath(targetPath),
          sizeBytes,
          risk: 'safe',
          mode: 'trash',
          command: null
        }))
      }
    }

    matches.sort((left, right) => right.sizeBytes - left.sizeBytes)

    return this.createCategory({
      id: 'node-projects',
      label: 'Project Artifacts',
      summary: 'Generated directories from configured project roots.',
      risk: 'safe',
      accent: 'teal',
      note: this.roots.length === 0 ? 'No project roots were configured for artifact scanning.' : null,
      items: matches.slice(0, 60)
    })
  }

  private async scanPackageCaches() {
    const pnpmAvailable = await commandExists('pnpm')
    const definitions = [
      {
        id: 'pnpm-store',
        name: 'pnpm store',
        subtitle: 'Prunable store content not referenced by active projects',
        path: join(this.home, 'Library/pnpm'),
        risk: 'safe' as Risk,
        mode: pnpmAvailable ? 'command' as const : 'trash' as const,
        command: pnpmAvailable ? ['pnpm', 'store', 'prune'] : null
      },
      {
        id: 'npm-cache',
        name: 'npm cache',
        subtitle: 'npm download cache stored in your home directory',
        path: join(this.home, '.npm'),
        risk: 'safe' as Risk,
        mode: 'trash' as const,
        command: null
      },
      {
        id: 'playwright-cache',
        name: 'Playwright browsers',
        subtitle: 'Downloaded browsers cached for local testing',
        path: join(this.home, 'Library/Caches/ms-playwright'),
        risk: 'safe' as Risk,
        mode: 'trash' as const,
        command: null
      },
      {
        id: 'puppeteer-cache',
        name: 'Puppeteer cache',
        subtitle: 'Downloaded browser builds and extracted artifacts',
        path: join(this.home, '.cache/puppeteer'),
        risk: 'safe' as Risk,
        mode: 'trash' as const,
        command: null
      },
      {
        id: 'pip-cache',
        name: 'pip cache',
        subtitle: 'Python wheel and package download cache',
        path: join(this.home, 'Library/Caches/pip'),
        risk: 'safe' as Risk,
        mode: 'trash' as const,
        command: null
      },
      {
        id: 'poetry-cache',
        name: 'Poetry cache',
        subtitle: 'Poetry-managed dependency and repository cache',
        path: join(this.home, 'Library/Caches/pypoetry'),
        risk: 'safe' as Risk,
        mode: 'trash' as const,
        command: null
      },
      {
        id: 'cargo-cache',
        name: 'Cargo registry',
        subtitle: 'Rust registry downloads and cached crate archives',
        path: join(this.home, '.cargo/registry'),
        risk: 'safe' as Risk,
        mode: 'trash' as const,
        command: null
      }
    ]

    const items: ScanItem[] = []

    for (const definition of definitions) {
      const sizeBytes = await getPathSize(definition.path)
      if (sizeBytes < 50 * 1024 * 1024) continue

      items.push(this.createItem({
        id: definition.id,
        name: definition.name,
        subtitle: definition.subtitle,
        path: toDisplayPath(definition.path),
        sizeBytes,
        risk: definition.risk,
        mode: definition.mode,
        command: definition.command
      }))
    }

    return this.createCategory({
      id: 'package-caches',
      label: 'Package Caches',
      summary: 'Tool-managed caches that can be recreated when needed.',
      risk: 'safe',
      accent: 'olive',
      items
    })
  }

  private async scanAppCaches() {
    const definitions = [
      {
        id: 'arc-cache',
        name: 'Arc cache',
        subtitle: 'Temporary browser cache data. Close Arc before cleanup.',
        path: join(this.home, 'Library/Caches/Arc')
      },
      {
        id: 'chrome-cache',
        name: 'Chrome cache',
        subtitle: 'Temporary cache and code cache files. Close Chrome before cleanup.',
        path: join(this.home, 'Library/Caches/Google')
      },
      {
        id: 'safari-cache',
        name: 'Safari cache',
        subtitle: 'Safari cache files. Close Safari before cleanup.',
        path: join(this.home, 'Library/Caches/com.apple.Safari')
      }
    ]

    const items: ScanItem[] = []

    for (const definition of definitions) {
      const sizeBytes = await getPathSize(definition.path)
      if (sizeBytes < 50 * 1024 * 1024) continue

      items.push(this.createItem({
        id: definition.id,
        name: definition.name,
        subtitle: definition.subtitle,
        path: toDisplayPath(definition.path),
        sizeBytes,
        risk: 'careful',
        mode: 'trash',
        command: null
      }))
    }

    return this.createCategory({
      id: 'app-caches',
      label: 'App Caches',
      summary: 'Selected app caches under Library/Caches.',
      risk: 'careful',
      accent: 'slate',
      warning: 'Close apps before cleaning their caches.',
      items
    })
  }

  private createItem(input: {
    id: string
    name: string
    subtitle: string
    path: string
    sizeBytes: number
    risk: Risk
    mode: ScanItem['mode']
    command: string[] | null
  }) {
    return {
      id: input.id,
      name: input.name,
      subtitle: input.subtitle,
      path: input.path,
      sizeBytes: input.sizeBytes,
      sizeFormatted: formatBytes(input.sizeBytes),
      risk: input.risk,
      mode: input.mode,
      command: input.command,
      commandPreview: input.command ? input.command.join(' ') : null
    } satisfies ScanItem
  }

  private createCategory(input: {
    id: string
    label: string
    summary: string
    risk: Risk
    accent: string
    warning?: string | null
    note?: string | null
    items: ScanItem[]
  }) {
    const items = [...input.items].sort((left, right) => right.sizeBytes - left.sizeBytes)
    const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0)

    return {
      id: input.id,
      label: input.label,
      summary: input.summary,
      risk: input.risk,
      accent: input.accent,
      warning: input.warning ?? null,
      note: input.note ?? null,
      totalBytes,
      totalSizeFormatted: formatBytes(totalBytes),
      items
    } satisfies ScanCategory
  }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function describeArtifact(folderName: string) {
  const descriptions: Record<string, string> = {
    node_modules: 'Dependencies that can be restored with the package manager',
    dist: 'Compiled output from a previous build',
    build: 'Generated build output from local projects',
    '.next': 'Next.js build output and caches',
    coverage: 'Generated test coverage reports',
    out: 'Static export or build output directory',
    target: 'Rust build artifacts and incremental compilation output'
  }

  return descriptions[folderName] ?? 'Generated project artifact'
}

export function getDefaultRoots() {
  const home = homedir()
  return DEFAULT_ROOT_SEGMENTS.map((segment) => join(home, segment))
}

export function getAvailableAnalyzers() {
  return [
    { id: 'docker', label: 'Docker', description: 'Images, containers, volumes, and build cache' },
    { id: 'homebrew', label: 'Homebrew', description: 'Bottle downloads and stale cache data' },
    { id: 'node-projects', label: 'Project Artifacts', description: 'node_modules, dist, build, .next, target' },
    { id: 'package-caches', label: 'Package Caches', description: 'pnpm, npm, Playwright, pip, Poetry, Cargo' },
    { id: 'app-caches', label: 'App Caches', description: 'Arc, Chrome, and Safari caches' }
  ] satisfies AnalyzerOption[]
}
