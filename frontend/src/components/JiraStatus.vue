<script setup>
import { useJiraStatus } from "../composables/useJiraStatus";

const { hasStatus, state } = useJiraStatus();
</script>

<template>
  <div
    id="jiraStatus"
    class="jira-status"
    :class="state.type"
    role="status"
    aria-live="polite"
  >
    <template v-if="hasStatus">
      <span>{{ state.message }}</span>
      <a v-if="state.linkUrl" :href="state.linkUrl" target="_blank" rel="noopener noreferrer">開啟 Jira</a>
    </template>
  </div>
</template>
