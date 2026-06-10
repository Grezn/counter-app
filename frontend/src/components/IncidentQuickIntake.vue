<script setup>
import { legacyReady } from "../legacyBridge";
import { useIncidentQuickIntake } from "../composables/useIncidentQuickIntake";

const {
  appendQuickDraft,
  applyQuickDraft,
  clearQuickDraft,
  quickInput,
} = useIncidentQuickIntake();
</script>

<template>
  <div class="incident-quick-intake field full">
    <label for="incidentQuickIntake">快速接案</label>
    <textarea
      id="incidentQuickIntake"
      v-model="quickInput"
      class="incident-quick-input"
      placeholder="貼上告警信、客戶訊息或 Jira 摘要"
    ></textarea>
    <div class="incident-quick-actions">
      <button
        class="field-mini-action incident-quick-primary"
        type="button"
        :disabled="!legacyReady"
        @click="applyQuickDraft"
      >
        帶入事件
      </button>
      <button
        class="field-mini-action"
        type="button"
        :disabled="!legacyReady"
        @click="appendQuickDraft"
      >
        追加紀錄
      </button>
      <button
        class="field-mini-action"
        type="button"
        :disabled="!legacyReady"
        @click="clearQuickDraft"
      >
        清除
      </button>
    </div>
  </div>
</template>
