import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const ONCALL_CHECKLIST_STORAGE_PREFIX = "msp_oncall_checklist:";
const PHONE_TEST_NUMBER = "+886800008669";
const PHONE_TEST_POST_CONNECT_KEY = "3";

function getOncallChecklistDateKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
}

function getOncallChecklistStorageKey() {
  return `${ONCALL_CHECKLIST_STORAGE_PREFIX}${getOncallChecklistDateKey()}`;
}

export function useLinksPanel(checklistItems, coreLinks) {
  const panelRef = ref(null);
  const drawerRef = ref(null);
  const isOpen = ref(false);
  const status = reactive({
    message: "",
    type: "",
  });
  const phoneStatus = reactive({
    message: "",
    dialUrl: "",
  });
  const checked = reactive({});

  let statusTimerId = null;

  const checkedCount = computed(() => checklistItems.filter((item) => checked[item.id]).length);
  const checklistMeta = computed(() => `${checkedCount.value} / ${checklistItems.length}`);
  const isChecklistComplete = computed(() => (
    checklistItems.length > 0 && checkedCount.value === checklistItems.length
  ));

  function setChecklistStatus(message, type = "") {
    if (statusTimerId) {
      window.clearTimeout(statusTimerId);
      statusTimerId = null;
    }

    status.message = message || "";
    status.type = type || "";

    if (message) {
      statusTimerId = window.setTimeout(() => {
        status.message = "";
        status.type = "";
      }, 2600);
    }
  }

  function readChecklistState() {
    try {
      const raw = localStorage.getItem(getOncallChecklistStorageKey());
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function persistChecklist(showStatus = false) {
    try {
      localStorage.setItem(getOncallChecklistStorageKey(), JSON.stringify({
        date: getOncallChecklistDateKey(),
        checked: { ...checked },
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      setChecklistStatus(`今日檢查儲存失敗：${error.message}`, "error");
      return;
    }

    if (showStatus) {
      setChecklistStatus("已更新今日值班檢查。", "success");
    }
  }

  function loadChecklistState() {
    const state = readChecklistState();
    const savedChecked = state && state.checked ? state.checked : {};

    checklistItems.forEach((item) => {
      checked[item.id] = Boolean(savedChecked[item.id]);
    });
  }

  function setChecklistItem(itemId, value, showStatus = true) {
    checked[itemId] = Boolean(value);
    persistChecklist(showStatus);
  }

  function markChecklistItem(itemId, showStatus = false) {
    if (checked[itemId]) return false;

    checked[itemId] = true;
    persistChecklist(showStatus);
    return true;
  }

  function resetChecklist() {
    checklistItems.forEach((item) => {
      checked[item.id] = false;
    });
    persistChecklist(false);
    setChecklistStatus("已重置今日值班檢查。", "pending");
  }

  function setPanelOpen(nextOpen) {
    isOpen.value = Boolean(nextOpen);

    if (!isOpen.value && drawerRef.value) {
      drawerRef.value.open = false;
    }
  }

  function togglePanel(forceOpen) {
    setPanelOpen(typeof forceOpen === "boolean" ? forceOpen : !isOpen.value);
  }

  function openCoreLinks() {
    if (!coreLinks.length) {
      window.alert("沒有可開啟的連結");
      return 0;
    }

    coreLinks.forEach((link, index) => {
      window.setTimeout(() => {
        window.open(link.href, "_blank", "noopener,noreferrer");
      }, index * 120);
    });

    markChecklistItem("open-core", false);
    setChecklistStatus(`已開啟 ${coreLinks.length} 個每日值班入口。`, "success");
    return coreLinks.length;
  }

  function startPhoneTestCall() {
    const phone = PHONE_TEST_NUMBER.replace(/\s+/g, "");
    const dialUrl = `tel:${phone}`;

    markChecklistItem("phone-test", false);
    phoneStatus.message = `撥號中：${phone}，接通後按 ${PHONE_TEST_POST_CONNECT_KEY}。`;
    phoneStatus.dialUrl = dialUrl;
    window.location.href = dialUrl;
  }

  function handleDocumentClick(event) {
    if (!isOpen.value) return;
    if (!panelRef.value || panelRef.value.contains(event.target)) return;
    setPanelOpen(false);
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      setPanelOpen(false);
    }
  }

  function exposeLegacyGlobals() {
    window.openCoreLinks = openCoreLinks;
    window.resetOncallChecklist = resetChecklist;
    window.startPhoneTestCall = startPhoneTestCall;
    window.toggleLinksPanel = togglePanel;
  }

  useWindowBridge("__mspLinksPanel", {
    openCoreLinks,
    resetOncallChecklist: resetChecklist,
    startPhoneTestCall,
    toggleLinksPanel: togglePanel,
  });

  onMounted(() => {
    loadChecklistState();
    exposeLegacyGlobals();
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleKeydown);
  });

  onUnmounted(() => {
    if (statusTimerId) {
      window.clearTimeout(statusTimerId);
    }

    document.removeEventListener("click", handleDocumentClick);
    document.removeEventListener("keydown", handleKeydown);
  });

  return {
    checked,
    checklistMeta,
    drawerRef,
    isChecklistComplete,
    isOpen,
    openCoreLinks,
    panelRef,
    phoneStatus,
    resetChecklist,
    setChecklistItem,
    startPhoneTestCall,
    status,
    togglePanel,
  };
}
