<script setup>
import { useIncidentHistoryStatus } from "../composables/useIncidentHistoryStatus";

const { hasStatus, state } = useIncidentHistoryStatus();
</script>

<template>
  <div
    id="incidentHistoryStatus"
    class="incident-history-status"
    :class="state.type"
    role="status"
    aria-live="polite"
  >
    <template v-if="hasStatus">{{ state.message }}</template>
  </div>
</template>
