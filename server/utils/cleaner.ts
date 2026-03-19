import type { CleanupPlan, CleanupResult, ScanResult } from '~~/shared/cleaner'
import { createId, formatBytes, highestRisk } from './format'
import { moveToTrash, pathExists } from './fs'
import { runCommand } from './command'

export class Cleaner {
  createPlan(scanResult: ScanResult, itemIds: string[]) {
    const selectedItems = scanResult.categories
      .flatMap((category) => category.items.map((item) => ({ category, item })))
      .filter((entry) => itemIds.includes(entry.item.id))

    if (selectedItems.length === 0) {
      throw new Error('No valid cleanup items were selected.')
    }

    const actions = selectedItems.map(({ category, item }) => ({
      id: createId('action'),
      categoryId: category.id,
      label: item.name,
      subtitle: item.subtitle,
      risk: item.risk,
      mode: item.mode,
      targetPath: item.path,
      sourcePath: item.path.startsWith('~') ? item.path.replace('~', process.env.HOME ?? '') : item.path,
      command: item.command ?? null,
      commandPreview: item.commandPreview ?? null,
      sizeBytes: item.sizeBytes,
      sizeFormatted: item.sizeFormatted
    }))

    const reclaimableBytes = actions.reduce((sum, action) => sum + action.sizeBytes, 0)
    const risk = highestRisk(actions.map((action) => action.risk))

    return {
      id: createId('plan'),
      scanJobId: scanResult.jobId ?? null,
      itemIds: [...new Set(itemIds)],
      summary: {
        itemCount: actions.length,
        reclaimableBytes,
        reclaimableSizeFormatted: formatBytes(reclaimableBytes),
        highestRisk: risk,
        requiresConfirmation: risk === 'destructive'
      },
      actions
    } satisfies CleanupPlan
  }

  async executePlan(
    plan: CleanupPlan,
    progressCallback?: (progress: { progress: number; message: string; current: number; total: number }) => void
  ) {
    const results: CleanupResult = {
      deleted: [],
      failed: [],
      estimatedBytesFreed: 0,
      estimatedSizeFreed: '0 B',
      totalItems: plan.actions.length,
      summary: ''
    }

    for (let index = 0; index < plan.actions.length; index += 1) {
      const action = plan.actions[index]!
      const progress = Math.round((index / Math.max(plan.actions.length, 1)) * 100)

      progressCallback?.({
        progress,
        message: `Running ${action.label}`,
        current: index + 1,
        total: plan.actions.length
      })

      try {
        if (action.mode === 'command' && action.command) {
          const [command, ...args] = action.command

          if (!command) {
            throw new Error('Cleanup command is missing')
          }

          await runCommand(command, args, {
            timeoutMs: 5 * 60_000
          })

          results.deleted.push({
            label: action.label,
            mode: action.mode,
            target: action.commandPreview,
            estimatedBytes: action.sizeBytes
          })
          results.estimatedBytesFreed += action.sizeBytes
          continue
        }

        const exists = await pathExists(action.sourcePath)
        if (!exists) {
          throw new Error('Path no longer exists')
        }

        const trashedPath = await moveToTrash(action.sourcePath)
        results.deleted.push({
          label: action.label,
          mode: action.mode,
          target: trashedPath,
          estimatedBytes: action.sizeBytes
        })
        results.estimatedBytesFreed += action.sizeBytes
      } catch (error) {
        results.failed.push({
          label: action.label,
          mode: action.mode,
          target: action.commandPreview ?? action.targetPath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    results.estimatedSizeFreed = formatBytes(results.estimatedBytesFreed)
    results.summary = `${results.deleted.length} actions completed, ${results.failed.length} failed`

    progressCallback?.({
      progress: 100,
      message: 'Cleanup complete',
      current: plan.actions.length,
      total: plan.actions.length
    })

    return results
  }
}
