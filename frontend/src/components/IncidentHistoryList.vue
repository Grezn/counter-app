<script setup>
import { useIncidentHistoryList } from "../composables/useIncidentHistoryList";

const {
  copyRecord,
  deleteRecord,
  hasRecords,
  resolveRecord,
  restoreRecord,
  state,
} = useIncidentHistoryList();
</script>

<template>
  <div id="incidentHistoryList" class="incident-history-list">
    <article
      v-for="record in state.records"
      :key="record.id"
      class="incident-record"
      :class="{
        resolved: record.isResolved,
        due: record.isDue,
        'ready-to-resolve': record.isReadyToResolve,
      }"
    >
      <div class="incident-record-body">
        <div class="incident-record-top">
          <div class="incident-record-title-block">
            <h4 class="incident-record-title">{{ record.title }}</h4>
            <div class="incident-record-meta">{{ record.meta }}</div>
            <p v-if="record.summary" class="incident-record-summary">{{ record.summary }}</p>
          </div>

          <div class="incident-record-side">
            <div v-if="record.isResolved" class="incident-record-state">已解決</div>
            <div
              v-else-if="record.trackingStatus"
              class="incident-record-tracking"
              :class="record.trackingClass"
            >
              {{ record.trackingStatus }}
            </div>

            <time
              v-if="record.nextCheckLabel"
              class="incident-record-reminder"
              :class="{ due: record.isDue }"
              :datetime="record.nextCheckDateTime"
            >
              {{ record.nextCheckLabel }}
            </time>

            <time
              v-if="record.savedTime"
              class="incident-record-time"
              :datetime="record.savedTimeDateTime"
            >
              {{ record.savedTime }}
            </time>

            <div class="incident-record-actions">
              <button
                class="incident-record-action primary"
                type="button"
                @click="restoreRecord(record.id)"
              >
                載入
              </button>
              <button
                class="incident-record-action"
                type="button"
                @click="copyRecord(record.id)"
              >
                複製
              </button>
              <button
                v-if="!record.isResolved"
                class="incident-record-action"
                type="button"
                @click="resolveRecord(record.id)"
              >
                結案
              </button>
              <button
                class="incident-record-action danger"
                type="button"
                @click="deleteRecord(record.id)"
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>

    <div v-if="!hasRecords" class="incident-history-empty">{{ state.emptyText }}</div>
  </div>
</template>
