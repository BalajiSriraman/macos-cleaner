<script setup lang="ts">
withDefaults(defineProps<{
  size?: number
  color?: string
  speed?: number
  stroke?: number
}>(), {
  size: 28,
  color: '#111111',
  speed: 0.9,
  stroke: 3.5
})
</script>

<template>
  <div
    class="activity-spinner"
    :style="{
      '--uib-size': `${size}px`,
      '--uib-color': color,
      '--uib-speed': `${speed}s`,
      '--uib-stroke': `${stroke}px`
    }"
    aria-hidden="true"
  >
    <div v-for="line in 6" :key="line" class="activity-spinner__line" />
  </div>
</template>

<style scoped>
.activity-spinner {
  --uib-size: 28px;
  --uib-color: #111111;
  --uib-speed: 0.9s;
  --uib-stroke: 3.5px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--uib-size);
  height: var(--uib-size);
}

.activity-spinner__line {
  position: absolute;
  top: calc(50% - var(--uib-stroke) / 2);
  left: 0;
  width: 100%;
  height: var(--uib-stroke);
  border-radius: calc(var(--uib-stroke) / 2);
  background-color: var(--uib-color);
  animation: activity-spinner-rotate var(--uib-speed) ease-in-out infinite alternate;
  transition: background-color 0.3s ease;
}

.activity-spinner__line:nth-child(1) {
  animation-delay: calc(var(--uib-speed) * -0.375);
}

.activity-spinner__line:nth-child(2) {
  animation-delay: calc(var(--uib-speed) * -0.375);
  opacity: 0.8;
}

.activity-spinner__line:nth-child(3) {
  animation-delay: calc(var(--uib-speed) * -0.3);
  opacity: 0.6;
}

.activity-spinner__line:nth-child(4) {
  animation-delay: calc(var(--uib-speed) * -0.225);
  opacity: 0.4;
}

.activity-spinner__line:nth-child(5) {
  animation-delay: calc(var(--uib-speed) * -0.15);
  opacity: 0.2;
}

.activity-spinner__line:nth-child(6) {
  animation-delay: calc(var(--uib-speed) * -0.075);
  opacity: 0.1;
}

@keyframes activity-spinner-rotate {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(180deg);
  }
}
</style>
