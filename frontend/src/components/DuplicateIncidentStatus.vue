<script setup>
import { legacy } from "../legacyBridge";
import { useDuplicateIncidentStatus } from "../composables/useDuplicateIncidentStatus";

const { hasMatches, state } = useDuplicateIncidentStatus();

function restoreDuplicate(matchId) {
  legacy("restoreDuplicateIncidentMatch", matchId);
}
</script>

<template>
  <div
    id="duplicateIncidentStatus"
    class="duplicate-incident-status"
    role="status"
    aria-live="polite"
  >
    <template v-if="hasMatches">
      <span>可能已有相似未結案事件：</span>
      <button
        v-for="match in state.matches"
        :key="match.id"
        class="duplicate-incident-link"
        type="button"
        @click="restoreDuplicate(match.id)"
      >
        {{ match.title }}
      </button>
    </template>
  </div>
</template>
