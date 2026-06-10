<script setup>
import RunbookCard from "./RunbookCard.vue";
import { useRunbooks } from "../composables/useRunbooks";

defineProps({
  active: {
    type: Boolean,
    default: false,
  },
});

const {
  applyRunbookDraft,
  categoryOptions,
  filteredRunbooks,
  getCategoryName,
  metaText,
  setActiveCategory,
  state,
} = useRunbooks();
</script>

<template>
  <main
    id="runbooksView"
    class="page-view"
    :class="{ active }"
    role="tabpanel"
    aria-labelledby="runbooksTab"
    :hidden="!active"
  >
    <section class="runbook-panel">
      <div class="runbook-header">
        <div>
          <h2 class="runbook-title">SOP 速查</h2>
          <p class="runbook-subtitle">依產品快速查處理步驟；信件收件人保留在原段落，可直接選取複製。</p>
        </div>
        <div id="runbookMeta" class="runbook-meta">{{ metaText }}</div>
      </div>

      <div class="runbook-controls">
        <input
          id="runbookSearch"
          v-model="state.keyword"
          type="search"
          placeholder="搜尋：AWS、報修、交班..."
        />
        <div id="runbookCategories" class="runbook-categories">
          <button
            v-for="category in categoryOptions"
            :key="category.id"
            type="button"
            class="runbook-category"
            :class="{ active: state.activeCategory === category.id }"
            @click="setActiveCategory(category.id)"
          >
            {{ category.name }}
          </button>
        </div>
      </div>

      <div id="runbookList" class="runbook-list">
        <div v-if="state.loading" class="runbook-empty">Runbook 載入中...</div>
        <div v-else-if="state.error" class="runbook-empty">Runbook 載入失敗：{{ state.error }}</div>
        <div v-else-if="!filteredRunbooks.length" class="runbook-empty">找不到符合條件的 Runbook</div>
        <RunbookCard
          v-for="runbook in filteredRunbooks"
          v-else
          :key="runbook.id"
          :runbook="runbook"
          :category-name="getCategoryName(runbook.category)"
          @apply-draft="applyRunbookDraft"
        />
      </div>
    </section>
  </main>
</template>
