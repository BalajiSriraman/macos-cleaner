import { createError, getRouterParam } from 'h3'
import { jobStore } from '../../utils/runtime-state'

export default defineEventHandler((event) => {
  const jobId = getRouterParam(event, 'jobId')

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'jobId is required'
    })
  }

  const job = jobStore.getJob(jobId)

  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Job not found'
    })
  }

  return job
})
