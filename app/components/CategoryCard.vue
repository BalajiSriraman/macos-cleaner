<script setup lang="ts">
import type { ScanCategory } from '~~/shared/cleaner'

const props = defineProps<{
  category: ScanCategory
  selectedIds: Set<string>
}>()

const emit = defineEmits<{
  toggleCategory: [category: ScanCategory]
  toggleItem: [itemId: string, checked: boolean]
}>()

const allSelected = computed(() => {
  return props.category.items.length > 0 && props.category.items.every((item) => props.selectedIds.has(item.id))
})

const accentClass = computed(() => {
  if (props.category.accent === 'ember') return 'from-black/8 to-transparent'
  if (props.category.accent === 'olive') return 'from-black/6 to-transparent'
  if (props.category.accent === 'slate') return 'from-black/10 to-transparent'
  return 'from-black/7 to-transparent'
})
</script>

<template>
  <article class="relative overflow-hidden rounded-[16px] border border-black/10 bg-panel-strong p-4 shadow-[0_1px_2px_rgba(17,17,17,0.04)]">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b" :class="accentClass" />

    <header class="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="flex flex-wrap items-center gap-3">
          <p class="section-label">{{ category.label }}</p>
          <RiskBadge :risk="category.risk" />
        </div>
        <div class="mt-3 flex flex-wrap items-end gap-4">
          <h3 class="font-display text-[1.7rem] font-semibold leading-none text-ink">{{ category.totalSizeFormatted }}</h3>
          <p class="text-sm font-medium text-muted">{{ category.items.length }} items</p>
        </div>
        <p class="mt-4 max-w-3xl text-sm leading-6 text-muted">{{ category.summary }}</p>
        <p v-if="category.warning" class="mt-2 text-sm leading-6 text-careful">{{ category.warning }}</p>
        <p v-if="category.note" class="mt-2 text-sm text-muted">{{ category.note }}</p>
      </div>

      <button
        class="action-button-secondary shrink-0"
        :disabled="category.items.length === 0"
        @click="emit('toggleCategory', category)"
      >
        {{ allSelected ? 'Clear Group' : 'Select Group' }}
      </button>
    </header>

    <div class="relative mt-6 grid gap-3">
      <div
        v-if="category.items.length === 0"
        class="rounded-[12px] border border-dashed border-black/10 bg-neutral-50 px-4 py-5 text-sm text-muted"
      >
        This analyzer found nothing actionable on this Mac right now.
      </div>

      <label
        v-for="item in category.items"
        :key="item.id"
        class="group grid gap-4 rounded-[12px] border border-black/10 bg-white p-4 transition hover:border-black/18 hover:bg-neutral-50 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-start"
      >
        <input
          type="checkbox"
          class="mt-1 size-4 accent-black"
          :checked="selectedIds.has(item.id)"
          @change="emit('toggleItem', item.id, ($event.target as HTMLInputElement).checked)"
        >
        <span class="grid gap-1.5">
          <strong class="text-[1.02rem] text-ink">{{ item.name }}</strong>
          <span class="text-sm leading-6 text-muted">{{ item.subtitle }}</span>
          <code class="w-fit">{{ item.path }}</code>
        </span>
        <span class="grid justify-items-start gap-2 lg:justify-items-end">
          <RiskBadge :risk="item.risk" />
          <strong class="text-lg text-ink-soft">{{ item.sizeFormatted }}</strong>
        </span>
      </label>
    </div>
  </article>
</template>
