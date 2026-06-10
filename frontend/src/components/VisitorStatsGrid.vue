<script setup>
import { useVisitorStats } from "../composables/useVisitorStats";

const { stats } = useVisitorStats();
</script>

<template>
  <div class="stats-grid" aria-label="訪客統計">
    <div class="stat-box">
      <div class="label">累計訪客</div>
      <div class="stat-number" id="totalVisitors">{{ stats.totalVisitors }}</div>
    </div>

    <div class="stat-box">
      <div class="label">今日訪客</div>
      <div class="stat-number" id="todayVisitors">{{ stats.todayVisitors }}</div>
    </div>

    <div class="stat-box">
      <div class="label">目前在線</div>
      <div class="stat-number" id="activeVisitors">{{ stats.activeVisitors }}</div>
    </div>

    <div class="stat-box">
      <div class="label">今天</div>
      <div class="stat-date" id="today">{{ stats.todayLabel }}</div>
    </div>
  </div>
</template>
