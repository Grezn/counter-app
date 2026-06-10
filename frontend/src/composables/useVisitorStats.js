import { onMounted, onUnmounted, reactive } from "vue";
import { getVisitorStats, heartbeatVisitor, recordVisitorView } from "../api/visitorStats";

const VISITOR_STORAGE_KEY = "visitor_id";
const STATS_REFRESH_MS = 30000;
const HEARTBEAT_REFRESH_MS = 15000;

function getVisitorId() {
  let visitorId = localStorage.getItem(VISITOR_STORAGE_KEY);

  if (!visitorId) {
    visitorId = window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(VISITOR_STORAGE_KEY, visitorId);
  }

  return visitorId;
}

function formatDateWithWeekday(value) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return text || "-";

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return text;

  const weekdays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  return `${text}（${weekdays[date.getDay()]}）`;
}

function toDisplayNumber(value) {
  return Number.isFinite(Number(value)) ? String(value) : "-";
}

export function useVisitorStats() {
  const stats = reactive({
    totalVisitors: "-",
    todayVisitors: "-",
    activeVisitors: "-",
    todayLabel: "-",
    status: "loading",
  });

  let statsIntervalId = null;
  let heartbeatIntervalId = null;

  function applyStats(data) {
    stats.totalVisitors = toDisplayNumber(data.totalVisitors);
    stats.todayVisitors = toDisplayNumber(data.todayVisitors);
    stats.activeVisitors = toDisplayNumber(data.activeVisitors);
    stats.todayLabel = formatDateWithWeekday(data.today);
    stats.status = "ready";
  }

  function applyActiveVisitors(data) {
    if (data && data.activeVisitors !== undefined) {
      stats.activeVisitors = toDisplayNumber(data.activeVisitors);
      stats.status = "ready";
    }
  }

  async function trackView() {
    applyStats(await recordVisitorView(getVisitorId()));
  }

  async function loadStats() {
    applyStats(await getVisitorStats());
  }

  async function heartbeatActiveVisitor() {
    applyActiveVisitors(await heartbeatVisitor(getVisitorId()));
  }

  function handleStatsError(error) {
    stats.status = "error";
    console.warn("訪客統計更新失敗：", error.message);
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== "visible") return;

    heartbeatActiveVisitor().catch(handleStatsError);
    loadStats().catch(handleStatsError);
  }

  onMounted(() => {
    trackView().catch((error) => {
      handleStatsError(error);
      loadStats().catch(handleStatsError);
    });

    statsIntervalId = window.setInterval(() => {
      loadStats().catch(handleStatsError);
    }, STATS_REFRESH_MS);

    heartbeatIntervalId = window.setInterval(() => {
      heartbeatActiveVisitor().catch(handleStatsError);
    }, HEARTBEAT_REFRESH_MS);

    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onUnmounted(() => {
    if (statsIntervalId) {
      window.clearInterval(statsIntervalId);
    }

    if (heartbeatIntervalId) {
      window.clearInterval(heartbeatIntervalId);
    }

    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  return {
    stats,
  };
}
