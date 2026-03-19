import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'

export function createId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const decimals = size >= 10 || unitIndex === 0 ? 0 : 1
  return `${size.toFixed(decimals)} ${units[unitIndex]}`
}

export function parseHumanSize(value: string | undefined | null) {
  if (!value) return 0

  const normalized = value.trim().split(' ')[0]?.replace(/,/g, '')
  if (!normalized) return 0

  const match = normalized.match(/^([\d.]+)\s*([KMGT]?B)$/i)

  if (!match) return 0

  const rawAmount = match[1]
  const rawUnit = match[2]

  if (!rawAmount || !rawUnit) return 0

  const amount = Number.parseFloat(rawAmount)
  const unit = rawUnit.toUpperCase()
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4
  }
  const multiplier = multipliers[unit]

  if (!multiplier) return 0

  return Number.isFinite(amount) ? Math.round(amount * multiplier) : 0
}

export function highestRisk(values: Array<'safe' | 'careful' | 'destructive'>) {
  if (values.includes('destructive')) return 'destructive'
  if (values.includes('careful')) return 'careful'
  return 'safe'
}

export function toDisplayPath(targetPath: string) {
  const home = homedir()
  return targetPath.startsWith(home) ? targetPath.replace(home, '~') : targetPath
}
