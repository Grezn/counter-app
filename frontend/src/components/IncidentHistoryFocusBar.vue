<script setup>
import { legacy } from "../legacyBridge";
import { useIncidentHistoryFocus } from "../composables/useIncidentHistoryFocus";

const { hasFocusData, state } = useIncidentHistoryFocus();

function setFocus(focusKey) {
  legacy("setIncidentHistoryFocus", focusKey);
}

function clearFocus() {
  if (state.activeFocus) {
    setFocus(state.activeFocus);
  }
}
</script>

<template>
  <div id="incidentFocusBar" class="incident-focus-bar" aria-label="事件追蹤焦點">
    <template v-if="hasFocusData">
      <div class="incident-focus-summary">未結案 {{ state.counts.open }} 件</div>
      <button
        v-for="option in state.options"
        :key="option.key"
        class="incident-focus-chip"
        :class="{ active: state.activeFocus === option.key }"
        type="button"
        :aria-pressed="String(state.activeFocus === option.key)"
        :title="option.title || option.label"
        @click="setFocus(option.key)"
      >
        <span class="incident-focus-label">{{ option.label }}</span>
        <strong class="incident-focus-count">{{ state.counts[option.key] || 0 }}</strong>
      </button>
      <button
        class="incident-focus-clear"
        :class="{ visible: state.activeFocus }"
        type="button"
        :disabled="!state.activeFocus"
        @click="clearFocus"
      >
        清除焦點
      </button>
    </template>
  </div>
</template>
