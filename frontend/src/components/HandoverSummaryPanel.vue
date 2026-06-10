<script setup>
import { legacyReady } from "../legacyBridge";
import HandoverSummaryBadge from "./HandoverSummaryBadge.vue";
import { useHandoverSummaryMode } from "../composables/useHandoverSummaryMode";
import { useHandoverSummaryText } from "../composables/useHandoverSummaryText";

const { activeMode, modes, setMode } = useHandoverSummaryMode();
const { summaryText } = useHandoverSummaryText();
</script>

<template>
  <div class="summary-box">
    <div class="summary-header">
      <h3 class="workflow-title">交班摘要</h3>
      <div class="summary-header-tools">
        <HandoverSummaryBadge />
        <div class="summary-mode-control" role="group" aria-label="交班摘要格式">
          <button
            v-for="mode in modes"
            :key="mode.id"
            class="summary-mode-button"
            :class="{ active: activeMode === mode.id }"
            type="button"
            :disabled="!legacyReady"
            :aria-pressed="String(activeMode === mode.id)"
            @click="setMode(mode.id)"
          >
            {{ mode.label }}
          </button>
        </div>
      </div>
    </div>
    <textarea id="handoverSummary" class="summary-output" :value="summaryText" readonly></textarea>
  </div>
</template>
