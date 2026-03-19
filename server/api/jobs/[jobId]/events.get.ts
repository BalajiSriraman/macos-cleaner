import { createError, getRouterParam, setHeader } from 'h3'
import { jobStore } from '../../../utils/runtime-state'

export default defineEventHandler(async (event) => {
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

  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')

  const res = event.node.res
  const req = event.node.req

  res.write(': connected\n\n')

  const writeSnapshot = (snapshot: unknown) => {
    res.write(`event: snapshot\n`)
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`)
  }

  return await new Promise<void>((resolve) => {
    const unsubscribe = jobStore.subscribe(jobId, writeSnapshot)
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n')
    }, 15_000)

    const cleanup = () => {
      clearInterval(keepAlive)
      unsubscribe()
      resolve()
    }

    req.on('close', cleanup)
    req.on('error', cleanup)
  })
})
