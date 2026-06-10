import { computed, ref } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const TIMED_NOTE_PATTERN = /^(?:(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2})\s+)?(\d{1,2}:\d{2})(?:\s*[-|]\s*)?(.*)$/;
const notes = ref("");

function parseNotesTimeline(notes) {
  return String(notes || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(TIMED_NOTE_PATTERN);
      if (!match) {
        return {
          time: "補充",
          text: line,
          hasTime: false,
        };
      }

      return {
        time: `${match[1] ? `${match[1]} ` : ""}${match[2]}`,
        text: match[3] ? match[3].trim() : line,
        hasTime: true,
      };
    });
}

export function useIncidentNotesTimeline() {
  const entries = computed(() => parseNotesTimeline(notes.value));
  const hasTimeline = computed(() => entries.value.length > 0 && entries.value.some((entry) => entry.hasTime));

  useWindowBridge("__mspIncidentNotesTimeline", {
    getNotes,
    syncNotes,
  }, {
    refresh: "refreshIncidentNotesTimeline",
  });

  return {
    entries,
    getNotes,
    hasTimeline,
    notes,
    syncNotes,
  };
}

function syncNotes(nextNotes) {
  notes.value = String(nextNotes || "");
}

function getNotes() {
  return notes.value;
}

export function getIncidentNotesSnapshot() {
  return getNotes();
}

export function syncIncidentNotesSnapshot(nextNotes = "") {
  syncNotes(nextNotes);
}
