<script setup>
import { legacyReady } from "../legacyBridge";
import { useIncidentTemplates } from "../composables/useIncidentTemplates";

const {
  applySelectedTemplate,
  setSelectedTemplate,
  state,
} = useIncidentTemplates();
</script>

<template>
  <div class="field full incident-template-field">
    <label for="incidentTemplateSelect">事件樣板</label>
    <div class="incident-template-control">
      <select
        id="incidentTemplateSelect"
        :value="state.selectedId"
        :disabled="!legacyReady"
        aria-label="事件樣板"
        @change="setSelectedTemplate($event.target.value)"
      >
        <option value="">選擇常見情境</option>
        <option
          v-for="template in state.templates"
          :key="template.id"
          :value="template.id"
        >
          {{ template.label }}
        </option>
      </select>
      <button
        id="applyIncidentTemplateButton"
        class="field-mini-action incident-template-apply"
        type="button"
        :disabled="!legacyReady || !state.selectedId"
        @click="applySelectedTemplate"
      >
        套用
      </button>
    </div>
  </div>
</template>
