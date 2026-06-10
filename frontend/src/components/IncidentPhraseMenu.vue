<script setup>
import { computed } from "vue";
import { legacyReady } from "../legacyBridge";
import { useIncidentPhrases } from "../composables/useIncidentPhrases";

const props = defineProps({
  fieldId: {
    type: String,
    required: true,
  },
  groupName: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
});

const {
  group,
  insertPhrase,
  isOpen,
  toggleGroup,
} = useIncidentPhrases(props.groupName);

const menuId = computed(() => group.value.menuId || `${props.groupName}PhraseMenu`);
const hasPhrases = computed(() => group.value.phrases.length > 0);
</script>

<template>
  <div class="field-label-row">
    <label :for="fieldId">{{ label }}</label>
    <button
      class="phrase-trigger"
      type="button"
      :aria-controls="menuId"
      :aria-expanded="String(isOpen)"
      :disabled="!legacyReady || !hasPhrases"
      @click="toggleGroup(groupName)"
    >
      常用句
    </button>
  </div>
  <div
    :id="menuId"
    class="phrase-menu"
    :hidden="!isOpen"
  >
    <button
      v-for="phrase in group.phrases"
      :key="phrase"
      type="button"
      class="phrase-menu-item"
      @click="insertPhrase(groupName, phrase)"
    >
      {{ phrase }}
    </button>
  </div>
</template>
