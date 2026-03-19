import type { CleanupPlan, JobKind, JobSnapshot } from '~~/shared/cleaner'
import { createId } from './format'

type Listener = (snapshot: JobSnapshot) => void

export class JobStore {
  private jobs = new Map<string, JobSnapshot>()
  private plans = new Map<string, CleanupPlan>()
  private listeners = new Map<string, Set<Listener>>()

  createJob(kind: JobKind, initial: Partial<JobSnapshot> = {}) {
    const job: JobSnapshot = {
      id: createId(kind),
      kind,
      status: 'queued',
      progress: 0,
      message: 'Queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...initial
    }

    this.jobs.set(job.id, job)
    return job
  }

  updateJob(id: string, patch: Partial<JobSnapshot>) {
    const current = this.jobs.get(id)
    if (!current) return null

    const next: JobSnapshot = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    }

    this.jobs.set(id, next)
    this.emit(id, next)
    return next
  }

  completeJob(id: string, result: JobSnapshot['result']) {
    return this.updateJob(id, {
      status: 'completed',
      progress: 100,
      result,
      error: null
    })
  }

  failJob(id: string, error: unknown) {
    return this.updateJob(id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    })
  }

  getJob(id: string) {
    return this.jobs.get(id) ?? null
  }

  savePlan(plan: CleanupPlan) {
    this.plans.set(plan.id, plan)
    return plan
  }

  getPlan(id: string) {
    return this.plans.get(id) ?? null
  }

  subscribe(jobId: string, listener: Listener) {
    const listeners = this.listeners.get(jobId) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(jobId, listeners)

    const current = this.jobs.get(jobId)
    if (current) {
      listener(current)
    }

    return () => {
      const currentListeners = this.listeners.get(jobId)
      if (!currentListeners) return

      currentListeners.delete(listener)
      if (currentListeners.size === 0) {
        this.listeners.delete(jobId)
      }
    }
  }

  private emit(jobId: string, payload: JobSnapshot) {
    const listeners = this.listeners.get(jobId)
    if (!listeners) return

    listeners.forEach((listener) => listener(payload))
  }
}
