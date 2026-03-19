export type Risk = 'safe' | 'careful' | 'destructive'
export type ItemMode = 'trash' | 'command'
export type JobKind = 'scan' | 'cleanup'
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface AnalyzerOption {
  id: string
  label: string
  description: string
}

export interface ConfigPayload {
  platform: string
  defaultRoots: string[]
  availableAnalyzers: AnalyzerOption[]
}

export interface ScanItem {
  id: string
  name: string
  subtitle: string
  path: string
  sizeBytes: number
  sizeFormatted: string
  risk: Risk
  mode: ItemMode
  command: string[] | null
  commandPreview: string | null
}

export interface ScanCategory {
  id: string
  label: string
  summary: string
  risk: Risk
  accent: string
  warning: string | null
  note: string | null
  totalBytes: number
  totalSizeFormatted: string
  items: ScanItem[]
}

export interface ScanSummary {
  totalBytes: number
  totalSizeFormatted: string
  totalItems: number
  totalCategories: number
}

export interface ScanResult {
  jobId: string
  scannedAt: string
  platform: string
  roots: string[]
  summary: ScanSummary
  categories: ScanCategory[]
}

export interface CleanupAction {
  id: string
  categoryId: string
  label: string
  subtitle: string
  risk: Risk
  mode: ItemMode
  targetPath: string
  sourcePath: string
  command: string[] | null
  commandPreview: string | null
  sizeBytes: number
  sizeFormatted: string
}

export interface CleanupPlan {
  id: string
  scanJobId: string | null
  itemIds: string[]
  summary: {
    itemCount: number
    reclaimableBytes: number
    reclaimableSizeFormatted: string
    highestRisk: Risk
    requiresConfirmation: boolean
  }
  actions: CleanupAction[]
}

export interface CleanupResult {
  summary: string
  estimatedBytesFreed: number
  estimatedSizeFreed: string
  totalItems: number
  deleted: Array<{
    label: string
    mode: ItemMode
    target: string | null
    estimatedBytes: number
  }>
  failed: Array<{
    label: string
    mode: ItemMode
    target: string
    error: string
  }>
}

export interface JobSnapshot<T = unknown> {
  id: string
  kind: JobKind
  status: JobStatus
  progress: number
  message: string
  createdAt: string
  updatedAt: string
  phase?: string | null
  planId?: string | null
  error?: string | null
  result?: T | null
}
