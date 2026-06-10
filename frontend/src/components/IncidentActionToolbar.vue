<script setup>
import { computed } from "vue";
import { legacy, legacyReady } from "../legacyBridge";
import { useIncidentSaveStatus } from "../composables/useIncidentSaveStatus";
import { useJiraStatus } from "../composables/useJiraStatus";

const utilityActions = [
  {
    handler: "copyHandoverSummary",
    icon: "⧉",
    label: "複製摘要",
    hint: "把下方摘要複製到剪貼簿",
    title: "複製交班摘要",
  },
];
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

function formatDateTimeLocal(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + "T" + [pad(date.getHours()), pad(date.getMinutes())].join(":");
}

function setIncidentNow() {
  legacy("setIncidentNow", formatDateTimeLocal());
}
</script>

<template>
  <div class="incident-actions" aria-label="事件操作">
    <button
      class="action-btn"
      type="button"
      aria-label="填入現在時間"
      :disabled="!legacyReady"
      title="填入現在時間"
      @click="setIncidentNow"
    >
      <span class="action-glyph" aria-hidden="true">⏱</span>
      <span>填時間</span>
    </button>
    <button
      v-for="action in utilityActions"
      :id="action.id"
      :key="action.handler"
      class="action-btn"
      type="button"
      :aria-label="action.title"
      :disabled="!legacyReady"
      :title="action.title"
      @click="legacy(action.handler)"
    >
      <span class="action-glyph" aria-hidden="true">{{ action.icon }}</span>
      <span>{{ action.label }}</span>
    </button>
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
