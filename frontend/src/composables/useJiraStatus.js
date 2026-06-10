import { computed, reactive, ref } from "vue";
import { createJiraIssue } from "../api/jira";
import { legacy } from "../legacyBridge";
import { useWindowBridge } from "./useWindowBridge";

const state = reactive({
  linkUrl: "",
  message: "",
  type: "",
});
const isCreating = ref(false);

function syncState(nextState = {}) {
  state.message = String(nextState.message || "");
  state.type = String(nextState.type || "");
  state.linkUrl = String(nextState.linkUrl || "");
}

function setStatus(message, type, linkUrl = "") {
  syncState({
    linkUrl,
    message,
    type,
  });
}

async function createIssueFromCurrentIncident() {
  const draft = legacy("prepareJiraIssueDraft");

  if (!draft || !draft.hasContent) {
    setStatus("先填寫事件內容，再建立 Jira 小卡。", "error");
    return;
  }

  try {
    isCreating.value = true;
    setStatus("正在建立 Jira 小卡...", "pending");

    const issue = await createJiraIssue({
      incident: draft.incident,
      handoverSummary: draft.handoverSummary,
    });

    legacy("markJiraIssueCreated");
    setStatus(`已建立 Jira 小卡：${issue.key}`, "success", issue.url);
  } catch (error) {
    setStatus("建立 Jira 小卡失敗：" + error.message, "error");
  } finally {
    isCreating.value = false;
  }
}

export function useJiraStatus() {
  useWindowBridge("__mspJiraStatus", {
    createIssueFromCurrentIncident,
    syncState,
  }, {
    refresh: "refreshJiraStatus",
  });

  return {
    createIssueFromCurrentIncident,
    hasStatus: computed(() => Boolean(state.message || state.linkUrl)),
    isCreating,
    state,
  };
}
