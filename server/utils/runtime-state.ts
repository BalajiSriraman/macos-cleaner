import { Cleaner } from './cleaner'
import { JobStore } from './job-store'

const globalState = globalThis as typeof globalThis & {
  __macosCleanerJobStore?: JobStore
  __macosCleanerCleaner?: Cleaner
}

export const jobStore = globalState.__macosCleanerJobStore ??= new JobStore()
export const cleaner = globalState.__macosCleanerCleaner ??= new Cleaner()
