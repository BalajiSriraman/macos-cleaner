import { createError, readBody } from 'h3'
import { cleaner, jobStore } from '../../utils/runtime-state'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ planId?: string; confirmation?: string }>(event)

  if (typeof body?.planId !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'planId is required'
    })
  }

  const plan = jobStore.getPlan(body.planId)

  if (!plan) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Cleanup plan not found'
    })
  }

  if (plan.summary.requiresConfirmation && body.confirmation !== 'CLEAN_SELECTED_ITEMS') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Confirmation text is required for destructive cleanup plans'
    })
  }

  const job = jobStore.createJob('cleanup', {
    status: 'queued',
    progress: 0,
    message: 'Queued for cleanup',
    planId: plan.id
  })

  queueMicrotask(async () => {
    jobStore.updateJob(job.id, {
      status: 'running',
      progress: 0,
      message: 'Starting cleanup'
    })

    try {
      const result = await cleaner.executePlan(plan, (progress) => {
        jobStore.updateJob(job.id, {
          status: 'running',
          progress: progress.progress,
          message: progress.message
        })
      })

      jobStore.completeJob(job.id, result)
    } catch (error) {
      jobStore.failJob(job.id, error)
    }
  })

  return {
    jobId: job.id,
    status: job.status
  }
})
