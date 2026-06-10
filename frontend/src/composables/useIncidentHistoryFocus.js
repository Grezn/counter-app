import { computed, reactive, ref } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const DEFAULT_COUNTS = {
  due: 0,
  missingNextStep: 0,
  open: 0,
  readyToResolve: 0,
  upcoming: 0,
  waiting: 0,
};

const DEFAULT_OPTIONS = [
  { key: "due", label: "待確認", title: "下次確認時間已到或逾期" },
  { key: "upcoming", label: "2 小時內", title: "下次確認時間在 2 小時內" },
  { key: "missingNextStep", label: "缺下一步", title: "仍需追蹤但未填下一步" },
  { key: "waiting", label: "等回覆", title: "正在等待客戶或二線回覆" },
  { key: "readyToResolve", label: "可結案", title: "追蹤狀態已標成可結案" },
];

const state = reactive({
  activeFocus: "",
  counts: { ...DEFAULT_COUNTS },
  options: DEFAULT_OPTIONS,
});

const hasSynced = ref(false);

function normalizeCounts(counts = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_COUNTS).map(([key, defaultValue]) => {
      const value = Number(counts[key]);
      return [key, Number.isFinite(value) ? Math.max(0, value) : defaultValue];
    }),
  );
}

function normalizeOptions(options = DEFAULT_OPTIONS) {
  const normalizedOptions = (options || [])
    .map((option) => ({
      key: String(option.key || "").trim(),
      label: String(option.label || "").trim(),
      title: String(option.title || "").trim(),
    }))
    .filter((option) => option.key && option.label);

  return normalizedOptions.length ? normalizedOptions : DEFAULT_OPTIONS;
}

function syncState(nextState = {}) {
  hasSynced.value = true;
  state.activeFocus = String(nextState.activeFocus || "");
  state.counts = normalizeCounts(nextState.counts);
  state.options = normalizeOptions(nextState.options);
}

export function useIncidentHistoryFocus() {
  useWindowBridge("__mspIncidentHistoryFocus", {
    syncState,
  }, {
    refresh: "refreshIncidentHistoryFocusState",
  });

  return {
    hasFocusData: computed(() => hasSynced.value && state.options.length > 0),
    state,
  };
}
