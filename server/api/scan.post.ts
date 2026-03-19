import { readBody } from 'h3'
import { Scanner } from '../utils/scanner'
import { jobStore } from '../utils/runtime-state'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ roots?: string[]; include?: string[] }>(event)

  const job = jobStore.createJob('scan', {
    status: 'queued',
    progress: 0,
    message: 'Queued for analysis',
    result: null
  })

  queueMicrotask(async () => {
    jobStore.updateJob(job.id, {
      status: 'running',
      progress: 0,
      message: 'Starting analysis'
    })

    try {
      const scanner = new Scanner({
        roots: Array.isArray(body?.roots) ? body.roots : undefined,
        include: Array.isArray(body?.include) ? body.include : undefined
      })

      const results = await scanner.scanAll((progress) => {
        jobStore.updateJob(job.id, {
          status: 'running',
          progress: progress.progress,
          message: progress.message,
          phase: progress.phase
        })
      })

      jobStore.completeJob(job.id, {
        ...results,
        jobId: job.id
      })
    } catch (error) {
      jobStore.failJob(job.id, error)
    }
  })

  return {
    jobId: job.id,
    status: job.status
  }
})
