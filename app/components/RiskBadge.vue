<script setup lang="ts">
import type { Risk } from '~~/shared/cleaner'

const props = defineProps<{
  risk: Risk
}>()

const label = computed(() => {
  if (props.risk === 'safe') return 'Safe'
  if (props.risk === 'careful') return 'Careful'
  return 'Destructive'
})

const classes = computed(() => {
  if (props.risk === 'safe') return 'border-black/10 bg-white text-neutral-500'
  if (props.risk === 'careful') return 'border-black/10 bg-neutral-100 text-neutral-700'
  return 'border-black bg-black text-white'
})

const dotClass = computed(() => {
  if (props.risk === 'safe') return 'bg-neutral-400'
  if (props.risk === 'careful') return 'bg-neutral-700'
  return 'bg-white'
})
</script>

<template>
  <span
    class="inline-flex items-center gap-2 rounded-[8px] border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]"
    :class="classes"
  >
    <span class="size-1.5 rounded-full" :class="dotClass" />
    {{ label }}
  </span>
</template>
