<script setup>
import { computed } from "vue";
import { legacy, legacyReady } from "../legacyBridge";
import { useIncidentSaveStatus } from "../composables/useIncidentSaveStatus";
import { useJiraStatus } from "../composables/useJiraStatus";

const clearAction = {
  handler: "clearIncidentState",
  icon: "×",
  label: "清空",
  hint: "清除表單與本機草稿",
  title: "清空事件",
};

const { isSaving, saveLabel } = useIncidentSaveStatus();
const { createIssueFromCurrentIncident, isCreating } = useJiraStatus();
const saveButtonLabel = computed(() => {
  if (isSaving.value) return saveLabel.value;
  return saveLabel.value === "更新" ? "更新事件" : "儲存事件";
});
const saveButtonHint = computed(() => {
  if (isSaving.value) return "正在寫入事件紀錄";
  return saveLabel.value === "更新" ? "更新目前載入的紀錄" : "寫入事件歷史紀錄";
});
</script>

<template>
  <div class="incident-actions" aria-label="事件操作">
    <button
      id="saveIncidentButton"
      class="action-btn primary"
      type="button"
      :aria-label="saveButtonLabel"
      :disabled="!legacyReady || isSaving"
      :title="saveButtonHint"
      @click="legacy('saveIncidentRecord')"
    >
      <span class="action-glyph" aria-hidden="true">✓</span>
      {{ saveButtonLabel }}
    </button>
    <button
      id="createJiraIssueButton"
      class="action-btn jira"
      type="button"
      aria-label="建立 Jira 小卡"
      :disabled="!legacyReady || isCreating"
      title="建立 Jira 小卡"
      @click="createIssueFromCurrentIncident"
    >
      <span class="action-glyph" aria-hidden="true">J</span>
      <span>{{ isCreating ? "建立中" : "Jira 小卡" }}</span>
    </button>
    <button
      class="action-btn danger"
      type="button"
      aria-label="清空事件"
      :disabled="!legacyReady"
      :title="clearAction.hint"
      @click="legacy(clearAction.handler)"
    >
      <span class="action-glyph" aria-hidden="true">{{ clearAction.icon }}</span>
      {{ clearAction.label }}
    </button>
  </div>
</template>
