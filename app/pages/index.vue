<script setup lang="ts">
import type {
  CleanupPlan,
  CleanupResult,
  ConfigPayload,
  JobSnapshot,
  Risk,
  ScanCategory,
  ScanResult
} from '~~/shared/cleaner'

useSeoMeta({
  title: 'macOS Cleaner',
  description: 'Analyze reclaimable macOS storage and clean it from one Nuxt 4 application.'
})

const { data: configData, error: configError } = await useFetch<ConfigPayload>('/api/config')

const phase = ref<'idle' | 'scanning' | 'results' | 'confirm' | 'cleaning' | 'complete'>('idle')
const scanJob = ref<JobSnapshot<ScanResult> | null>(null)
const cleanupJob = ref<JobSnapshot<CleanupResult> | null>(null)
const plan = ref<CleanupPlan | null>(null)
const selectedIds = ref<string[]>([])
const confirmation = ref('')
const errorMessage = ref('')
const scanStream = shallowRef<EventSource | null>(null)
const cleanupStream = shallowRef<EventSource | null>(null)

const config = computed(() => {
  return configData.value ?? {
    platform: 'darwin',
    defaultRoots: [],
    availableAnalyzers: []
  }
})

const scanResult = computed(() => {
  return scanJob.value?.status === 'completed' ? scanJob.value.result ?? null : null
})

const cleanupResult = computed(() => {
  return cleanupJob.value?.status === 'completed' ? cleanupJob.value.result ?? null : null
})

const selectedIdSet = computed(() => new Set(selectedIds.value))

const selectedEntries = computed(() => {
  return (scanResult.value?.categories ?? []).flatMap((category) =>
    category.items
      .filter((item) => selectedIdSet.value.has(item.id))
      .map((item) => ({ category, item }))
  )
})

const selectedBytes = computed(() => {
  return selectedEntries.value.reduce((sum, entry) => sum + entry.item.sizeBytes, 0)
})

const selectedRisk = computed<Risk>(() => {
  const risks = selectedEntries.value.map((entry) => entry.item.risk)
  if (risks.includes('destructive')) return 'destructive'
  if (risks.includes('careful')) return 'careful'
  return 'safe'
})

const phaseBadge = computed(() => {
  if (phase.value === 'scanning') return scanJob.value?.status?.toUpperCase() ?? 'RUNNING'
  if (phase.value === 'cleaning') return cleanupJob.value?.status?.toUpperCase() ?? 'RUNNING'
  if (phase.value === 'complete') return 'COMPLETED'
  if (phase.value === 'confirm') return 'READY'
  if (phase.value === 'results') return 'ANALYZED'
  return 'IDLE'
})

const currentProgress = computed(() => {
  if (phase.value === 'scanning') return scanJob.value?.progress ?? 0
  if (phase.value === 'cleaning') return cleanupJob.value?.progress ?? 0
  if (phase.value === 'complete') return 100
  return 0
})

const currentMessage = computed(() => {
  if (phase.value === 'scanning') return scanJob.value?.message ?? 'Preparing analysis'
  if (phase.value === 'cleaning') return cleanupJob.value?.message ?? 'Preparing cleanup'
  if (phase.value === 'complete') return cleanupResult.value?.summary ?? 'Cleanup completed'
  if (phase.value === 'confirm') return 'Review the cleanup plan before running any actions.'
  if (phase.value === 'results') return 'Analysis completed. Select the items you want to clean.'
  return 'Choose what to analyze, then start a targeted scan.'
})

const currentPhaseLabel = computed(() => {
  if (phase.value === 'scanning') return scanJob.value?.phase ?? 'Queued'
  if (phase.value === 'cleaning') return cleanupJob.value?.message ?? 'Queued'
  if (phase.value === 'complete') return 'Done'
  return 'Waiting'
})

const canReviewPlan = computed(() => {
  return Boolean(scanResult.value) && selectedIds.value.length > 0 && phase.value !== 'scanning' && phase.value !== 'cleaning'
})

const canExecuteCleanup = computed(() => {
  if (!plan.value || phase.value === 'cleaning') return false
  if (!plan.value.summary.requiresConfirmation) return true
  return confirmation.value === 'CLEAN_SELECTED_ITEMS'
})

function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const decimals = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(decimals)} ${units[unitIndex]}`
}

function closeStream(stream: typeof scanStream | typeof cleanupStream) {
  stream.value?.close()
  stream.value = null
}

function subscribeToJob<T>(jobId: string, streamRef: typeof scanStream | typeof cleanupStream, onSnapshot: (snapshot: JobSnapshot<T>) => void) {
  if (!import.meta.client) return

  closeStream(streamRef)
  const stream = new EventSource(`/api/jobs/${jobId}/events`)
  streamRef.value = stream

  stream.addEventListener('snapshot', (event) => {
    const snapshot = JSON.parse((event as MessageEvent).data) as JobSnapshot<T>
    onSnapshot(snapshot)

    if (snapshot.status === 'completed' || snapshot.status === 'failed') {
      closeStream(streamRef)
    }
  })

  stream.onerror = () => {
    stream.close()
    if (streamRef.value === stream) {
      streamRef.value = null
    }
  }
}

async function runAnalysis() {
  errorMessage.value = ''
  phase.value = 'scanning'
  plan.value = null
  cleanupJob.value = null
  confirmation.value = ''
  selectedIds.value = []

  try {
    const payload = await $fetch<{ jobId: string; status: string }>('/api/scan', {
      method: 'POST',
      body: {
        roots: config.value.defaultRoots,
        include: config.value.availableAnalyzers.map((entry) => entry.id)
      }
    })

    subscribeToJob<ScanResult>(payload.jobId, scanStream, (snapshot) => {
      scanJob.value = snapshot

      if (snapshot.status === 'completed' && snapshot.result) {
        phase.value = 'results'
        selectedIds.value = snapshot.result.categories.flatMap((category) => category.items.slice(0, 1).map((item) => item.id))
      } else if (snapshot.status === 'failed') {
        errorMessage.value = snapshot.error ?? 'Analysis failed'
        phase.value = 'idle'
      }
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not start analysis.'
    phase.value = 'idle'
  }
}

async function buildPlan() {
  if (!scanJob.value || selectedIds.value.length === 0) return

  errorMessage.value = ''

  try {
    plan.value = await $fetch<CleanupPlan>('/api/cleanup/plan', {
      method: 'POST',
      body: {
        jobId: scanJob.value.id,
        itemIds: selectedIds.value
      }
    })
    phase.value = 'confirm'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not prepare cleanup plan.'
  }
}

async function executeCleanup() {
  if (!plan.value) return

  errorMessage.value = ''
  phase.value = 'cleaning'

  try {
    const payload = await $fetch<{ jobId: string; status: string }>('/api/cleanup/execute', {
      method: 'POST',
      body: {
        planId: plan.value.id,
        confirmation: confirmation.value
      }
    })

    subscribeToJob<CleanupResult>(payload.jobId, cleanupStream, (snapshot) => {
      cleanupJob.value = snapshot

      if (snapshot.status === 'completed') {
        phase.value = 'complete'
      } else if (snapshot.status === 'failed') {
        errorMessage.value = snapshot.error ?? 'Cleanup failed'
        phase.value = 'confirm'
      }
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not start cleanup.'
    phase.value = 'confirm'
  }
}

function toggleItem(itemId: string, checked: boolean) {
  selectedIds.value = checked
    ? [...new Set([...selectedIds.value, itemId])]
    : selectedIds.value.filter((value) => value !== itemId)

  plan.value = null
}

function toggleCategory(category: ScanCategory) {
  const allSelected = category.items.length > 0 && category.items.every((item) => selectedIdSet.value.has(item.id))

  if (allSelected) {
    const blocked = new Set(category.items.map((item) => item.id))
    selectedIds.value = selectedIds.value.filter((value) => !blocked.has(value))
  } else {
    selectedIds.value = [...new Set([...selectedIds.value, ...category.items.map((item) => item.id)])]
  }

  plan.value = null
}

onBeforeUnmount(() => {
  closeStream(scanStream)
  closeStream(cleanupStream)
})
</script>

<template>
  <div class="min-h-screen">
    <div class="mx-auto max-w-[110rem] px-4 py-4 sm:px-6 lg:px-8">
      <div class="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside class="glass-panel h-fit p-4 xl:sticky xl:top-4">
          <div class="border-b border-black/8 pb-4">
            <p class="section-label">Local utility</p>
            <div class="mt-2 flex items-center justify-between gap-3">
              <h1 class="text-lg font-semibold tracking-tight text-ink">macOS Cleaner</h1>
              <span class="muted-pill">{{ config.platform }}</span>
            </div>
            <p class="mt-2 text-sm leading-6 text-muted">Local storage analysis and cleanup.</p>
          </div>

          <div class="mt-4 grid gap-3">
            <button class="action-button-primary w-full" :disabled="phase === 'scanning' || phase === 'cleaning'" @click="runAnalysis">
              {{ phase === 'idle' ? 'Run Analysis' : 'Run Again' }}
            </button>
            <button class="action-button-secondary w-full" :disabled="!canReviewPlan" @click="buildPlan">
              {{ plan ? 'Refresh Plan' : 'Build Plan' }}
            </button>
            <button class="action-button-secondary w-full" :disabled="!canExecuteCleanup" @click="executeCleanup">
              {{ phase === 'cleaning' ? 'Running Cleanup' : 'Execute Cleanup' }}
            </button>
          </div>

          <div class="sidebar-card mt-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="section-label">Current state</p>
                <div class="mt-2 flex items-center gap-3">
                  <ActivitySpinner v-if="phase === 'scanning' || phase === 'cleaning'" :size="24" :stroke="3" />
                  <p class="text-lg font-semibold text-ink">{{ phaseBadge }}</p>
                </div>
              </div>
              <RiskBadge :risk="plan?.summary.highestRisk ?? selectedRisk" />
            </div>
            <div class="mt-4 h-2 overflow-hidden rounded-sm bg-black/8">
              <div
                class="h-full rounded-sm bg-black transition-all duration-300"
                :style="{ width: `${currentProgress}%` }"
              />
            </div>
            <p class="mt-3 text-sm text-muted">{{ currentMessage }}</p>
          </div>

          <div class="sidebar-card mt-4">
            <p class="section-label">Scope</p>
            <div class="mt-3 grid gap-2 text-sm text-muted">
              <div class="flex items-center justify-between gap-3">
                <span>Roots</span>
                <strong class="text-ink">{{ config.defaultRoots.length }}</strong>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span>Analyzers</span>
                <strong class="text-ink">{{ config.availableAnalyzers.length }}</strong>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span>Selected</span>
                <strong class="text-ink">{{ plan?.summary.itemCount ?? selectedIds.length }}</strong>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span>Plan size</span>
                <strong class="text-ink">{{ plan?.summary.reclaimableSizeFormatted ?? formatBytes(selectedBytes) }}</strong>
              </div>
            </div>
          </div>
        </aside>

        <main class="grid gap-4">
          <section class="glass-panel p-4">
            <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p class="section-label">Workspace</p>
                <h2 class="mt-1 text-[1.1rem] font-semibold tracking-tight text-ink">Developer view</h2>
              </div>
              <div class="grid gap-2 sm:grid-cols-4 xl:min-w-[34rem]">
                <div class="metric-panel">
                  <p class="section-label">Reclaimable</p>
                  <p class="mt-1 text-[1.05rem] font-semibold text-ink">{{ scanResult?.summary.totalSizeFormatted ?? 'Pending' }}</p>
                </div>
                <div class="metric-panel">
                  <p class="section-label">Selected</p>
                  <p class="mt-1 text-[1.05rem] font-semibold text-ink">{{ plan?.summary.itemCount ?? selectedIds.length }}</p>
                </div>
                <div class="metric-panel">
                  <p class="section-label">Roots</p>
                  <p class="mt-1 text-[1.05rem] font-semibold text-ink">{{ config.defaultRoots.length }}</p>
                </div>
                <div class="metric-panel">
                  <p class="section-label">Analyzers</p>
                  <p class="mt-1 text-[1.05rem] font-semibold text-ink">{{ config.availableAnalyzers.length }}</p>
                </div>
              </div>
            </div>
          </section>

          <JobProgressPanel
            :title="phase === 'cleaning' ? 'Cleanup execution' : 'Mac analysis'"
            :badge="phaseBadge"
            :message="configError ? 'Configuration could not be loaded.' : currentMessage"
            :progress="currentProgress"
            :phase="currentPhaseLabel"
            :platform="config.platform"
            :analyzers="config.availableAnalyzers"
            :active="phase === 'scanning' || phase === 'cleaning'"
            :error-message="errorMessage || (configError?.message ?? '')"
          />

          <section class="grid gap-4 2xl:grid-cols-[minmax(0,1.45fr)_380px]">
            <div class="glass-panel p-6">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="section-label">Scan results</p>
                  <h2 class="mt-2 text-[1.35rem] font-semibold tracking-tight text-ink">Review reclaimable categories</h2>
                </div>
                <span class="muted-pill">{{ scanResult?.summary.totalCategories ?? 0 }} categories</span>
              </div>

              <div v-if="scanResult" class="mt-6 grid gap-4">
                <CategoryCard
                  v-for="category in scanResult.categories"
                  :key="category.id"
                  :category="category"
                  :selected-ids="selectedIdSet"
                  @toggle-category="toggleCategory"
                  @toggle-item="toggleItem"
                />
              </div>

              <div
                v-else
                class="mt-6 rounded-[12px] border border-dashed border-black/10 bg-neutral-50 p-6 text-sm leading-6 text-muted"
              >
                Scan results will appear here after analysis. Then you can select items and generate a
                trusted cleanup plan from those ids.
              </div>
            </div>

            <aside class="glass-panel h-fit p-6 2xl:sticky 2xl:top-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="section-label">Cleanup plan</p>
                  <h2 class="mt-2 text-[1.35rem] font-semibold tracking-tight text-ink">Confirm before execution</h2>
                </div>
                <RiskBadge :risk="plan?.summary.highestRisk ?? selectedRisk" />
              </div>

              <div class="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                <div class="metric-panel">
                  <p class="section-label">Selected items</p>
                  <p class="mt-2 text-[1.35rem] font-semibold text-ink">{{ plan?.summary.itemCount ?? selectedIds.length }}</p>
                </div>
                <div class="metric-panel">
                  <p class="section-label">Estimated reclaimable</p>
                  <p class="mt-2 text-[1.35rem] font-semibold text-ink">
                    {{ plan?.summary.reclaimableSizeFormatted ?? formatBytes(selectedBytes) }}
                  </p>
                </div>
              </div>

              <div class="mt-4 rounded-[12px] border border-black/10 bg-neutral-50 p-4">
                <h3 class="text-lg font-semibold text-ink">Planned actions</h3>
                <ul v-if="plan" class="mt-4 grid gap-3">
                  <li
                    v-for="action in plan.actions"
                    :key="action.id"
                    class="flex items-start justify-between gap-4 rounded-[10px] border border-black/8 bg-white px-3 py-3 text-sm"
                  >
                    <div>
                      <p class="font-semibold text-ink">{{ action.label }}</p>
                      <p class="text-muted">{{ action.mode === 'command' ? 'Run vendor command' : 'Move to Trash' }}</p>
                    </div>
                    <span class="font-semibold text-ink">{{ action.sizeFormatted }}</span>
                  </li>
                </ul>
                <p v-else class="mt-3 text-sm text-muted">
                  Select items from the results, then generate a cleanup plan.
                </p>
              </div>

              <div class="mt-4 rounded-[12px] border border-black/10 bg-neutral-50 p-4">
                <h3 class="text-lg font-semibold text-ink">Command preview</h3>
                <div v-if="plan && plan.actions.some((entry) => entry.commandPreview)" class="mt-4 grid gap-2">
                  <code
                    v-for="action in plan.actions.filter((entry) => entry.commandPreview)"
                    :key="action.id"
                    class="block w-full overflow-x-auto"
                  >
                    {{ action.commandPreview }}
                  </code>
                </div>
                <p v-else class="mt-3 text-sm text-muted">
                  No command actions in the current plan.
                </p>
              </div>

              <div
                v-if="plan?.summary.requiresConfirmation"
                class="mt-4 rounded-[10px] border border-black bg-black p-4 text-white"
              >
                <h3 class="text-lg font-semibold">Destructive confirmation</h3>
                <p class="mt-2 text-sm text-white/70">
                  Type <code class="border-white/10 bg-white/8 text-white">CLEAN_SELECTED_ITEMS</code> to continue with actions that may remove persistent data.
                </p>
                <input
                  v-model="confirmation"
                  class="mt-4 w-full rounded-[10px] border border-white/10 bg-white/8 px-4 py-3 text-sm text-white outline-none ring-0 placeholder:text-white/30"
                  placeholder="CLEAN_SELECTED_ITEMS"
                >
              </div>

              <div class="mt-5 flex flex-wrap gap-3">
                <button class="action-button-secondary" :disabled="!canReviewPlan" @click="buildPlan">
                  {{ plan ? 'Refresh Plan' : 'Build Plan' }}
                </button>
                <button class="action-button-primary" :disabled="!canExecuteCleanup" @click="executeCleanup">
                  {{ phase === 'cleaning' ? 'Running Cleanup' : 'Execute Cleanup' }}
                </button>
              </div>
            </aside>
          </section>

          <section
            v-if="cleanupResult"
            class="glass-panel p-6"
          >
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="section-label">Cleanup summary</p>
                <h2 class="mt-2 text-[1.35rem] font-semibold tracking-tight text-ink">Execution results</h2>
              </div>
              <span class="muted-pill">Job complete</span>
            </div>

            <div class="mt-5 grid gap-3 md:grid-cols-3">
              <div class="metric-panel">
                <p class="section-label">Estimated reclaimed</p>
                <p class="mt-2 text-[1.35rem] font-semibold text-ink">{{ cleanupResult.estimatedSizeFreed }}</p>
              </div>
              <div class="metric-panel">
                <p class="section-label">Completed actions</p>
                <p class="mt-2 text-[1.35rem] font-semibold text-ink">{{ cleanupResult.deleted.length }}</p>
              </div>
              <div class="metric-panel">
                <p class="section-label">Failed actions</p>
                <p class="mt-2 text-[1.35rem] font-semibold text-ink">{{ cleanupResult.failed.length }}</p>
              </div>
            </div>

            <div class="mt-5 grid gap-4 lg:grid-cols-2">
              <div class="rounded-[12px] border border-black/10 bg-neutral-50 p-4">
                <h3 class="text-lg font-semibold text-ink">Completed</h3>
                <ul class="mt-4 grid gap-3">
                  <li
                    v-for="entry in cleanupResult.deleted"
                    :key="`${entry.label}-${entry.target}`"
                    class="flex items-start justify-between gap-4 rounded-[10px] border border-black/8 bg-white px-3 py-3 text-sm"
                  >
                    <strong class="text-ink">{{ entry.label }}</strong>
                    <span class="text-muted">{{ entry.target }}</span>
                  </li>
                </ul>
              </div>

              <div class="rounded-[12px] border border-black/10 bg-neutral-50 p-4">
                <h3 class="text-lg font-semibold text-ink">Failures</h3>
                <ul v-if="cleanupResult.failed.length" class="mt-4 grid gap-3">
                  <li
                    v-for="entry in cleanupResult.failed"
                    :key="`${entry.label}-${entry.target}`"
                    class="grid gap-1 rounded-[10px] border border-black/8 bg-white px-3 py-3 text-sm"
                  >
                    <strong class="text-ink">{{ entry.label }}</strong>
                    <span class="text-muted">{{ entry.error }}</span>
                  </li>
                </ul>
                <p v-else class="mt-3 text-sm text-muted">No failures were reported for this cleanup job.</p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  </div>
</template>
