<script setup>
defineProps({
  activeView: {
    type: String,
    required: true,
  },
  theme: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(["set-theme", "set-view"]);
</script>

<template>
  <div class="header-row">
    <div>
      <h1>MSP 值班中控台</h1>
      <div class="sub">事件留存、交班摘要與常用入口</div>
    </div>
    <div class="theme-switch" role="group" aria-label="主題切換">
      <button
        id="themeLightButton"
        class="theme-option"
        :class="{ active: theme === 'light' }"
        type="button"
        :aria-pressed="String(theme === 'light')"
        @click="emit('set-theme', 'light')"
      >
        亮色
      </button>
      <button
        id="themeDarkButton"
        class="theme-option"
        :class="{ active: theme === 'dark' }"
        type="button"
        :aria-pressed="String(theme === 'dark')"
        @click="emit('set-theme', 'dark')"
      >
        暗色
      </button>
    </div>
  </div>

  <nav class="view-tabs" role="tablist" aria-label="主要分頁">
    <button
      id="dashboardTab"
      class="view-tab"
      :class="{ active: activeView === 'dashboard' }"
      type="button"
      role="tab"
      :aria-selected="String(activeView === 'dashboard')"
      aria-controls="dashboardView"
      @click="emit('set-view', 'dashboard')"
    >
      中控台
    </button>
    <button
      id="runbooksTab"
      class="view-tab"
      :class="{ active: activeView === 'runbooks' }"
      type="button"
      role="tab"
      :aria-selected="String(activeView === 'runbooks')"
      aria-controls="runbooksView"
      @click="emit('set-view', 'runbooks')"
    >
      SOP 速查
    </button>
  </nav>
</template>
