<script setup>
import { legacy } from "../legacyBridge";
import { useHandoverSummaryStatus } from "../composables/useHandoverSummaryStatus";

const { hasStatus, state } = useHandoverSummaryStatus();

function focusMissingField(fieldId) {
  legacy("focusHandoverSummaryStatusField", fieldId);
}
</script>

<template>
  <div
    id="handoverSummaryStatus"
    class="handover-summary-status"
    :class="state.type"
    role="status"
    aria-live="polite"
  >
    <template v-if="hasStatus">
      <template v-if="state.fields.length">
        <span>交班摘要還缺：</span>
        <template v-for="(field, index) in state.fields" :key="field.id">
          <span v-if="index > 0">、</span>
          <button class="missing-field-link" type="button" @click="focusMissingField(field.id)">
            {{ field.label }}
          </button>
        </template>
        <span>。</span>
      </template>
      <template v-else>{{ state.message }}</template>
    </template>
  </div>
</template>
