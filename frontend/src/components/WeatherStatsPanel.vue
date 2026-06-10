<script setup>
import LocalWeatherStrip from "./LocalWeatherStrip.vue";
import VisitorStatsGrid from "./VisitorStatsGrid.vue";
</script>

<template>
  <section class="dashboard-overview" aria-label="中控台狀態概覽">
    <LocalWeatherStrip />
    <VisitorStatsGrid />
  </section>
</template>
