<script setup>
import IncidentNotesTimeline from "./IncidentNotesTimeline.vue";
import IncidentPhraseMenu from "./IncidentPhraseMenu.vue";
import IncidentTemplatePicker from "./IncidentTemplatePicker.vue";
import IncidentQuickIntake from "./IncidentQuickIntake.vue";
import IncidentDetailsFields from "./IncidentDetailsFields.vue";
import { useIncidentCoreFields } from "../composables/useIncidentCoreFields";
import { useIncidentNextCheck } from "../composables/useIncidentNextCheck";

const {
  fieldOptions: coreFieldOptions,
  getField: getCoreField,
  setField: setCoreField,
} = useIncidentCoreFields();

const {
  clearNextCheckAt,
  isNextCheckDisabled,
  nextCheckTitle,
  setNextCheckAt,
  setTrackingStatus,
  state: nextCheckState,
  trackingStatusOptions,
} = useIncidentNextCheck();
</script>

<template>
      <div class="incident-grid">
        <div class="incident-core-title">接手重點</div>

        <IncidentQuickIntake />

        <IncidentTemplatePicker />

        <div class="field">
          <label for="incidentStartedAt">事件時間</label>
          <input
            id="incidentStartedAt"
            type="datetime-local"
            data-incident-field="startedAt"
            :value="getCoreField('startedAt')"
            @change="setCoreField('startedAt', $event.target.value)"
            @input="setCoreField('startedAt', $event.target.value)"
          />
        </div>

        <div class="field">
          <label for="incidentSeverity">嚴重度</label>
          <select id="incidentSeverity" data-incident-field="severity" :value="getCoreField('severity')" @change="setCoreField('severity', $event.target.value)">
            <option v-for="option in coreFieldOptions.severity" :key="option.label" :value="option.value">{{ option.label }}</option>
          </select>
        </div>

        <div class="field">
          <label for="incidentStatus">目前狀態</label>
          <select id="incidentStatus" data-incident-field="status" :value="getCoreField('status')" @change="setCoreField('status', $event.target.value)">
            <option v-for="option in coreFieldOptions.status" :key="option.label" :value="option.value">{{ option.label }}</option>
          </select>
        </div>

        <div class="field">
          <label for="incidentCustomer">客戶 / 單位</label>
          <input id="incidentCustomer" type="text" data-incident-field="customer" :value="getCoreField('customer')" placeholder="客戶或內部單位" @input="setCoreField('customer', $event.target.value)" />
        </div>

        <div class="field">
          <label for="incidentSystem">系統 / 設備</label>
          <input id="incidentSystem" type="text" data-incident-field="system" :value="getCoreField('system')" placeholder="服務、設備或主機名稱" @input="setCoreField('system', $event.target.value)" />
        </div>

        <div class="field">
          <label for="incidentSource">來源</label>
          <select id="incidentSource" data-incident-field="source" :value="getCoreField('source')" @change="setCoreField('source', $event.target.value)">
            <option v-for="option in coreFieldOptions.source" :key="option.label" :value="option.value">{{ option.label }}</option>
          </select>
        </div>

        <div class="field full">
          <label for="incidentTitle">一句話主旨</label>
          <input id="incidentTitle" type="text" data-incident-field="title" :value="getCoreField('title')" placeholder="例如：XX 客戶 VPN 連線失敗，需要二線接手確認" @input="setCoreField('title', $event.target.value)" />
        </div>

        <div class="field full">
          <label for="incidentProblemDescription">問題描述</label>
          <textarea id="incidentProblemDescription" data-incident-field="problemDescription" :value="getCoreField('problemDescription')" placeholder="只寫接手需要知道的現象、錯誤訊息、發生時間。" @input="setCoreField('problemDescription', $event.target.value)"></textarea>
        </div>

        <div class="field span-2">
          <label for="incidentImpact">影響範圍</label>
          <textarea id="incidentImpact" data-incident-field="impact" :value="getCoreField('impact')" placeholder="誰受影響、是否影響服務、是否已有 workaround。" @input="setCoreField('impact', $event.target.value)"></textarea>
        </div>

        <div class="field">
          <label for="incidentHandoverOwner">接手人員</label>
          <textarea id="incidentHandoverOwner" data-incident-field="handoverOwner" :value="getCoreField('handoverOwner')" placeholder="工程師 / 業務 / 部門 / 無" @input="setCoreField('handoverOwner', $event.target.value)"></textarea>
        </div>

        <div class="field span-2 has-phrase-menu">
          <IncidentPhraseMenu group-name="nextStep" field-id="incidentNextStep" label="下一步" />
          <textarea id="incidentNextStep" data-incident-field="nextStep" :value="getCoreField('nextStep')" placeholder="下一個動作、等待誰回覆、預計何時再確認。" @input="setCoreField('nextStep', $event.target.value)"></textarea>
        </div>

        <div class="field">
          <label for="incidentTrackingStatus">追蹤狀態</label>
          <select id="incidentTrackingStatus" data-incident-field="trackingStatus" :value="nextCheckState.trackingStatus" @change="setTrackingStatus($event.target.value)">
            <option v-for="option in trackingStatusOptions" :key="option.label" :value="option.value">{{ option.label }}</option>
          </select>
        </div>

        <div class="field">
          <div class="field-label-row">
            <label for="incidentNextCheckAt">下次確認</label>
            <button class="field-mini-action" type="button" @click="clearNextCheckAt">清除</button>
          </div>
          <input
            id="incidentNextCheckAt"
            type="datetime-local"
            data-incident-field="nextCheckAt"
            :disabled="isNextCheckDisabled"
            :title="nextCheckTitle"
            :value="nextCheckState.nextCheckAt"
            @change="setNextCheckAt($event.target.value)"
            @input="setNextCheckAt($event.target.value)"
          />
        </div>

        <div class="field">
          <label for="incidentNotified">已通知</label>
          <textarea id="incidentNotified" data-incident-field="notified" :value="getCoreField('notified')" placeholder="人員、時間、管道。" @input="setCoreField('notified', $event.target.value)"></textarea>
        </div>

        <div class="field full has-phrase-menu">
          <IncidentPhraseMenu group-name="notes" field-id="incidentNotes" label="處理紀錄" />
          <IncidentNotesTimeline />
        </div>

        <IncidentDetailsFields />
      </div>
</template>
