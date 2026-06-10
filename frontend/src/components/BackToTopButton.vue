<script setup>
import { onMounted, onUnmounted, ref } from "vue";

const isVisible = ref(false);

function updateVisibility() {
  isVisible.value = window.scrollY > 420;
}

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

onMounted(() => {
  updateVisibility();
  window.scrollToTop = scrollToTop;
  window.addEventListener("scroll", updateVisibility, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("scroll", updateVisibility);
});
</script>

<template>
  <button
    id="backToTopButton"
    class="back-to-top"
    :class="{ visible: isVisible }"
    type="button"
    @click="scrollToTop"
    aria-label="回到頂端"
    title="回到頂端"
  >
    ↑
  </button>
</template>
