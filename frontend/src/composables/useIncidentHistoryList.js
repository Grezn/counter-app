import { computed, reactive } from "vue";
import { legacy } from "../legacyBridge";
import { useWindowBridge } from "./useWindowBridge";

const state = reactive({
  emptyText: "事件紀錄載入中...",
  records: [],
});

function normalizeRecord(record = {}) {
  return {
    id: String(record.id || ""),
    isDue: Boolean(record.isDue),
    isReadyToResolve: Boolean(record.isReadyToResolve),
    isResolved: Boolean(record.isResolved),
    meta: String(record.meta || "未分類事件"),
    nextCheckDateTime: String(record.nextCheckDateTime || ""),
    nextCheckLabel: String(record.nextCheckLabel || ""),
    savedTime: String(record.savedTime || ""),
    savedTimeDateTime: String(record.savedTimeDateTime || ""),
    summary: String(record.summary || ""),
    title: String(record.title || "未命名事件"),
    trackingClass: String(record.trackingClass || ""),
    trackingStatus: String(record.trackingStatus || ""),
  };
}

function syncState(nextState = {}) {
  state.emptyText = String(nextState.emptyText || "");
  state.records = Array.isArray(nextState.records)
    ? nextState.records.map(normalizeRecord).filter((record) => record.id)
    : [];
}

function copyRecord(recordId) {
  legacy("copyIncidentRecordSummaryById", recordId);
}

function deleteRecord(recordId) {
  legacy("deleteIncidentRecordById", recordId);
}

function resolveRecord(recordId) {
  legacy("resolveIncidentRecordById", recordId);
}

function restoreRecord(recordId) {
  legacy("restoreIncidentRecordById", recordId);
}

export function useIncidentHistoryList() {
  useWindowBridge("__mspIncidentHistoryList", {
    syncState,
  }, {
    refresh: "refreshIncidentHistoryListState",
  });

  return {
    copyRecord,
    deleteRecord,
    hasRecords: computed(() => state.records.length > 0),
    resolveRecord,
    restoreRecord,
    state,
  };
}
