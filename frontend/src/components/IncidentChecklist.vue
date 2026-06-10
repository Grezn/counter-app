<script setup>
import { useIncidentChecklist } from "../composables/useIncidentChecklist";

const {
  isChecked,
  items: checklistItems,
  setCheck,
} = useIncidentChecklist();
</script>

<template>
  <div class="checklist-box">
    <h3 class="workflow-title">事件 checklist</h3>
    <label v-for="item in checklistItems" :key="item" class="check-item">
      <input
        type="checkbox"
        :checked="isChecked(item)"
        :data-incident-check="item"
        @change="setCheck(item, $event.target.checked)"
      />
      {{ item }}
    </label>
  </div>
</template>
