<script setup>
import { useIncidentNotesTimeline } from "../composables/useIncidentNotesTimeline";

const {
  entries,
  hasTimeline,
  notes,
  syncNotes,
} = useIncidentNotesTimeline();

function handleNotesInput(event) {
  syncNotes(event.target.value);
}
</script>

<template>
  <textarea
    id="incidentNotes"
    data-incident-field="notes"
    placeholder="依時間補處理紀錄，例如：22:15 確認告警；22:20 已轉二線。"
    :value="notes"
    @input="handleNotesInput"
    @change="handleNotesInput"
  ></textarea>
  <div id="incidentNotesTimeline" class="notes-timeline" aria-live="polite">
    <template v-if="hasTimeline">
      <div class="notes-timeline-meta">時間軸 {{ entries.length }} 筆</div>
      <div class="notes-timeline-list">
        <div
          v-for="(entry, index) in entries"
          :key="`${entry.time}-${entry.text}-${index}`"
          class="notes-timeline-row"
          :class="{ muted: !entry.hasTime }"
        >
          <span class="notes-timeline-time">{{ entry.time }}</span>
          <span class="notes-timeline-text">{{ entry.text }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
