<script setup>
import { useHandoverSummaryBadge } from "../composables/useHandoverSummaryBadge";

const { hasText, state } = useHandoverSummaryBadge();
</script>

<template>
  <div
    id="handoverSummaryBadge"
    class="summary-badge"
    :class="state.isComplete ? 'complete' : 'missing'"
    :title="state.title"
    aria-live="polite"
  >
    <template v-if="hasText">{{ state.text }}</template>
  </div>
</template>
