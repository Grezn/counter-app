<script setup>
import { onMounted } from "vue";
import AppHeader from "./components/AppHeader.vue";
import BackToTopButton from "./components/BackToTopButton.vue";
import IncidentPanel from "./components/IncidentPanel.vue";
import LinksPanel from "./components/LinksPanel.vue";
import RunbookView from "./components/RunbookView.vue";
import WeatherStatsPanel from "./components/WeatherStatsPanel.vue";
import { useAppShell } from "./composables/useAppShell";

const { activeView, initAppShell, setActiveView, setTheme, theme } = useAppShell();

onMounted(initAppShell);
</script>

<template>
<div class="card">
    <AppHeader
      :active-view="activeView"
      :theme="theme"
      @set-theme="setTheme"
      @set-view="setActiveView"
    />

    <main
      id="dashboardView"
      class="page-view"
      :class="{ active: activeView === 'dashboard' }"
      role="tabpanel"
      aria-labelledby="dashboardTab"
      :hidden="activeView !== 'dashboard'"
    >
      <WeatherStatsPanel />

      <IncidentPanel />

    </main>

    <RunbookView :active="activeView === 'runbooks'" />
    <LinksPanel />

    <BackToTopButton />

  </div>
</template>
