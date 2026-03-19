<script setup lang="ts">
defineProps<{
  title: string
  badge: string
  message: string
  progress: number
  phase: string
  platform: string
  analyzers: Array<{ id: string; label: string; description: string }>
  errorMessage?: string
  active?: boolean
}>()
</script>

<template>
  <section class="glass-panel p-4">
    <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <p class="section-label">Current job</p>
          <span class="muted-pill">{{ badge }}</span>
        </div>
        <div class="mt-2 flex items-center gap-3">
          <ActivitySpinner v-if="active" :size="24" :stroke="3" />
          <h2 class="font-display text-[1.25rem] font-semibold leading-none text-ink">{{ title }}</h2>
        </div>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {{ message }}
        </p>
      </div>

      <div class="grid gap-2 sm:grid-cols-4 xl:min-w-[26rem]">
        <div class="metric-panel">
          <p class="section-label">Progress</p>
          <p class="mt-1 text-[1.05rem] font-semibold text-ink">{{ progress }}%</p>
        </div>
        <div class="metric-panel">
          <p class="section-label">Phase</p>
          <p class="mt-1 text-[1.05rem] font-semibold text-ink">{{ phase }}</p>
        </div>
        <div class="metric-panel">
          <p class="section-label">Platform</p>
          <p class="mt-1 text-[1.05rem] font-semibold text-ink">{{ platform }}</p>
        </div>
        <div class="metric-panel">
          <p class="section-label">Analyzers</p>
          <p class="mt-1 text-[1.05rem] font-semibold text-ink">{{ analyzers.length }}</p>
        </div>
      </div>
    </div>

    <div class="mt-4 h-2 overflow-hidden rounded-sm bg-black/8">
      <div
        class="h-full rounded-sm bg-black transition-all duration-300"
        :style="{ width: `${progress}%` }"
      />
    </div>

    <div
      v-if="errorMessage"
      class="mt-4 rounded-[10px] border border-black bg-black px-4 py-3 text-sm text-white"
    >
      {{ errorMessage }}
    </div>
  </section>
</template>
