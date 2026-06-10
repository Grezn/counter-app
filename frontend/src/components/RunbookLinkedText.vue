<script setup>
import { computed } from "vue";
import { getRunbookLinkedSegments } from "../composables/useRunbooks";

const props = defineProps({
  runbook: {
    type: Object,
    required: true,
  },
  text: {
    type: String,
    default: "",
  },
});

const segments = computed(() => getRunbookLinkedSegments(props.text, props.runbook));
</script>

<template>
  <template v-for="(segment, index) in segments" :key="`${index}-${segment.text}`">
    <a
      v-if="segment.href"
      class="runbook-inline-link"
      :href="segment.href"
      target="_blank"
      rel="noopener noreferrer"
    >
      {{ segment.text }}
    </a>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>
