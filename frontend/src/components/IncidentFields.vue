<script setup>
import IncidentNotesTimeline from "./IncidentNotesTimeline.vue";
import IncidentPhraseMenu from "./IncidentPhraseMenu.vue";
import IncidentDetailsFields from "./IncidentDetailsFields.vue";
import { legacy, legacyReady } from "../legacyBridge";
import { useIncidentCoreFields } from "../composables/useIncidentCoreFields";
import { useIncidentServiceDetails } from "../composables/useIncidentServiceDetails";

const {
  fieldOptions: coreFieldOptions,
  getField: getCoreField,
  setField: setCoreField,
} = useIncidentCoreFields();

const {
  getField: getServiceField,
  setField: setServiceField,
} = useIncidentServiceDetails();

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
      <div class="incident-grid">
        <div class="incident-core-title">報修電話資訊</div>

        <div class="field">
          <label for="incidentStartedAt">進線時間</label>
          <div class="field-control-row">
            <input
              id="incidentStartedAt"
              type="datetime-local"
              data-incident-field="startedAt"
              :value="getCoreField('startedAt')"
              @change="setCoreField('startedAt', $event.target.value)"
              @input="setCoreField('startedAt', $event.target.value)"
            />
            <button
              class="field-adjacent-action"
              type="button"
              aria-label="填入現在時間"
              :disabled="!legacyReady"
              title="填入現在時間"
              @click="setIncidentNow"
            >
              <span aria-hidden="true">⏱</span>
              現在
            </button>
          </div>
        </div>

        <div class="field">
          <label for="incidentRepairTarget">來自</label>
          <input id="incidentRepairTarget" type="text" data-incident-field="repairTarget" :value="getServiceField('repairTarget')" placeholder="公版 xxx，例如：王小姐 / 經銷商窗口" @input="setServiceField('repairTarget', $event.target.value)" />
        </div>

        <div class="field">
          <label for="incidentDealer">經銷商</label>
          <input id="incidentDealer" type="text" data-incident-field="dealer" :value="getServiceField('dealer')" placeholder="無則填無" @input="setServiceField('dealer', $event.target.value)" />
        </div>

        <div class="field">
          <label for="incidentCustomer">客戶名稱</label>
          <input id="incidentCustomer" type="text" data-incident-field="customer" :value="getCoreField('customer')" placeholder="客戶公司或單位" @input="setCoreField('customer', $event.target.value)" />
        </div>

        <div class="field">
          <label for="incidentOwner">負責業務</label>
          <input id="incidentOwner" type="text" data-incident-field="owner" :value="getServiceField('owner')" placeholder="業務姓名 / 無 / 待確認" @input="setServiceField('owner', $event.target.value)" />
        </div>

        <div class="field">
          <label for="incidentModel">產品型號</label>
          <input id="incidentModel" type="text" data-incident-field="model" :value="getServiceField('model')" placeholder="無則填無" @input="setServiceField('model', $event.target.value)" />
        </div>

        <div class="field">
          <label for="incidentSerial">產品序號</label>
          <input id="incidentSerial" type="text" data-incident-field="serial" :value="getServiceField('serial')" placeholder="無則填無" @input="setServiceField('serial', $event.target.value)" />
        </div>

        <div class="field">
          <label for="incidentContactMethod">聯繫方式</label>
          <input id="incidentContactMethod" type="text" data-incident-field="contactMethod" :value="getServiceField('contactMethod')" placeholder="電話 / Email / Line / 聯絡人" @input="setServiceField('contactMethod', $event.target.value)" />
        </div>

        <div class="field full">
          <label for="incidentProblemDescription">問題描述</label>
          <textarea id="incidentProblemDescription" data-incident-field="problemDescription" :value="getCoreField('problemDescription')" placeholder="客戶口述現象、錯誤訊息、發生時間與目前狀況。" @input="setCoreField('problemDescription', $event.target.value)"></textarea>
        </div>

        <details class="incident-details incident-internal-details">
          <summary>內部追蹤補充</summary>
          <div class="details-grid">
            <div class="field">
              <label for="incidentStatus">目前狀態</label>
              <select id="incidentStatus" data-incident-field="status" :value="getCoreField('status')" @change="setCoreField('status', $event.target.value)">
                <option v-for="option in coreFieldOptions.status" :key="option.label" :value="option.value">{{ option.label }}</option>
              </select>
            </div>

            <div class="field">
              <label for="incidentSystem">系統 / 服務</label>
              <input id="incidentSystem" type="text" data-incident-field="system" :value="getCoreField('system')" placeholder="選填" @input="setCoreField('system', $event.target.value)" />
            </div>

            <div class="field full has-phrase-menu">
              <IncidentPhraseMenu group-name="nextStep" field-id="incidentNextStep" label="下一步" />
              <textarea id="incidentNextStep" data-incident-field="nextStep" :value="getCoreField('nextStep')" placeholder="選填；需要交班追蹤時再補。" @input="setCoreField('nextStep', $event.target.value)"></textarea>
            </div>

            <div class="field full has-phrase-menu">
              <IncidentPhraseMenu group-name="notes" field-id="incidentNotes" label="處理紀錄" />
              <IncidentNotesTimeline />
            </div>
          </div>
        </details>

        <IncidentDetailsFields />
      </div>
</template>
