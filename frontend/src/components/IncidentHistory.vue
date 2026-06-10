<script setup>
import { legacy, legacyReady } from "../legacyBridge";
import IncidentHistoryFocusBar from "./IncidentHistoryFocusBar.vue";
import IncidentHistoryList from "./IncidentHistoryList.vue";
import { useIncidentHistoryFilters } from "../composables/useIncidentHistoryFilters";
import { useIncidentHistoryView } from "../composables/useIncidentHistoryView";

const { activeView, setView, views } = useIncidentHistoryView();
const { applyFilters, state: filterState } = useIncidentHistoryFilters();

function getViewButtonId(view) {
  return view === "all" ? "incidentAllFilterButton" : "incidentOpenFilterButton";
}
</script>

<template>
      <section class="incident-history" aria-label="事件暫存紀錄">
        <div class="incident-history-header">
          <div>
            <h3 class="workflow-title">事件暫存紀錄</h3>
            <p class="incident-history-note">預設只顯示未結案；載入後再次儲存會更新同一筆紀錄。</p>
          </div>
          <div class="incident-history-actions">
            <div class="incident-history-filter" role="group" aria-label="事件紀錄篩選">
              <button
                v-for="view in views"
                :id="getViewButtonId(view.id)"
                :key="view.id"
                class="incident-filter-button"
                :class="{ active: activeView === view.id }"
                type="button"
                :disabled="!legacyReady"
                :aria-pressed="String(activeView === view.id)"
                @click="setView(view.id)"
              >
                {{ view.label }}
              </button>
            </div>
            <button class="action-btn" type="button" :disabled="!legacyReady" @click="legacy('loadIncidentRecords')">更新紀錄</button>
          </div>
        </div>
        <div class="incident-history-toolbar" aria-label="事件紀錄搜尋與篩選">
          <input
            id="incidentHistorySearch"
            class="incident-history-search"
            type="search"
            :value="filterState.keyword"
            :disabled="!legacyReady"
            placeholder="搜尋事件、客戶、系統..."
            @input="applyFilters({ keyword: $event.target.value })"
          />
          <select
            id="incidentHistoryCustomerFilter"
            class="incident-history-select"
            :value="filterState.customer"
            :disabled="!legacyReady"
            aria-label="依客戶篩選"
            @change="applyFilters({ customer: $event.target.value })"
          >
            <option value="">全部客戶</option>
            <option v-for="customer in filterState.customerOptions" :key="customer" :value="customer">
              {{ customer }}
            </option>
          </select>
          <select
            id="incidentHistorySystemFilter"
            class="incident-history-select"
            :value="filterState.system"
            :disabled="!legacyReady"
            aria-label="依系統篩選"
            @change="applyFilters({ system: $event.target.value })"
          >
            <option value="">全部系統</option>
            <option v-for="system in filterState.systemOptions" :key="system" :value="system">
              {{ system }}
            </option>
          </select>
        </div>
        <IncidentHistoryFocusBar />
        <IncidentHistoryList />
      </section>
</template>
