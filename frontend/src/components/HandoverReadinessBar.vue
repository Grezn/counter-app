<script setup>
import { legacy } from "../legacyBridge";
import { useHandoverReadiness } from "../composables/useHandoverReadiness";

const { hasStatus, state } = useHandoverReadiness();

function runReadinessAction(actionId) {
  legacy("executeHandoverReadinessAction", actionId);
}
</script>

<template>
  <div
    id="handoverReadinessBar"
    class="handover-readiness-bar"
    :class="state.isReady ? 'ready' : 'attention'"
    aria-live="polite"
  >
    <template v-if="hasStatus">
      <span class="readiness-label">{{ state.label }}</span>
      <span class="readiness-message">{{ state.message }}</span>
      <div v-if="state.issues.length" class="readiness-actions">
        <button
          v-for="issue in state.issues"
          :key="issue.id"
          class="readiness-action"
          type="button"
          @click="runReadinessAction(issue.id)"
        >
          {{ issue.label }}
        </button>
      </div>
    </template>
  </div>
</template>
