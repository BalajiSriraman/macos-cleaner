import { createError, readBody } from 'h3'
import type { ScanResult } from '~~/shared/cleaner'
import { cleaner, jobStore } from '../../utils/runtime-state'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ jobId?: string; itemIds?: string[] }>(event)

  if (typeof body?.jobId !== 'string' || !Array.isArray(body.itemIds)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'jobId and itemIds are required'
    })
  }

  const job = jobStore.getJob(body.jobId)

  if (!job || job.kind !== 'scan' || job.status !== 'completed' || !job.result) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A completed scan job is required'
    })
  }

  try {
    const plan = cleaner.createPlan(
      job.result as ScanResult,
      body.itemIds.filter((value): value is string => typeof value === 'string')
    )
    jobStore.savePlan(plan)
    return plan
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : String(error)
    })
  }
})
