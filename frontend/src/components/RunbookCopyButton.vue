<script setup>
import { ref } from "vue";
import { copyTextToClipboard } from "../composables/useRunbooks";

const props = defineProps({
  label: {
    type: String,
    default: "複製",
  },
  text: {
    type: [Array, String],
    default: "",
  },
});

const buttonText = ref(props.label);
let resetTimerId = null;

function setTemporaryText(text) {
  buttonText.value = text;
  window.clearTimeout(resetTimerId);
  resetTimerId = window.setTimeout(() => {
    buttonText.value = props.label;
  }, 1400);
}

async function copy() {
  try {
    await copyTextToClipboard(props.text);
    setTemporaryText("已複製");
  } catch {
    setTemporaryText("複製失敗");
  }
}
</script>

<template>
  <button
    type="button"
    class="runbook-copy-button"
    aria-label="複製此段內容"
    @click="copy"
  >
    {{ buttonText }}
  </button>
</template>
